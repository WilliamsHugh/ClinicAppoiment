const bearerSecurity = [{ bearerAuth: [] }];
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ "application/json": { schema } });
const id = (name: string) => ({ name, in: "path", required: true, schema: { type: "string" } });
const pagination = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } }
];

type OperationOptions = {
  secured?: boolean;
  created?: boolean;
  response?: object;
  body?: object;
  parameters?: object[];
  conflict?: boolean;
  unprocessable?: boolean;
};

function operation(summary: string, tags: string[], options: OperationOptions = {}) {
  const secured = options.secured ?? true;
  const status = options.created ? "201" : "200";
  return {
    summary,
    tags,
    ...(secured ? { security: bearerSecurity } : {}),
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.body ? { requestBody: { required: true, content: json(options.body) } } : {}),
    responses: {
      [status]: { description: options.created ? "Resource created" : "Successful response", content: json(options.response ?? ref("SuccessEnvelope")) },
      ...(options.body ? { "400": { $ref: "#/components/responses/BadRequest" } } : {}),
      ...(options.conflict ? { "409": { $ref: "#/components/responses/Conflict" } } : {}),
      ...(options.unprocessable ? { "422": { $ref: "#/components/responses/Unprocessable" } } : {}),
      ...(secured ? {
        "401": { $ref: "#/components/responses/Unauthorized" },
        "403": { $ref: "#/components/responses/Forbidden" },
        "429": { $ref: "#/components/responses/RateLimited" },
        "502": { $ref: "#/components/responses/BadGateway" },
        "503": { $ref: "#/components/responses/ServiceUnavailable" }
      } : {})
    }
  };
}

function list(summary: string, tags: string[], item: object, filters: object[] = [], parameters: object[] = []) {
  return operation(summary, tags, {
    parameters: [...parameters, ...pagination, ...filters],
    response: {
      allOf: [ref("SuccessEnvelope"), {
        type: "object",
        properties: { data: { allOf: [ref("PageData"), { properties: { items: { type: "array", items: item } } }] } }
      }]
    }
  });
}

const appointmentId = id("appointmentId");
const recordId = id("recordId");
const transitionBody = { type: "object", properties: { reason: { type: "string" } }, additionalProperties: false };

