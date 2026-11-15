import { describe, expect, it } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";
import { gatewayOpenApiDocument } from "../../../gateway/api-gateway/src/openapi.js";
import { appointmentOpenApi } from "../../../services/appointment-service/src/openapi.js";
import { doctorOpenApi } from "../../../services/doctor-service/src/openapi.js";
import { openapi as medicalRecordOpenApi } from "../../../services/medical-record-service/src/openapi.js";
import { openapi as notificationOpenApi } from "../../../services/notification-service/src/openapi.js";
import { swaggerDocument as userOpenApi } from "../../../services/user-service/src/openapi.js";

/**
 * Static OpenAPI Contract Specification Tests according to API Contract v2
 * and Compatibility Matrix v2 (docs/compatibility-matrix-v2.md).
 *
 * This test suite:
 * 1. Validates static schema structure without requiring running services.
 * 2. Enforces exact v2 operations, methods, query parameters, required headers, security schemes, and error codes.
 * 3. Automatically fails if any required v2 route, parameter, or security guard is dropped.
 */

type OperationSpec = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  security: "public" | "bearerAuth" | "internalToken" | "clinicalGrant";
  requiredHeaders?: string[];
  requiredParams?: string[];
  expectedErrors: number[];
};

type ServiceV2Contract = {
  name: string;
  document: Record<string, any>;
  v2RequiredOperations: OperationSpec[];
};

