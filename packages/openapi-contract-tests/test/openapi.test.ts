import { describe, expect, it } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";
import { gatewayOpenApiDocument } from "../../../gateway/api-gateway/src/openapi.js";
import { appointmentOpenApi } from "../../../services/appointment-service/src/openapi.js";
import { doctorOpenApi } from "../../../services/doctor-service/src/openapi.js";
import { openapi as medicalRecordOpenApi } from "../../../services/medical-record-service/src/openapi.js";
import { openapi as notificationOpenApi } from "../../../services/notification-service/src/openapi.js";
import { swaggerDocument as userOpenApi } from "../../../services/user-service/src/openapi.js";

type ApiDocument = {
  openapi: string;
  security?: Array<Record<string, string[]>>;
  components?: { securitySchemes?: Record<string, unknown>; responses?: Record<string, unknown> };
  paths: Record<string, Record<string, {
    summary?: string;
    security?: Array<Record<string, string[]>>;
    parameters?: Array<{ name: string; in: string; required?: boolean }>;
    responses?: Record<string, { $ref?: string; description?: string; content?: Record<string, { schema?: unknown }> }>;
  }>>;
};

const documents: Array<{ name: string; document: ApiDocument; expectedOperations: string[] }> = [
  { name: "API Gateway", document: gatewayOpenApiDocument as ApiDocument, expectedOperations: [
    "GET /health", "GET /api/v1/system/health",
  ] },
  { name: "User Service", document: userOpenApi as ApiDocument, expectedOperations: [
    "GET /health", "POST /api/v1/auth/register", "POST /api/v1/auth/login", "POST /api/v1/auth/refresh",
    "POST /api/v1/auth/logout", "GET /api/v1/auth/me", "GET /api/v1/users", "GET /api/v1/users/{id}",
    "PATCH /api/v1/users/{id}/status", "PATCH /api/v1/users/{id}/role", "GET /api/v1/users/me",
    "PATCH /api/v1/users/me", "GET /api/v1/patients", "GET /api/v1/patients/{id}",
    "PATCH /api/v1/patients/{id}", "GET /internal/v1/auth/verify", "GET /internal/v1/users/{userId}/doctor-eligibility",
    "GET /internal/v1/patients/by-user/{userId}", "GET /internal/v1/patients/{id}",
  ] },
  { name: "Doctor Service", document: doctorOpenApi as ApiDocument, expectedOperations: [
    "GET /health", "GET /api/v1/specialties", "POST /api/v1/specialties", "PATCH /api/v1/specialties/{id}",
    "GET /api/v1/doctors", "POST /api/v1/doctors", "GET /api/v1/doctors/{id}", "PATCH /api/v1/doctors/{id}",
    "GET /api/v1/doctors/{id}/schedules", "POST /api/v1/doctors/{id}/schedules", "PATCH /api/v1/schedules/{id}",
    "GET /api/v1/doctors/{id}/time-offs", "POST /api/v1/doctors/{id}/time-offs",
    "PATCH /api/v1/doctors/{doctorId}/time-offs/{timeOffId}", "GET /api/v1/doctors/{id}/available-slots",
    "GET /internal/v1/doctors/by-user/{userId}", "POST /internal/v1/doctors/verify-slot",
  ] },
  { name: "Appointment Service", document: appointmentOpenApi as ApiDocument, expectedOperations: [
    "GET /health", "GET /api/v1/appointments", "POST /api/v1/appointments", "GET /api/v1/appointments/{id}",
    "PATCH /api/v1/appointments/{id}/reschedule", "PATCH /api/v1/appointments/{id}/cancel",
    "PATCH /api/v1/appointments/{id}/confirm", "PATCH /api/v1/appointments/{id}/check-in",
    "PATCH /api/v1/appointments/{id}/complete", "PATCH /api/v1/appointments/{id}/no-show",
    "GET /internal/v1/appointments/occupied-slots", "GET /internal/v1/appointments/{id}/verify-for-medical-record",
    "GET /internal/v1/appointments/{id}/patient-scope", "GET /internal/v1/appointments/{id}/reminder-context",
    "POST /internal/v1/appointments/{id}/complete-from-record",
  ] },
  { name: "Medical Record Service", document: medicalRecordOpenApi as ApiDocument, expectedOperations: [
    "GET /health", "GET /api/v1/medical-records", "POST /api/v1/medical-records",
    "GET /api/v1/medical-records/{id}", "PATCH /api/v1/medical-records/{id}",
    "GET /internal/v1/medical-records/by-appointment/{appointmentId}",
  ] },
  { name: "Notification Service", document: notificationOpenApi as ApiDocument, expectedOperations: [
    "GET /health", "GET /api/v1/notifications", "POST /api/v1/notifications",
    "GET /api/v1/notifications/{id}", "PATCH /api/v1/notifications/{id}/read",
    "POST /internal/v1/notifications", "POST /internal/v1/notifications/{id}/retry",
  ] },
];

