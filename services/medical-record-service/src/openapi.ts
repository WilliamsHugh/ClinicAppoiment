const error = { description: "Error response", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
const record = { type: "object", required: ["id", "appointmentId", "patientId", "doctorId", "status", "prescription", "createdBy", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string", format: "uuid" }, appointmentId: { type: "string", format: "uuid" },
    patientId: { type: "string", format: "uuid" }, doctorId: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["DRAFT", "FINAL"] }, symptoms: { type: "string" },
    diagnosis: { type: "string" }, notes: { type: "string" }, treatmentPlan: { type: "string" },
    prescription: { type: "array", items: { $ref: "#/components/schemas/PrescriptionItem" } },
    createdBy: { type: "string", format: "uuid" }, updatedBy: { type: "string", format: "uuid" },
    createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" }
  } };
const response = (schema: object) => ({ description: "Success", content: { "application/json": { schema: {
  type: "object", required: ["success", "data"], properties: { success: { type: "boolean", enum: [true] }, data: schema }
} } } });
const id = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
const publicErrors = { "400": error, "401": error, "403": error, "404": error, "409": error, "422": error, "503": error };

export const openapi = {
  openapi: "3.0.3", info: { title: "Medical Record Service", version: "1.0.0" },
  components: { securitySchemes: {
    bearerAuth: { type: "http", scheme: "bearer" },
    internalToken: { type: "apiKey", in: "header", name: "X-Internal-Token" }
  }, schemas: {
    PrescriptionItem: { type: "object", required: ["medicineName", "dosage", "frequency", "duration"],
      properties: Object.fromEntries(["medicineName", "dosage", "frequency", "duration"].map((key) => [key, { type: "string", minLength: 1 }])) },
    MedicalRecord: record,
    Error: { type: "object", required: ["success", "error", "requestId"], properties: {
      success: { type: "boolean", enum: [false] }, requestId: { type: "string" },
      error: { type: "object", required: ["code", "message", "details"], properties: {
        code: { type: "string" }, message: { type: "string" }, details: { type: "array", items: { type: "object" } }
      } }
    } }
  } },
  paths: {
    "/api/v1/medical-records": {
      get: { summary: "List records visible to the actor", security: [{ bearerAuth: [] }],
        parameters: ["page", "limit", "patientId", "doctorId", "appointmentId"].map((name) => ({
          name, in: "query", required: false, schema: name === "page" || name === "limit"
            ? { type: "integer", minimum: 1, maximum: name === "limit" ? 100 : undefined }
            : { type: "string", format: "uuid" } })),
        responses: { "200": response({ type: "object", required: ["items", "page", "limit", "total"], properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/MedicalRecord" } },
          page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" }
        } }), ...publicErrors } },
      post: { summary: "Create a draft or final record for an eligible appointment", security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object",
          required: ["appointmentId", "patientId", "doctorId"], properties: {
            appointmentId: { type: "string", format: "uuid" }, patientId: { type: "string", format: "uuid" },
            doctorId: { type: "string", format: "uuid" }, status: { type: "string", enum: ["DRAFT", "FINAL"] },
            symptoms: { type: "string" }, diagnosis: { type: "string" }, notes: { type: "string" },
            treatmentPlan: { type: "string" }, prescription: { type: "array", items: { $ref: "#/components/schemas/PrescriptionItem" } }
          } } } } },
        responses: { "201": response({ $ref: "#/components/schemas/MedicalRecord" }), ...publicErrors } }
    },
    "/api/v1/medical-records/{id}": {
      get: { summary: "Read an owned record", security: [{ bearerAuth: [] }], parameters: [id],
        responses: { "200": response({ $ref: "#/components/schemas/MedicalRecord" }), ...publicErrors } },
      patch: { summary: "Update clinical fields and audit the change", security: [{ bearerAuth: [] }], parameters: [id],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: {
          status: { type: "string", enum: ["DRAFT", "FINAL"] }, symptoms: { type: "string" },
          diagnosis: { type: "string" }, notes: { type: "string" }, treatmentPlan: { type: "string" },
          prescription: { type: "array", items: { $ref: "#/components/schemas/PrescriptionItem" } }
        } } } } },
        responses: { "200": response({ $ref: "#/components/schemas/MedicalRecord" }), ...publicErrors } }
    },
    "/internal/v1/medical-records/by-appointment/{appointmentId}": {
      get: { summary: "Minimal final-record context for Appointment Service", security: [{ internalToken: [] }],
        parameters: [{ name: "appointmentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": response({ type: "object", required: ["id", "appointmentId", "patientId", "doctorId", "status", "createdBy"],
          properties: { id: { type: "string", format: "uuid" }, appointmentId: { type: "string", format: "uuid" },
            patientId: { type: "string", format: "uuid" }, doctorId: { type: "string", format: "uuid" },
            status: { type: "string", enum: ["DRAFT", "FINAL"] }, createdBy: { type: "string", format: "uuid" },
            updatedBy: { type: "string", format: "uuid" } } }), "401": error, "404": error, "503": error } }
    }
  }
};
