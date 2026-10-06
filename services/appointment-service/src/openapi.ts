const uuid = { type: "string", format: "uuid" };
const dateTime = { type: "string", format: "date-time" };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const parameter = (name: string, location: "path" | "query" | "header", required = location === "path",
  schema: object = { type: "string" }) => ({ name, in: location, required, schema });
const json = (schema: object, required = true) => ({ required, content: { "application/json": { schema } } });
const response = (schema: object, description = "Success") => ({ description,
  content: { "application/json": { schema: { type: "object", required: ["success", "data"],
    properties: { success: { type: "boolean", enum: [true] }, data: schema } } } } });
const failure = { description: "Standard API error", content: { "application/json": { schema: ref("ApiError") } } };
const errors = { "400": failure, "401": failure, "403": failure, "404": failure,
  "409": failure, "422": failure, "503": failure };
const id = parameter("id", "path", true, uuid);
const transitionBody = json(ref("TransitionRequest"), false);
const transition = (summary: string, roles: string[]) => ({ summary, "x-roles": roles,
  parameters: [id], requestBody: transitionBody, responses: { "200": response(ref("Appointment")), ...errors } });
const pagination = [parameter("page", "query", false, { type: "integer", minimum: 1, maximum: 1_000_000 }),
  parameter("limit", "query", false, { type: "integer", minimum: 1, maximum: 100 })];