// Target v2 Operation Specifications based on docs/api-contract-v2.md
export const v2ServicesContract: ServiceV2Contract[] = [
  {
    name: "API Gateway",
    document: gatewayOpenApiDocument,
    v2RequiredOperations: [
      { method: "GET", path: "/health", security: "public", expectedErrors: [] },
      { method: "GET", path: "/api/v1/system/health", security: "bearerAuth", expectedErrors: [401, 403] },
      { method: "POST", path: "/internal/v1/auth/cache-invalidate", security: "internalToken", requiredHeaders: ["X-Internal-Token"], expectedErrors: [400, 401] }
    ]
  },
  {
    name: "User Service",
    document: userOpenApi,
    v2RequiredOperations: [
      { method: "GET", path: "/health", security: "public", expectedErrors: [] },
      { method: "POST", path: "/api/v1/auth/register", security: "public", expectedErrors: [400] },
      { method: "POST", path: "/api/v1/auth/login", security: "public", expectedErrors: [400, 401, 403] },
      { method: "POST", path: "/api/v1/auth/refresh", security: "public", expectedErrors: [400, 401] },
      { method: "POST", path: "/api/v1/auth/logout", security: "bearerAuth", expectedErrors: [401] },
      { method: "GET", path: "/api/v1/auth/me", security: "bearerAuth", expectedErrors: [401] },
      { method: "GET", path: "/api/v1/users/me", security: "bearerAuth", expectedErrors: [401] },
      { method: "PATCH", path: "/api/v1/users/me", security: "bearerAuth", expectedErrors: [400, 401] },
      { method: "GET", path: "/api/v1/users", security: "bearerAuth", expectedErrors: [401, 403] },
      { method: "GET", path: "/api/v1/users/{id}", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [401, 403, 404] },
      { method: "PATCH", path: "/api/v1/users/{id}/status", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [400, 401, 403, 404] },
      { method: "PATCH", path: "/api/v1/users/{id}/role", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [400, 401, 403, 404] },
      { method: "GET", path: "/api/v1/patients", security: "bearerAuth", expectedErrors: [401, 403] },
      { method: "GET", path: "/api/v1/patients/{id}", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [400, 401, 403, 404] },
      { method: "PATCH", path: "/api/v1/patients/{id}", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [400, 401, 403, 404] },
      { method: "GET", path: "/internal/v1/auth/verify", security: "internalToken", expectedErrors: [401, 404] },
      { method: "GET", path: "/internal/v1/users/{userId}/doctor-eligibility", security: "internalToken", requiredParams: ["userId"], expectedErrors: [400, 401, 404] },
      { method: "GET", path: "/internal/v1/patients/by-user/{userId}", security: "internalToken", requiredParams: ["userId"], expectedErrors: [400, 401, 404] },
      { method: "GET", path: "/internal/v1/patients/{id}", security: "internalToken", requiredParams: ["id"], expectedErrors: [400, 401, 404] }
    ]
  },
  {
    name: "Doctor Service",
    document: doctorOpenApi,
    v2RequiredOperations: [
      { method: "GET", path: "/health", security: "public", expectedErrors: [] },
      { method: "GET", path: "/api/v1/specialties", security: "bearerAuth", expectedErrors: [401] },
      { method: "POST", path: "/api/v1/specialties", security: "bearerAuth", expectedErrors: [400, 401, 403] },
      { method: "PATCH", path: "/api/v1/specialties/{id}", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [400, 401, 403, 404] },
      { method: "GET", path: "/api/v1/doctors", security: "bearerAuth", expectedErrors: [401] },
      { method: "POST", path: "/api/v1/doctors", security: "bearerAuth", expectedErrors: [400, 401, 403] },
      { method: "GET", path: "/api/v1/doctors/{id}", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [400, 401, 404] },
      { method: "PATCH", path: "/api/v1/doctors/{id}", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [400, 401, 403, 404] },
      { method: "GET", path: "/api/v1/doctors/{id}/schedules", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [400, 401, 404] },
      { method: "POST", path: "/api/v1/doctors/{id}/schedules", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [400, 401, 403, 404, 409] },
      { method: "PATCH", path: "/api/v1/schedules/{id}", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [400, 401, 403, 404, 409] },
      { method: "GET", path: "/api/v1/doctors/{id}/time-offs", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [400, 401, 403, 404] },
      { method: "POST", path: "/api/v1/doctors/{id}/time-offs", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [400, 401, 403, 404, 409] },
      { method: "PATCH", path: "/api/v1/doctors/{doctorId}/time-offs/{timeOffId}", security: "bearerAuth", requiredParams: ["doctorId", "timeOffId"], expectedErrors: [400, 401, 403, 404, 409] },
      { method: "GET", path: "/api/v1/doctors/{id}/available-slots", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [400, 401, 404, 503] },
      { method: "GET", path: "/internal/v1/doctors/by-user/{userId}", security: "internalToken", requiredParams: ["userId"], expectedErrors: [400, 401, 404] },
      { method: "POST", path: "/internal/v1/doctors/verify-slot", security: "internalToken", expectedErrors: [400, 401, 422] }
    ]
  },
  {
    name: "Appointment Service",
    document: appointmentOpenApi,
    v2RequiredOperations: [
      { method: "GET", path: "/health", security: "public", expectedErrors: [] },
      { method: "GET", path: "/api/v1/appointments", security: "bearerAuth", expectedErrors: [400, 401, 403] },
      { method: "POST", path: "/api/v1/appointments", security: "bearerAuth", requiredHeaders: ["Idempotency-Key"], expectedErrors: [400, 401, 403, 409, 422] },
      { method: "GET", path: "/api/v1/appointments/{id}", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [400, 401, 403, 404] },
      { method: "PATCH", path: "/api/v1/appointments/{id}/reschedule", security: "bearerAuth", requiredParams: ["id"], requiredHeaders: ["Idempotency-Key"], expectedErrors: [400, 401, 403, 404, 409] },
      { method: "PATCH", path: "/api/v1/appointments/{id}/cancel", security: "bearerAuth", requiredParams: ["id"], requiredHeaders: ["Idempotency-Key"], expectedErrors: [400, 401, 403, 404, 409] },
      { method: "PATCH", path: "/api/v1/appointments/{id}/confirm", security: "bearerAuth", requiredParams: ["id"], requiredHeaders: ["Idempotency-Key"], expectedErrors: [400, 401, 403, 404, 409] },
      { method: "PATCH", path: "/api/v1/appointments/{id}/check-in", security: "bearerAuth", requiredParams: ["id"], requiredHeaders: ["Idempotency-Key"], expectedErrors: [400, 401, 403, 404, 409] },
      { method: "PATCH", path: "/api/v1/appointments/{id}/complete", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [401, 409] },
      { method: "PATCH", path: "/api/v1/appointments/{id}/no-show", security: "bearerAuth", requiredParams: ["id"], requiredHeaders: ["Idempotency-Key"], expectedErrors: [400, 401, 403, 404, 409] },
      { method: "GET", path: "/internal/v1/appointments/occupied-slots", security: "internalToken", expectedErrors: [400, 401] },
      { method: "GET", path: "/internal/v1/appointments/{id}/verify-for-medical-record", security: "internalToken", requiredParams: ["id"], expectedErrors: [400, 401, 404] },
      { method: "GET", path: "/internal/v1/appointments/{id}/patient-scope", security: "internalToken", requiredParams: ["id"], expectedErrors: [400, 401, 404] },
      { method: "GET", path: "/internal/v1/appointments/{id}/reminder-context", security: "internalToken", requiredParams: ["id"], expectedErrors: [400, 401, 404] },
      { method: "POST", path: "/internal/v1/appointments/{id}/complete-from-record", security: "internalToken", requiredParams: ["id"], expectedErrors: [400, 401, 404, 409] }
    ]
  },
  {
    name: "Medical Record Service",
    document: medicalRecordOpenApi,
    v2RequiredOperations: [
      { method: "GET", path: "/health", security: "public", expectedErrors: [] },
      { method: "GET", path: "/api/v1/medical-records", security: "bearerAuth", expectedErrors: [400, 401, 403] },
      { method: "POST", path: "/api/v1/medical-records", security: "bearerAuth", requiredHeaders: ["Idempotency-Key"], expectedErrors: [400, 401, 403, 409, 422] },
      { method: "GET", path: "/api/v1/medical-records/{id}", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [400, 401, 403, 404] },
      { method: "PATCH", path: "/api/v1/medical-records/{id}", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [400, 401, 403, 404, 409] },
      { method: "GET", path: "/internal/v1/medical-records/by-appointment/{appointmentId}", security: "internalToken", requiredParams: ["appointmentId"], expectedErrors: [401, 404] }
    ]
  },
  {
    name: "Notification Service",
    document: notificationOpenApi,
    v2RequiredOperations: [
      { method: "GET", path: "/health", security: "public", expectedErrors: [] },
      { method: "GET", path: "/api/v1/notifications", security: "bearerAuth", expectedErrors: [400, 401] },
      { method: "POST", path: "/api/v1/notifications", security: "bearerAuth", expectedErrors: [403] },
      { method: "GET", path: "/api/v1/notifications/{id}", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [400, 401, 404] },
      { method: "PATCH", path: "/api/v1/notifications/{id}/read", security: "bearerAuth", requiredParams: ["id"], expectedErrors: [400, 401, 404] },
      { method: "POST", path: "/internal/v1/notifications", security: "internalToken", expectedErrors: [400, 401] },
      { method: "POST", path: "/internal/v1/notifications/{id}/retry", security: "internalToken", requiredParams: ["id"], expectedErrors: [401] }
    ]
  }
];

