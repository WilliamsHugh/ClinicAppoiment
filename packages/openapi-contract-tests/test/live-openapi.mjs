import assert from "node:assert/strict";
import test from "node:test";
import SwaggerParser from "@apidevtools/swagger-parser";

const services = [
  ["API Gateway", "GATEWAY", 8080],
  ["User Service", "USER_SERVICE", 3001],
  ["Doctor Service", "DOCTOR_SERVICE", 3002],
  ["Appointment Service", "APPOINTMENT_SERVICE", 3003],
  ["Medical Record Service", "MEDICAL_RECORD_SERVICE", 3004],
  ["Notification Service", "NOTIFICATION_SERVICE", 3005],
];

for (const [name, envName, port] of services) {
  const baseUrl = process.env[`OPENAPI_${envName}_URL`] ?? `http://127.0.0.1:${port}`;

  test(`${name} serves a valid /openapi.json`, async () => {
    const response = await fetch(`${baseUrl}/openapi.json`, { signal: AbortSignal.timeout(5_000) });
    assert.equal(response.status, 200, `${name} returned HTTP ${response.status}`);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/i);
    const document = await response.json();
    const validated = await SwaggerParser.validate(document);
    assert.match(validated.openapi, /^3\.0\./);
  });

  for (const path of ["/docs/", "/api-docs/"]) {
    test(`${name} serves the Swagger UI at ${path}`, async () => {
      const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(5_000) });
      assert.equal(response.status, 200, `${name} returned HTTP ${response.status}`);
      assert.match(response.headers.get("content-type") ?? "", /text\/html/i);
    });
  }
}
