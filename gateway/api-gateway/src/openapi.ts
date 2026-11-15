const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ "application/json": { schema } });

export const gatewayOpenApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Health&Human API Gateway",
    version: "1.0.0",
    description: "Gateway-owned platform endpoints. Business contracts are owned by each service and documented in docs/api-contract.md plus each service OpenAPI document."
  },
  servers: [{ url: "http://localhost:8080", description: "Local development" }],
  tags: [{ name: "System" }],
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
    "/internal/v1/auth/cache-invalidate": {
      post: {
        summary: "Invalidate cached identities on user session change",
        tags: ["System"],
        security: [{ internalToken: [] }],
        requestBody: {
          required: true,
          content: json(ref("InvalidationPayload"))
        },
        responses: {
          "200": { description: "Cache invalidated", content: json(ref("SuccessEnvelope")) },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      internalToken: { type: "apiKey", in: "header", name: "X-Internal-Token" }
    },
    schemas: {
      InvalidationPayload: {
        type: "object",
        required: ["userId", "reason"],
        properties: {
          userId: { type: "string" },
          sessionId: { type: "string", nullable: true },
          scope: { type: "string", enum: ["CURRENT", "ALL", "ACCOUNT"] },
          reason: { type: "string" },
          sessionVersion: { type: "integer" },
          invalidatedAt: { type: "string", format: "date-time" }
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