export const appointmentOpenApi = {
  openapi: "3.0.3",
  info: { title: "Appointment Service API", version: "0.3.0" },
  security: [{ bearerAuth: [] }],
  paths: {
    "/health": { get: { summary: "Check Appointment database and migration readiness", security: [],
      responses: { "200": response({ type: "object", properties: { service: { type: "string" }, status: { type: "string" } } }),
        "503": failure } } },
    "/api/v1/appointments": {
      get: { summary: "List appointments scoped to the authenticated actor", "x-roles": ["PATIENT", "DOCTOR", "STAFF", "ADMIN"],
        parameters: [...pagination, parameter("patientId", "query", false, uuid), parameter("doctorId", "query", false, uuid),
          parameter("status", "query", false, { type: "string", enum: ["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"] }),
          parameter("from", "query", false, dateTime), parameter("to", "query", false, dateTime)],
        responses: { "200": response(ref("AppointmentPage")), ...errors } },
      post: { summary: "Create a booking with durable idempotency", "x-roles": ["PATIENT", "STAFF", "ADMIN"],
        parameters: [parameter("Idempotency-Key", "header", true, { type: "string", minLength: 1, maxLength: 255 })],
        requestBody: json(ref("CreateAppointmentRequest")),
        responses: { "201": response(ref("Appointment"), "Created"),
          "200": response(ref("Appointment"), "Exact idempotency replay"), ...errors } }
    },
    "/api/v1/appointments/{id}": { get: { summary: "Get an appointment visible to the authenticated actor",
      "x-roles": ["PATIENT", "DOCTOR", "STAFF", "ADMIN"], parameters: [id],
      responses: { "200": response(ref("Appointment")), ...errors } } },
    "/api/v1/appointments/{id}/reschedule": { patch: { summary: "Reschedule a future PENDING or CONFIRMED booking",
      "x-roles": ["PATIENT", "STAFF", "ADMIN"], parameters: [id],
      requestBody: json(ref("RescheduleRequest")), responses: { "200": response(ref("Appointment")), ...errors } } },
    "/api/v1/appointments/{id}/cancel": { patch: transition("Cancel a PENDING or CONFIRMED booking", ["PATIENT", "STAFF", "ADMIN"]) },
    "/api/v1/appointments/{id}/confirm": { patch: transition("Confirm a PENDING booking", ["STAFF", "ADMIN"]) },
    "/api/v1/appointments/{id}/check-in": { patch: transition("Check in a CONFIRMED booking", ["STAFF", "ADMIN"]) },
    "/api/v1/appointments/{id}/complete": { patch: { summary: "Deprecated: completion requires a final Medical Record", deprecated: true,
      "x-roles": ["DOCTOR"], parameters: [id], responses: { "409": failure, "401": failure, "403": failure } } },
    "/api/v1/appointments/{id}/no-show": { patch: transition("Mark a CONFIRMED booking as no-show", ["STAFF", "ADMIN"]) },
    "/internal/v1/appointments/occupied-slots": { get: { summary: "List active occupied doctor slots",
      security: [{ internalToken: [] }], parameters: [parameter("doctorId", "query", true, uuid), parameter("from", "query", true, dateTime),
        parameter("to", "query", false, dateTime)],
      responses: { "200": response({ type: "array", items: ref("OccupiedSlot") }), "400": failure, "401": failure, "503": failure } } },
    "/internal/v1/appointments/{id}/verify-for-medical-record": { get: { summary: "Read appointment state for Medical Record Service",
      security: [{ internalToken: [] }], parameters: [id], responses: { "200": response({ type: "object", required: ["valid", "appointment"],
        properties: { valid: { type: "boolean" }, appointment: ref("AppointmentContext") } }), "400": failure, "401": failure, "404": failure, "503": failure } } },
    "/internal/v1/appointments/{id}/patient-scope": { get: {
      summary: "Read minimal appointment scope for User Service doctor patient-scope checks",
      security: [{ internalToken: [] }], "x-internal-caller": "User Service",
      "x-token-env": "APPOINTMENT_USER_INTERNAL_API_TOKEN", parameters: [id],
      responses: { "200": response(ref("PatientScopeContext")),
        "400": failure, "401": failure, "404": failure, "503": failure } } },
    "/internal/v1/appointments/{id}/reminder-context": { get: {
      summary: "Read minimal appointment context for Notification reminders", security: [{ internalToken: [] }],
      parameters: [id], responses: { "200": response(ref("ReminderContext")), ...errors } } },
    "/internal/v1/appointments/{id}/complete-from-record": { post: {
      summary: "Complete a checked-in appointment from a verified final Medical Record", security: [{ internalToken: [] }],
      parameters: [id], requestBody: json({ type: "object", required: ["recordId"], additionalProperties: false,
        properties: { recordId: uuid } }),
      responses: { "200": response({ type: "object", required: ["id", "status", "recordId"],
        properties: { id: uuid, status: { type: "string", enum: ["COMPLETED"] }, recordId: uuid } }), ...errors } } }
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT",
      description: "Verified by API Gateway; service receives trusted actor context" },
      internalToken: { type: "apiKey", in: "header", name: "X-Internal-Token",
        description: "Service-specific token; Doctor, User, Medical Record, and Notification use distinct credentials" } },
    schemas: {
      ApiError: { type: "object", required: ["success", "error"], properties: {
        success: { type: "boolean", enum: [false] }, error: { type: "object", required: ["code", "message", "details"],
          properties: { code: { type: "string" }, message: { type: "string" }, details: { type: "array", items: {} } } } } },
      Appointment: { type: "object", required: ["id", "patientId", "doctorId", "scheduledStartAt", "scheduledEndAt", "status", "createdBy"],
        properties: { id: uuid, patientId: uuid, doctorId: uuid, specialtyId: uuid,
          scheduledStartAt: dateTime, scheduledEndAt: dateTime, reason: { type: "string" },
          status: { type: "string", enum: ["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"] },
          createdBy: uuid, updatedBy: uuid, createdAt: dateTime, updatedAt: dateTime } },
      AppointmentPage: { type: "object", required: ["items", "page", "limit", "total"], properties: {
        items: { type: "array", items: ref("Appointment") }, page: { type: "integer" },
        limit: { type: "integer" }, total: { type: "integer" } } },
      CreateAppointmentRequest: { type: "object", required: ["doctorId", "scheduledStartAt", "scheduledEndAt"],
        properties: { patientId: uuid, doctorId: uuid, specialtyId: uuid,
          scheduledStartAt: dateTime, scheduledEndAt: dateTime, reason: { type: "string" } } },
      RescheduleRequest: { type: "object", required: ["scheduledStartAt", "scheduledEndAt"], additionalProperties: false,
        properties: { scheduledStartAt: dateTime, scheduledEndAt: dateTime, reason: { type: "string", maxLength: 500 } } },
      TransitionRequest: { type: "object", additionalProperties: false,
        properties: { reason: { type: "string", maxLength: 500 } } },
      OccupiedSlot: { type: "object", required: ["startAt", "endAt"],
        properties: { startAt: dateTime, endAt: dateTime } },
      AppointmentContext: { type: "object", required: ["id", "patientId", "doctorId", "status"],
        properties: { id: uuid, patientId: uuid, doctorId: uuid, status: { type: "string" } } },
      PatientScopeContext: { type: "object", required: ["id", "patientId", "doctorId", "status"],
        properties: { id: uuid, patientId: uuid, doctorId: uuid,
          status: { type: "string", enum: ["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"] } } },
      ReminderContext: { type: "object", required: ["id", "patientId", "status", "scheduledStartAt"],
        properties: { id: uuid, patientId: uuid, status: { type: "string" }, scheduledStartAt: dateTime } }
    }
  }
};
