const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ "application/json": { schema } });

const publicPost = (summary: string, body: string, response: string, status = "200") => ({
  summary,
  tags: ["Auth"],
  requestBody: { required: true, content: json(ref(body)) },
  responses: {
    [status]: { description: "Successful response", content: json(ref(response)) },
    "400": { $ref: "#/components/responses/BadRequest" },
    "429": { $ref: "#/components/responses/RateLimited" },
    "503": { $ref: "#/components/responses/ServiceUnavailable" }
  }
});

export const gatewayOpenApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Health&Human API Gateway",
    version: "1.0.0",
    description: "Gateway-owned platform endpoints. Business contracts are owned by each service and documented in docs/api-contract.md plus each service OpenAPI document."
  },
  servers: [{ url: "http://localhost:8080", description: "Local development" }],
  tags: [{ name: "System" }, { name: "Auth" }],
  paths: {
    "/health": {
      get: {
        summary: "Gateway liveness",
        tags: ["System"],
        responses: { "200": { description: "Gateway is running", content: json(ref("HealthResponse")) } }
      }
    },
    "/api/v1/system/health": {
      get: {
        summary: "Aggregate service health",
        tags: ["System"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Aggregate health", content: json(ref("SuccessEnvelope")) },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" }
        }
      }
    },
    "/api/v1/auth/login": {
      post: publicPost("Sign in through API Gateway", "LoginRequest", "AuthSessionResponse")
    },
    "/api/v1/auth/register": {
      post: publicPost("Register through API Gateway", "RegisterRequest", "AuthSessionResponse", "201")
    },
    "/api/v1/auth/refresh": {
      post: publicPost("Refresh an authentication session", "RefreshRequest", "AuthSessionResponse")
    },
    "/api/v1/auth/logout": {
      post: {
        ...publicPost("Revoke an authentication session", "RefreshRequest", "SuccessEnvelope"),
        security: [{ bearerAuth: [] }]
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }
    },
    schemas: {
      Role: { type: "string", enum: ["PATIENT", "DOCTOR", "STAFF", "ADMIN"] },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 6, maxLength: 128 }
        },
        additionalProperties: false
      },
      RegisterRequest: {
        type: "object",
        required: ["fullName", "email", "password"],
        properties: {
          fullName: { type: "string", minLength: 2, maxLength: 120 },
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 6, maxLength: 128 }
        },
        additionalProperties: false
      },
      RefreshRequest: {
        type: "object",
        required: ["refreshToken"],
        properties: { refreshToken: { type: "string", minLength: 1 } },
        additionalProperties: false
      },
      AuthSessionResponse: {
        type: "object",
        required: ["success", "data"],
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            required: ["accessToken", "refreshToken", "expiresIn", "user"],
            properties: {
              accessToken: { type: "string" },
              refreshToken: { type: "string" },
              expiresIn: { type: "integer" },
              requiresEmailConfirmation: { type: "boolean" },
              user: {
                type: "object",
                required: ["id", "role"],
                properties: { id: { type: "string" }, role: ref("Role") }
              }
            }
          },
          requestId: { type: "string" }
        }
      },
      SuccessEnvelope: {
        type: "object",
        required: ["success", "data"],
        properties: { success: { type: "boolean", enum: [true] }, data: {}, requestId: { type: "string" } }
      },
      ApiError: {
        type: "object",
        required: ["success", "error"],
        properties: {
          success: { type: "boolean", enum: [false] },
          error: {
            type: "object",
            required: ["code", "message", "details"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: { type: "array", items: {} }
            }
          },
          requestId: { type: "string" }
        }
      },
      HealthResponse: {
        type: "object",
        required: ["success", "data"],
        properties: {
          success: { type: "boolean", enum: [true] },
          data: {
            type: "object",
            required: ["service", "status"],
            properties: {
              service: { type: "string", enum: ["api-gateway"] },
              status: { type: "string", enum: ["ok"] }
            }
          }
        }
      }
    },
    responses: {
      BadRequest: { description: "Invalid request", content: json(ref("ApiError")) },
      Unauthorized: { description: "Missing or invalid access token", content: json(ref("ApiError")) },
      Forbidden: { description: "Access denied", content: json(ref("ApiError")) },
      RateLimited: { description: "Rate limit exceeded", content: json(ref("ApiError")) },
      ServiceUnavailable: { description: "Authentication dependency unavailable", content: json(ref("ApiError")) }
    }
  }
} as const;
