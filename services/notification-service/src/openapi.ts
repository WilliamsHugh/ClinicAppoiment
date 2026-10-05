const error = { description: "Error response", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
const response = (schema: object) => ({ description: "Success", content: { "application/json": { schema: {
  type: "object", required: ["success", "data"], properties: { success: { type: "boolean", enum: [true] }, data: schema }
} } } });
const id = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
const publicErrors = { "400": error, "401": error, "403": error, "404": error, "503": error };

export const openapi = {
  openapi: "3.0.3", info: { title: "Notification Service", version: "1.0.0" },
  components: { securitySchemes: {
    bearerAuth: { type: "http", scheme: "bearer" },
    internalToken: { type: "apiKey", in: "header", name: "X-Internal-Token" }
  }, schemas: {
    Notification: { type: "object", required: ["id", "recipientUserId", "type", "title", "message", "status", "createdAt"],
      properties: { id: { type: "string", format: "uuid" }, recipientUserId: { type: "string", format: "uuid" },
        type: { type: "string" }, title: { type: "string" }, message: { type: "string" },
        payload: { type: "object" }, status: { type: "string", enum: ["UNREAD", "READ", "FAILED"] },
        readAt: { type: "string", format: "date-time" }, createdAt: { type: "string", format: "date-time" } } },
    Error: { type: "object", required: ["success", "error", "requestId"], properties: {
      success: { type: "boolean", enum: [false] }, requestId: { type: "string" },
      error: { type: "object", required: ["code", "message", "details"], properties: {
        code: { type: "string" }, message: { type: "string" }, details: { type: "array", items: { type: "object" } }
      } }
    } }
  } },
  paths: {
    "/api/v1/notifications": {
      get: { summary: "List the actor's notifications", security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          { name: "status", in: "query", schema: { type: "string", enum: ["UNREAD", "READ", "FAILED"] } }
        ], responses: { "200": response({ type: "object", required: ["items", "page", "limit", "total"],
          properties: { items: { type: "array", items: { $ref: "#/components/schemas/Notification" } },
            page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" } } }), ...publicErrors } }
    },
    "/api/v1/notifications/{id}": { get: { summary: "Read an owned notification", security: [{ bearerAuth: [] }],
      parameters: [id], responses: { "200": response({ $ref: "#/components/schemas/Notification" }), ...publicErrors } } },
    "/api/v1/notifications/{id}/read": { patch: { summary: "Mark an owned notification as read",
      security: [{ bearerAuth: [] }], parameters: [id],
      responses: { "200": response({ $ref: "#/components/schemas/Notification" }), ...publicErrors } } },
    "/internal/v1/notifications": { post: { summary: "Ingest an idempotent backend event",
      security: [{ internalToken: [] }],
      requestBody: { required: true, content: { "application/json": { schema: { type: "object",
        required: ["eventId", "type", "payload"], properties: {
          eventId: { type: "string", minLength: 1 },
          type: { type: "string", enum: ["appointment.created", "appointment.confirmed", "appointment.rescheduled",
            "appointment.cancelled", "appointment.checked_in", "medical-record.created", "medical-record.updated"] },
          payload: { type: "object", required: ["recipientUserId"], properties: {
            recipientUserId: { type: "string", format: "uuid" }, patientId: { type: "string", format: "uuid" },
            appointmentId: { type: "string", format: "uuid" }, recordId: { type: "string", format: "uuid" },
            scheduledStartAt: { type: "string", format: "date-time" }
          } }
        } } } } },
      responses: { "201": response({ $ref: "#/components/schemas/Notification" }),
        "200": response({ type: "object", properties: { dedup: { type: "boolean" }, eventId: { type: "string" } } }),
        "400": error, "401": error, "503": error } } },
    "/internal/v1/notifications/{id}/retry": { post: { summary: "Retry a failed delivery for an authorized backend caller",
      security: [{ internalToken: [] }], parameters: [id],
      responses: { "200": response({ type: "object", properties: { id: { type: "string", format: "uuid" },
        retryCount: { type: "integer" } } }), "401": error, "409": error, "503": error } } }
  }
};