const httpMethods = new Set(["get", "post", "put", "patch", "delete", "options", "head"]);
const publicAuthExceptions = new Set([
  "POST /api/v1/auth/register", "POST /api/v1/auth/login", "POST /api/v1/auth/refresh",
]);
const operationsWithRequestBodies = new Set([
  "POST /api/v1/auth/register", "POST /api/v1/auth/login", "POST /api/v1/auth/refresh", "POST /api/v1/auth/logout",
  "PATCH /api/v1/users/{id}/status", "PATCH /api/v1/users/{id}/role", "PATCH /api/v1/users/me",
  "PATCH /api/v1/patients/{id}", "POST /api/v1/specialties", "PATCH /api/v1/specialties/{id}",
  "POST /api/v1/doctors", "PATCH /api/v1/doctors/{id}", "POST /api/v1/doctors/{id}/schedules",
  "PATCH /api/v1/schedules/{id}", "POST /api/v1/doctors/{id}/time-offs",
  "PATCH /api/v1/doctors/{doctorId}/time-offs/{timeOffId}", "POST /internal/v1/doctors/verify-slot",
  "POST /api/v1/appointments", "PATCH /api/v1/appointments/{id}/reschedule",
  "PATCH /api/v1/appointments/{id}/cancel", "PATCH /api/v1/appointments/{id}/confirm",
  "PATCH /api/v1/appointments/{id}/check-in", "PATCH /api/v1/appointments/{id}/no-show",
  "POST /internal/v1/appointments/{id}/complete-from-record", "POST /api/v1/medical-records",
  "PATCH /api/v1/medical-records/{id}", "POST /internal/v1/notifications",
]);

function operationEntries(document: ApiDocument): Array<[string, string, ApiDocument["paths"][string][string]]> {
  return Object.entries(document.paths).flatMap(([path, pathItem]) =>
    Object.entries(pathItem)
      .filter(([method]) => httpMethods.has(method))
      .map(([method, operation]) => [`${method.toUpperCase()} ${path}`, path, operation]));
}

function resolveResponse(document: ApiDocument, response: { $ref?: string; description?: string; content?: Record<string, { schema?: unknown }> }) {
  const prefix = "#/components/responses/";
  if (!response.$ref?.startsWith(prefix)) return response;
  return document.components?.responses?.[response.$ref.slice(prefix.length)] as typeof response | undefined;
}

describe.each(documents)("$name OpenAPI contract", ({ name, document, expectedOperations }) => {
  it("is a valid OpenAPI 3.0 document with resolvable references", async () => {
    const validated = await SwaggerParser.validate(structuredClone(document));
    expect(validated.openapi).toMatch(/^3\.0\./);
    expect(validated.info.title).toBeTruthy();
    expect(validated.info.version).toBeTruthy();
  });

  it("documents the complete owned route set", () => {
    const actual = operationEntries(document).map(([key]) => key).sort();
    expect(actual, `${name} documented operation list`).toEqual([...expectedOperations].sort());
  });

  it("defines summaries, responses, path parameters and security for every operation", () => {
    for (const [key, path, operation] of operationEntries(document)) {
      expect(operation.summary, key).toBeTruthy();
      expect(operation.responses && Object.keys(operation.responses).length, key).toBeGreaterThan(0);
      for (const [status, responseReference] of Object.entries(operation.responses ?? {})) {
        const response = resolveResponse(document, responseReference);
        expect(response, `${key} ${status} response reference`).toBeTruthy();
        expect(response?.description, `${key} ${status} description`).toBeTruthy();
        if (/^[45]\d\d$/.test(status)) {
          expect(response?.content?.["application/json"]?.schema, `${key} ${status} error schema`).toBeTruthy();
        }
      }
      if (operationsWithRequestBodies.has(key)) {
        const method = key.slice(0, key.indexOf(" "));
        const pathItem = document.paths[path];
        const operationData = pathItem[method.toLowerCase()] as { requestBody?: unknown };
        expect(operationData.requestBody, `${key} request body`).toBeTruthy();
      }
      for (const parameterName of path.matchAll(/\{([^}]+)\}/g)) {
        const parameters = operation.parameters ?? [];
        expect(parameters.some((parameter) => parameter.in === "path" && parameter.name === parameterName[1] && parameter.required), key)
          .toBe(true);
      }

      if (path.startsWith("/internal/v1/")) {
        expect(operation.security?.some((requirement) => "internalToken" in requirement), key).toBe(true);
      } else if (path.startsWith("/api/v1/") && !publicAuthExceptions.has(key)) {
        const security = operation.security ?? document.security ?? [];
        expect(security.some((requirement) => "bearerAuth" in requirement), key).toBe(true);
      }
    }
  });
});
