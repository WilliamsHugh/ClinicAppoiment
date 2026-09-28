const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ "application/json": { schema } });
const response = (schema: object, description = "Success") => ({ description, content: json({
  type: "object", required: ["success", "data"], properties: { success: { type: "boolean", enum: [true] }, data: schema }
}) });
const list = (item: object) => response({ type: "object", required: ["items", "page", "limit", "total"], properties: {
  items: { type: "array", items: item }, page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" }
} });
const body = (schema: object) => ({ required: true, content: json(schema) });
const parameter = (name: string, where: "path" | "query", required = where === "path") => ({
  name, in: where, required, schema: { type: "string" }
});
const pageParameters = [parameter("page", "query", false), parameter("limit", "query", false)];
const errors = {
  "400": { description: "Invalid request", content: json(ref("ApiError")) },
  "401": { description: "Missing identity", content: json(ref("ApiError")) },
  "403": { description: "Access denied", content: json(ref("ApiError")) },
  "404": { description: "Resource not found", content: json(ref("ApiError")) },
  "409": { description: "Conflict with an existing resource or appointment", content: json(ref("ApiError")) },
  "422": { description: "Business rule rejected the request", content: json(ref("ApiError")) },
  "502": { description: "Dependent service unavailable", content: json(ref("ApiError")) },
  "503": { description: "Appointment occupancy check is not configured", content: json(ref("ApiError")) }
};
const operation = (summary: string, success: object, options: { parameters?: object[]; requestBody?: object; internal?: boolean } = {}) => ({
  summary, ...(options.parameters ? { parameters: options.parameters } : {}),
  ...(options.requestBody ? { requestBody: options.requestBody } : {}),
  ...(options.internal ? { security: [] } : {}), responses: { "200": success, ...errors }
});