export const gatewayOpenApiDocument = {
  openapi: "3.0.3",
  info: { title: "Clinic Appointment API Gateway", version: "1.0.0", description: "Public API contract exposed to Patient App and Clinic Management Web." },
  servers: [{ url: "http://localhost:8080", description: "Local development" }],
  tags: ["System", "Auth", "Users", "Doctors", "Appointments", "Medical Records", "Notifications"].map((name) => ({ name })),
  paths: {
    "/health": { get: operation("Gateway liveness", ["System"], { secured: false, response: ref("HealthResponse") }) },
    "/api/v1/system/health": { get: operation("Aggregate service health", ["System"], { response: ref("SystemHealthResponse") }) },
    "/api/v1/auth/me": { get: operation("Resolve current application profile", ["Auth"], { response: ref("UserResponse") }) },
    "/api/v1/users/me": {
      get: operation("Get current user profile", ["Users"], { response: ref("UserResponse") }),
      patch: operation("Update current user profile", ["Users"], { body: ref("UpdateOwnProfileRequest"), response: ref("UserResponse") })
    },
    "/api/v1/users": { get: list("List users", ["Users"], ref("User"), [
      { name: "role", in: "query", schema: ref("Role") }, { name: "status", in: "query", schema: ref("UserStatus") }, { name: "q", in: "query", schema: { type: "string" } }
    ]) },
    "/api/v1/users/{userId}": { get: operation("Get a user", ["Users"], { parameters: [id("userId")], response: ref("UserResponse") }) },
    "/api/v1/users/{userId}/status": { patch: operation("Update user status", ["Users"], { parameters: [id("userId")], body: ref("UpdateUserStatusRequest"), response: ref("UserResponse") }) },
    "/api/v1/users/{userId}/role": { patch: operation("Update user role", ["Users"], { parameters: [id("userId")], body: ref("UpdateUserRoleRequest"), response: ref("UserResponse") }) },
    "/api/v1/patients": { get: list("List patients", ["Users"], ref("Patient"), [{ name: "q", in: "query", schema: { type: "string" } }]) },
    "/api/v1/patients/{patientId}": {
      get: operation("Get a patient profile", ["Users"], { parameters: [id("patientId")], response: ref("PatientResponse") }),
      patch: operation("Update a patient profile", ["Users"], { parameters: [id("patientId")], body: ref("UpdatePatientRequest"), response: ref("PatientResponse") })
    },
    "/api/v1/specialties": {
      get: list("List specialties", ["Doctors"], ref("Specialty"), [{ name: "q", in: "query", schema: { type: "string" } }, { name: "isActive", in: "query", schema: { type: "boolean" } }]),
      post: operation("Create specialty", ["Doctors"], { created: true, body: ref("CreateSpecialtyRequest"), response: ref("SpecialtyResponse") })
    },
    "/api/v1/specialties/{specialtyId}": { patch: operation("Update specialty", ["Doctors"], { parameters: [id("specialtyId")], body: ref("UpdateSpecialtyRequest"), response: ref("SpecialtyResponse") }) },
    "/api/v1/doctors": {
      get: list("List doctors", ["Doctors"], ref("Doctor"), [
        { name: "specialtyId", in: "query", schema: { type: "string" } }, { name: "q", in: "query", schema: { type: "string" } }, { name: "isActive", in: "query", schema: { type: "boolean" } }
      ]),
      post: operation("Create doctor", ["Doctors"], { created: true, body: ref("CreateDoctorRequest"), response: ref("DoctorResponse") })
    },
    "/api/v1/doctors/{doctorId}": {
      get: operation("Get doctor details", ["Doctors"], { parameters: [id("doctorId")], response: ref("DoctorResponse") }),
      patch: operation("Update doctor", ["Doctors"], { parameters: [id("doctorId")], body: ref("UpdateDoctorRequest"), response: ref("DoctorResponse") })
    },
    "/api/v1/doctors/{doctorId}/schedules": {
      get: list("List doctor schedules", ["Doctors"], ref("Schedule"), [], [id("doctorId")]),
      post: operation("Create doctor schedule", ["Doctors"], { created: true, parameters: [id("doctorId")], body: ref("ScheduleRequest"), response: ref("ScheduleResponse") })
    },
    "/api/v1/schedules/{scheduleId}": { patch: operation("Update doctor schedule", ["Doctors"], { parameters: [id("scheduleId")], body: ref("ScheduleRequest"), response: ref("ScheduleResponse") }) },
    "/api/v1/doctors/{doctorId}/available-slots": { get: operation("List available appointment slots", ["Doctors"], {
      parameters: [id("doctorId"), { name: "date", in: "query", required: true, schema: { type: "string", format: "date" } }], response: ref("AvailableSlotsResponse")
    }) },
    "/api/v1/appointments": {
      get: list("List appointments visible to current actor", ["Appointments"], ref("Appointment"), [
        { name: "patientId", in: "query", schema: { type: "string" } }, { name: "doctorId", in: "query", schema: { type: "string" } },
        { name: "status", in: "query", schema: ref("AppointmentStatus") }, { name: "from", in: "query", schema: { type: "string", format: "date-time" } }, { name: "to", in: "query", schema: { type: "string", format: "date-time" } }
      ]),
      post: operation("Create an appointment", ["Appointments"], { created: true, conflict: true, unprocessable: true, parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 16 } }], body: ref("CreateAppointmentRequest"), response: ref("AppointmentResponse") })
    },
    "/api/v1/appointments/{appointmentId}": { get: operation("Get an appointment", ["Appointments"], { parameters: [appointmentId], response: ref("AppointmentResponse") }) },
    "/api/v1/appointments/{appointmentId}/reschedule": { patch: operation("Reschedule an appointment", ["Appointments"], { conflict: true, unprocessable: true, parameters: [appointmentId], body: ref("RescheduleAppointmentRequest"), response: ref("AppointmentResponse") }) },
    "/api/v1/appointments/{appointmentId}/cancel": { patch: operation("Cancel an appointment", ["Appointments"], { conflict: true, parameters: [appointmentId], body: transitionBody, response: ref("AppointmentResponse") }) },
    "/api/v1/appointments/{appointmentId}/confirm": { patch: operation("Confirm an appointment", ["Appointments"], { conflict: true, parameters: [appointmentId], body: transitionBody, response: ref("AppointmentResponse") }) },
    "/api/v1/appointments/{appointmentId}/check-in": { patch: operation("Check in a patient", ["Appointments"], { conflict: true, parameters: [appointmentId], body: transitionBody, response: ref("AppointmentResponse") }) },
    "/api/v1/appointments/{appointmentId}/complete": { patch: operation("Complete an appointment", ["Appointments"], { conflict: true, parameters: [appointmentId], body: transitionBody, response: ref("AppointmentResponse") }) },
    "/api/v1/appointments/{appointmentId}/no-show": { patch: operation("Mark an appointment as no-show", ["Appointments"], { conflict: true, parameters: [appointmentId], body: transitionBody, response: ref("AppointmentResponse") }) },
    "/api/v1/medical-records": {
      get: list("List medical records visible to current actor", ["Medical Records"], ref("MedicalRecord"), [
        { name: "patientId", in: "query", schema: { type: "string" } }, { name: "doctorId", in: "query", schema: { type: "string" } }, { name: "appointmentId", in: "query", schema: { type: "string" } }
      ]),
      post: operation("Create a medical record", ["Medical Records"], { created: true, body: ref("MedicalRecordRequest"), response: ref("MedicalRecordResponse") })
    },
    "/api/v1/medical-records/{recordId}": {
      get: operation("Get a medical record", ["Medical Records"], { parameters: [recordId], response: ref("MedicalRecordResponse") }),
      patch: operation("Update a medical record", ["Medical Records"], { parameters: [recordId], body: ref("MedicalRecordRequest"), response: ref("MedicalRecordResponse") })
    },
    "/api/v1/notifications": { get: list("List current user's notifications", ["Notifications"], ref("Notification"), [{ name: "status", in: "query", schema: { type: "string", enum: ["UNREAD", "READ", "FAILED"] } }]) },
    "/api/v1/notifications/{notificationId}": { get: operation("Get a notification", ["Notifications"], { parameters: [id("notificationId")], response: ref("NotificationResponse") }) },
    "/api/v1/notifications/{notificationId}/read": { patch: operation("Mark a notification as read", ["Notifications"], { parameters: [id("notificationId")], body: { type: "object", additionalProperties: false }, response: ref("NotificationResponse") }) }
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    schemas: {
      Role: { type: "string", enum: ["PATIENT", "DOCTOR", "STAFF", "ADMIN"] },
      UserStatus: { type: "string", enum: ["ACTIVE", "INACTIVE", "LOCKED"] },
      AppointmentStatus: { type: "string", enum: ["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"] },
      ApiError: { type: "object", required: ["success", "error", "requestId"], properties: {
        success: { type: "boolean", enum: [false] }, error: { type: "object", required: ["code", "message", "details"], properties: { code: { type: "string" }, message: { type: "string" }, details: { type: "array", items: {} } } }, requestId: { type: "string" }
      } },
      SuccessEnvelope: { type: "object", required: ["success", "data"], properties: { success: { type: "boolean", enum: [true] }, data: {}, requestId: { type: "string" } } },
      PageData: { type: "object", required: ["items", "page", "limit", "total"], properties: { items: { type: "array", items: {} }, page: { type: "integer", minimum: 1 }, limit: { type: "integer", minimum: 1, maximum: 100 }, total: { type: "integer", minimum: 0 } } },
      Timestamps: { type: "object", properties: { createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } } },
      User: { allOf: [ref("Timestamps"), { type: "object", required: ["id", "email", "fullName", "role", "status"], properties: { id: { type: "string" }, email: { type: "string", format: "email" }, fullName: { type: "string" }, phone: { type: "string" }, role: ref("Role"), status: ref("UserStatus") } }] },
      Patient: { allOf: [ref("Timestamps"), { type: "object", required: ["id", "userId"], properties: { id: { type: "string" }, userId: { type: "string" }, dateOfBirth: { type: "string", format: "date" }, gender: { type: "string" }, address: { type: "string" }, emergencyContact: { type: "string" }, insuranceNumber: { type: "string" } } }] },
      Specialty: { type: "object", required: ["id", "name"], properties: { id: { type: "string" }, name: { type: "string" }, description: { type: "string" }, isActive: { type: "boolean" } } },
      Doctor: { type: "object", required: ["id", "userId", "specialtyId", "displayName"], properties: { id: { type: "string" }, userId: { type: "string" }, specialtyId: { type: "string" }, displayName: { type: "string" }, bio: { type: "string" }, isActive: { type: "boolean" } } },
      Schedule: { type: "object", required: ["id", "doctorId", "weekday", "startTime", "endTime", "slotDurationMinutes"], properties: { id: { type: "string" }, doctorId: { type: "string" }, weekday: { type: "integer", minimum: 0, maximum: 6 }, startTime: { type: "string" }, endTime: { type: "string" }, slotDurationMinutes: { type: "integer", minimum: 1 } } },
      Appointment: { allOf: [ref("Timestamps"), { type: "object", required: ["id", "patientId", "doctorId", "scheduledStartAt", "scheduledEndAt", "status"], properties: { id: { type: "string" }, patientId: { type: "string" }, doctorId: { type: "string" }, specialtyId: { type: "string" }, scheduledStartAt: { type: "string", format: "date-time" }, scheduledEndAt: { type: "string", format: "date-time" }, reason: { type: "string" }, status: ref("AppointmentStatus") } }] },
      PrescriptionItem: { type: "object", required: ["medicineName", "dosage", "frequency", "duration"], properties: { medicineName: { type: "string" }, dosage: { type: "string" }, frequency: { type: "string" }, duration: { type: "string" } } },
      MedicalRecord: { allOf: [ref("Timestamps"), { type: "object", required: ["id", "appointmentId", "patientId", "doctorId", "prescription", "status", "createdBy"], properties: { id: { type: "string" }, appointmentId: { type: "string" }, patientId: { type: "string" }, doctorId: { type: "string" }, symptoms: { type: "string" }, diagnosis: { type: "string" }, notes: { type: "string" }, treatmentPlan: { type: "string" }, prescription: { type: "array", items: ref("PrescriptionItem") }, status: { type: "string", enum: ["DRAFT", "FINAL"] }, createdBy: { type: "string" }, updatedBy: { type: "string" } } }] },
      Notification: { type: "object", required: ["id", "recipientUserId", "type", "title", "message", "status", "createdAt"], properties: { id: { type: "string" }, recipientUserId: { type: "string" }, type: { type: "string" }, title: { type: "string" }, message: { type: "string" }, payload: { type: "object" }, status: { type: "string", enum: ["UNREAD", "READ", "FAILED"] }, readAt: { type: "string", format: "date-time" }, createdAt: { type: "string", format: "date-time" } } },
      UpdateOwnProfileRequest: { type: "object", properties: { fullName: { type: "string" }, phone: { type: "string" } }, additionalProperties: false },
      UpdateUserStatusRequest: { type: "object", required: ["status"], properties: { status: ref("UserStatus") }, additionalProperties: false },
      UpdateUserRoleRequest: { type: "object", required: ["role"], properties: { role: ref("Role") }, additionalProperties: false },
      UpdatePatientRequest: { type: "object", properties: { dateOfBirth: { type: "string", format: "date" }, gender: { type: "string" }, address: { type: "string" }, emergencyContact: { type: "string" }, insuranceNumber: { type: "string" } }, additionalProperties: false },
      CreateSpecialtyRequest: { type: "object", required: ["name"], properties: { name: { type: "string" }, description: { type: "string" } }, additionalProperties: false },
      UpdateSpecialtyRequest: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, isActive: { type: "boolean" } }, additionalProperties: false },
      CreateDoctorRequest: { type: "object", required: ["userId", "specialtyId", "displayName"], properties: { userId: { type: "string" }, specialtyId: { type: "string" }, displayName: { type: "string" }, bio: { type: "string" } }, additionalProperties: false },
      UpdateDoctorRequest: { type: "object", properties: { specialtyId: { type: "string" }, displayName: { type: "string" }, bio: { type: "string" }, isActive: { type: "boolean" } }, additionalProperties: false },
      ScheduleRequest: { type: "object", required: ["weekday", "startTime", "endTime", "slotDurationMinutes"], properties: { weekday: { type: "integer", minimum: 0, maximum: 6 }, startTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" }, endTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" }, slotDurationMinutes: { type: "integer", minimum: 1 } }, additionalProperties: false },
      CreateAppointmentRequest: { type: "object", required: ["doctorId", "scheduledStartAt", "scheduledEndAt"], properties: { patientId: { type: "string" }, doctorId: { type: "string" }, specialtyId: { type: "string" }, scheduledStartAt: { type: "string", format: "date-time" }, scheduledEndAt: { type: "string", format: "date-time" }, reason: { type: "string" } }, additionalProperties: false },
      RescheduleAppointmentRequest: { type: "object", required: ["scheduledStartAt", "scheduledEndAt"], properties: { scheduledStartAt: { type: "string", format: "date-time" }, scheduledEndAt: { type: "string", format: "date-time" }, reason: { type: "string" } }, additionalProperties: false },
      MedicalRecordRequest: { type: "object", required: ["appointmentId", "patientId", "doctorId"], properties: { appointmentId: { type: "string" }, patientId: { type: "string" }, doctorId: { type: "string" }, symptoms: { type: "string" }, diagnosis: { type: "string" }, notes: { type: "string" }, treatmentPlan: { type: "string" }, prescription: { type: "array", items: ref("PrescriptionItem") }, status: { type: "string", enum: ["DRAFT", "FINAL"] } }, additionalProperties: false },
      HealthResponse: {
        allOf: [ref("SuccessEnvelope"), { type: "object", properties: {
          data: { type: "object", required: ["service", "status"], properties: {
            service: { type: "string", enum: ["api-gateway"] }, status: { type: "string", enum: ["ok"] }
          } }
        } }]
      },
      SystemHealthResponse: {
        allOf: [ref("SuccessEnvelope"), { type: "object", properties: {
          data: { type: "object", required: ["gateway", "status", "services"], properties: {
            gateway: { type: "string", enum: ["ok"] }, status: { type: "string", enum: ["ok", "degraded"] },
            services: { type: "object", additionalProperties: { type: "string", enum: ["ok", "unavailable"] } }
          } }
        } }]
      },
      AvailableSlotsResponse: {
        allOf: [ref("SuccessEnvelope"), { type: "object", properties: {
          data: { type: "array", items: { type: "object", required: ["startAt", "endAt"], properties: {
            startAt: { type: "string", format: "date-time" }, endAt: { type: "string", format: "date-time" }
          } }
        } } }]
      },
      UserResponse: { allOf: [ref("SuccessEnvelope"), { properties: { data: ref("User") } }] }, PatientResponse: { allOf: [ref("SuccessEnvelope"), { properties: { data: ref("Patient") } }] },
      SpecialtyResponse: { allOf: [ref("SuccessEnvelope"), { properties: { data: ref("Specialty") } }] }, DoctorResponse: { allOf: [ref("SuccessEnvelope"), { properties: { data: ref("Doctor") } }] },
      ScheduleResponse: { allOf: [ref("SuccessEnvelope"), { properties: { data: ref("Schedule") } }] }, AppointmentResponse: { allOf: [ref("SuccessEnvelope"), { properties: { data: ref("Appointment") } }] },
      MedicalRecordResponse: { allOf: [ref("SuccessEnvelope"), { properties: { data: ref("MedicalRecord") } }] }, NotificationResponse: { allOf: [ref("SuccessEnvelope"), { properties: { data: ref("Notification") } }] }
    },
    responses: {
      BadRequest: { description: "Invalid request", content: json(ref("ApiError")) }, Unauthorized: { description: "Missing or invalid access token", content: json(ref("ApiError")) },
      Forbidden: { description: "Authenticated actor is not allowed to perform this operation", content: json(ref("ApiError")) }, RateLimited: { description: "Rate limit exceeded", content: json(ref("ApiError")) },
      Conflict: { description: "State, slot, or idempotency conflict", content: json(ref("ApiError")) }, Unprocessable: { description: "Business rule validation failed", content: json(ref("ApiError")) },
      BadGateway: { description: "Upstream service unavailable, timed out, or returned an invalid response", content: json(ref("ApiError")) }, ServiceUnavailable: { description: "Authentication dependency is unavailable", content: json(ref("ApiError")) }
    }
  }
} as const;