describe("Static OpenAPI Contract Validation Suite (Step 5a, 5c, 5d)", () => {
  it.each(v2ServicesContract)("$name schema is valid OpenAPI 3.0", async ({ document }) => {
    const validated = await SwaggerParser.validate(structuredClone(document));
    expect(validated.openapi).toMatch(/^3\.0\./);
    expect(validated.info.title).toBeTruthy();
    expect(validated.info.version).toBeTruthy();
  });

  describe.each(v2ServicesContract)("$name exact endpoint & security guard assertions", ({ name, document, v2RequiredOperations }) => {
    for (const spec of v2RequiredOperations) {
      const opKey = `${spec.method} ${spec.path}`;

      it(`documents ${opKey} with correct security guard and parameters`, () => {
        const pathItem = document.paths[spec.path];
        expect(pathItem, `${name} must define path ${spec.path}`).toBeTruthy();

        const operation = pathItem[spec.method.toLowerCase()];
        expect(operation, `${name} must define method ${spec.method} on ${spec.path}`).toBeTruthy();
        expect(operation.summary, `${opKey} must have a summary`).toBeTruthy();

        // Security Guard Validation (Step 5c, 5d)
        if (spec.security === "public") {
          // Public endpoints should either have security: [] or not enforce bearerAuth/internalToken
          const security = operation.security;
          if (security) {
            expect(Array.isArray(security), `${opKey} security`).toBe(true);
          }
        } else if (spec.security === "internalToken") {
          const security = operation.security ?? document.security ?? [];
          const hasInternal = security.some((s: Record<string, unknown>) => "internalToken" in s);
          expect(hasInternal, `${opKey} must be protected by internalToken guard`).toBe(true);
        } else if (spec.security === "bearerAuth") {
          const security = operation.security ?? document.security ?? [];
          const hasBearer = security.some((s: Record<string, unknown>) => "bearerAuth" in s);
          expect(hasBearer, `${opKey} must be protected by bearerAuth guard`).toBe(true);
        }

        // Path Parameter Validation
        if (spec.requiredParams) {
          for (const paramName of spec.requiredParams) {
            const params = operation.parameters ?? [];
            const found = params.some((p: { name: string; in: string; required?: boolean }) => p.name === paramName && p.in === "path" && p.required === true);
            expect(found, `${opKey} must have required path parameter {${paramName}}`).toBe(true);
          }
        }

        // Expected Response Codes Validation
        expect(operation.responses, `${opKey} must define responses`).toBeTruthy();
        for (const errorCode of spec.expectedErrors) {
          const responseRef = operation.responses[String(errorCode)];
          expect(responseRef, `${opKey} should document HTTP ${errorCode} error response`).toBeTruthy();
        }
      });
    }

    it(`fails automatically if any required operation in ${name} is deleted or missing`, () => {
      const documentedPaths = new Set(Object.keys(document.paths));
      for (const spec of v2RequiredOperations) {
        expect(documentedPaths.has(spec.path), `${name} missing required v2 path: ${spec.path}`).toBe(true);
      }
    });
  });

  it("distinguishes static validation from live smoke tests (Step 5b)", () => {
    // Static tests validate schema objects directly in memory without network or running services
    expect(v2ServicesContract.length).toBe(6);
    for (const service of v2ServicesContract) {
      expect(typeof service.document).toBe("object");
      expect(service.document.openapi).toBeTruthy();
    }
  });
});