export const doctorOpenApi = {
  openapi: "3.0.3",
  info: { title: "Doctor Service API", version: "1.0.0",
    description: "Public paths are called through Gateway. Gateway verifies the bearer token and forwards X-User-Id and X-Role." },
  security: [{ bearerAuth: [] }],
  paths: {
    "/health": { get: operation("Database health", response({ type: "object" }), { internal: true }) },
    "/api/v1/specialties": {
      get: operation("List specialties", list(ref("Specialty")), { parameters: [...pageParameters, parameter("q", "query", false), parameter("isActive", "query", false)] }),
      post: { ...operation("Create specialty (ADMIN)", response(ref("Specialty")), { requestBody: body(ref("SpecialtyCreate")) }), responses: { "201": response(ref("Specialty")), ...errors } }
    },
    "/api/v1/specialties/{id}": { patch: operation("Update specialty (ADMIN)", response(ref("Specialty")),
      { parameters: [parameter("id", "path")], requestBody: body(ref("SpecialtyUpdate")) }) },
    "/api/v1/doctors": {
      get: operation("List doctors", list(ref("Doctor")), { parameters: [...pageParameters, parameter("q", "query", false), parameter("specialtyId", "query", false), parameter("isActive", "query", false)] }),
      post: { ...operation("Link an active doctor account (ADMIN)", response(ref("Doctor")), { requestBody: body(ref("DoctorCreate")) }), responses: { "201": response(ref("Doctor")), ...errors } }
    },
    "/api/v1/doctors/{id}": {
      get: operation("Get doctor", response(ref("Doctor")), { parameters: [parameter("id", "path")] }),
      patch: operation("Update doctor (ADMIN)", response(ref("Doctor")), { parameters: [parameter("id", "path")], requestBody: body(ref("DoctorUpdate")) })
    },
    "/api/v1/doctors/{id}/schedules": {
      get: operation("List doctor schedules", list(ref("Schedule")), { parameters: [parameter("id", "path"), ...pageParameters] }),
      post: { ...operation("Create a schedule (own DOCTOR, STAFF, ADMIN)", response(ref("Schedule")),
        { parameters: [parameter("id", "path")], requestBody: body(ref("ScheduleCreate")) }), responses: { "201": response(ref("Schedule")), ...errors } }
    },
    "/api/v1/schedules/{id}": { patch: operation("Update schedule without invalidating future appointments", response(ref("Schedule")),
      { parameters: [parameter("id", "path")], requestBody: body(ref("ScheduleUpdate")) }) },
    "/api/v1/doctors/{id}/time-offs": {
      get: operation("List doctor time off (own DOCTOR, STAFF, ADMIN)", list(ref("TimeOff")), { parameters: [parameter("id", "path"), ...pageParameters] }),
      post: { ...operation("Create time off without invalidating appointments", response(ref("TimeOff")),
        { parameters: [parameter("id", "path")], requestBody: body(ref("TimeOffCreate")) }), responses: { "201": response(ref("TimeOff")), ...errors } }
    },
    "/api/v1/time-offs/{id}": { patch: operation("Update time off", response(ref("TimeOff")),
      { parameters: [parameter("id", "path")], requestBody: body(ref("TimeOffUpdate")) }) },
    "/api/v1/doctors/{id}/available-slots": { get: operation("List candidate slots, excluding occupied slots when Appointment integration is configured",
      response({ type: "array", items: ref("Slot") }), { parameters: [parameter("id", "path"), parameter("date", "query")] }) },
    "/internal/v1/doctors/verify-slot": { post: operation("Verify active doctor and exact schedule slot",
      response({ type: "object", required: ["valid"], properties: { valid: { type: "boolean" }, reason: { type: "string" } } }),
      { requestBody: body(ref("VerifySlot")), internal: true }) }
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    schemas: {
      ApiError: { type: "object", required: ["success", "error"], properties: { success: { type: "boolean", enum: [false] },
        error: { type: "object", required: ["code", "message", "details"], properties: {
          code: { type: "string" }, message: { type: "string" }, details: { type: "array", items: {} }
        } } } },
      Specialty: { type: "object", required: ["id", "name", "isActive", "createdAt", "updatedAt"], properties: {
        id: { type: "string", format: "uuid" }, name: { type: "string" }, description: { type: "string", nullable: true },
        isActive: { type: "boolean" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" }
      } },
      Doctor: { type: "object", required: ["id", "userId", "specialtyId", "displayName", "isActive"], properties: {
        id: { type: "string", format: "uuid" }, userId: { type: "string", format: "uuid" }, specialtyId: { type: "string", format: "uuid" },
        displayName: { type: "string" }, bio: { type: "string", nullable: true }, isActive: { type: "boolean" }
      } },
      Schedule: { type: "object", required: ["id", "doctorId", "weekday", "startTime", "endTime", "slotDurationMinutes", "isActive"], properties: {
        id: { type: "string", format: "uuid" }, doctorId: { type: "string", format: "uuid" }, weekday: { type: "integer", minimum: 0, maximum: 6 },
        startTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" }, endTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
        slotDurationMinutes: { type: "integer" }, isActive: { type: "boolean" }
      } },
      TimeOff: { type: "object", required: ["id", "doctorId", "startAt", "endAt"], properties: {
        id: { type: "string", format: "uuid" }, doctorId: { type: "string", format: "uuid" }, startAt: { type: "string", format: "date-time" },
        endAt: { type: "string", format: "date-time" }, reason: { type: "string", nullable: true }
      } },
      Slot: { type: "object", required: ["startAt", "endAt"], properties: {
        startAt: { type: "string", format: "date-time" }, endAt: { type: "string", format: "date-time" }
      } },
      SpecialtyCreate: { type: "object", required: ["name"], properties: { name: { type: "string" }, description: { type: "string" } } },
      SpecialtyUpdate: { type: "object", properties: { name: { type: "string" }, description: { type: "string", nullable: true }, isActive: { type: "boolean" } } },
      DoctorCreate: { type: "object", required: ["userId", "specialtyId", "displayName"], properties: {
        userId: { type: "string", format: "uuid" }, specialtyId: { type: "string", format: "uuid" }, displayName: { type: "string" }, bio: { type: "string" }
      } },
      DoctorUpdate: { type: "object", properties: { specialtyId: { type: "string", format: "uuid" }, displayName: { type: "string" },
        bio: { type: "string", nullable: true }, isActive: { type: "boolean" } } },
      ScheduleCreate: { type: "object", required: ["weekday", "startTime", "endTime", "slotDurationMinutes"], properties: {
        weekday: { type: "integer" }, startTime: { type: "string" }, endTime: { type: "string" }, slotDurationMinutes: { type: "integer" }
      } },
      ScheduleUpdate: { type: "object", properties: { weekday: { type: "integer" }, startTime: { type: "string" },
        endTime: { type: "string" }, slotDurationMinutes: { type: "integer" }, isActive: { type: "boolean" } } },
      TimeOffCreate: { type: "object", required: ["startAt", "endAt"], properties: {
        startAt: { type: "string", format: "date-time" }, endAt: { type: "string", format: "date-time" }, reason: { type: "string", nullable: true }
      } },
      TimeOffUpdate: { type: "object", properties: { startAt: { type: "string", format: "date-time" },
        endAt: { type: "string", format: "date-time" }, reason: { type: "string", nullable: true } } },
      VerifySlot: { type: "object", required: ["doctorId", "startAt", "endAt"], properties: {
        doctorId: { type: "string", format: "uuid" }, startAt: { type: "string", format: "date-time" }, endAt: { type: "string", format: "date-time" }
      } }
  }
}
};
