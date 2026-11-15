const internalTokenSecurity = [{ internalToken: [] }];
const errorResponse = (description: string) => ({ description, content: {
  "application/json": { schema: { $ref: "#/components/schemas/Error" } },
} });
const uuidParameter = (name: string) => ({ name, in: "path", required: true,
  schema: { type: "string", format: "uuid" } });
const internalErrorResponses = {
  "400": { description: "Invalid UUID", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
  "401": { description: "Missing or invalid caller credential", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
  "404": { description: "User or patient not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
  "503": { description: "Internal authentication is not configured", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
};
const internalSuccess = (schemaName: string) => ({ description: "Found", content: {
  "application/json": { schema: { type: "object", required: ["success", "data"], properties: {
    success: { type: "boolean", enum: [true] }, data: { $ref: `#/components/schemas/${schemaName}` },
  } } },
} });

export const swaggerDocument = {
  openapi: "3.0.3",
  info: { title: "User Service API", version: "0.1.0", description: "Quản lý xác thực, người dùng và hồ sơ bệnh nhân" },
  components: {
    securitySchemes: { internalToken: { type: "apiKey", in: "header", name: "X-Internal-Token",
      description: "Distinct backend-only credential for each caller" } },
    schemas: {
      Error: { type: "object", required: ["success", "error"], properties: {
        success: { type: "boolean", enum: [false] },
        error: { type: "object", required: ["code", "message", "details"], properties: {
          code: { type: "string" }, message: { type: "string" }, details: { type: "array", items: {} },
        } },
      } },
      DoctorEligibility: { type: "object", required: ["id", "role", "status"], properties: {
        id: { type: "string", format: "uuid", description: "Application User ID, not Supabase Auth ID" },
        role: { type: "string", enum: ["PATIENT", "DOCTOR", "STAFF", "ADMIN"] },
        status: { type: "string", enum: ["ACTIVE", "INACTIVE", "LOCKED"] },
      } },
      PatientReference: { type: "object", required: ["id", "userId"], properties: {
        id: { type: "string", format: "uuid", description: "Patient profile ID" },
        userId: { type: "string", format: "uuid", description: "Application User ID" },
      } },
      VerifiedIdentity: { type: "object", required: ["id", "role", "status"], properties: {
        id: { type: "string", format: "uuid" },
        userId: { type: "string", format: "uuid" },
        authUserId: { type: "string", format: "uuid" },
        sessionId: { type: "string", format: "uuid" },
        role: { type: "string", enum: ["PATIENT", "DOCTOR", "STAFF", "ADMIN"] },
        status: { type: "string", enum: ["ACTIVE", "PENDING_MFA", "LOCKED", "EXPIRED", "REVOKED"] },
        accountStatus: { type: "string", enum: ["ACTIVE", "INACTIVE", "LOCKED"] },
        idleExpiresAt: { type: "string", format: "date-time", nullable: true },
        absoluteExpiresAt: { type: "string", format: "date-time", nullable: true },
        lockAt: { type: "string", format: "date-time", nullable: true },
        sessionVersion: { type: "integer" },
        mfaVerifiedAt: { type: "string", format: "date-time", nullable: true },
      } },
    },
  },
  paths: {
    "/health": { get: { summary: "Kiểm tra tình trạng service" } },
    "/api/v1/auth/register": { post: { summary: "Đăng ký tài khoản bệnh nhân (PATIENT)" } },
    "/api/v1/auth/login": { post: { summary: "Đăng nhập hệ thống" } },
    "/api/v1/auth/refresh": { post: { summary: "Làm mới access token bằng refresh token" } },
    "/api/v1/auth/logout": { post: { summary: "Đăng xuất và hủy phiên" } },
    "/api/v1/auth/me": { get: { summary: "Lấy thông tin tài khoản hiện tại" } },
    "/api/v1/auth/session": { get: { summary: "Lấy metadata phiên hiện tại" } },
    "/api/v1/auth/session/activity": { post: { summary: "Cập nhật hoạt động phiên" } },
    "/api/v1/auth/sessions": { get: { summary: "Danh sách phiên hoạt động của tài khoản" } },
    "/api/v1/auth/sessions/{sessionId}": { delete: { summary: "Thu hồi một phiên cụ thể", parameters: [uuidParameter("sessionId")] } },
    "/api/v1/auth/mfa/factors": { get: { summary: "Danh sách factor MFA của người dùng" } },
    "/api/v1/auth/mfa/totp/enroll": { post: { summary: "Đăng ký factor TOTP" } },
    "/api/v1/auth/mfa/challenges": { post: { summary: "Tạo challenge MFA theo mục đích" } },
    "/api/v1/auth/mfa/verify": { post: { summary: "Xác minh mã TOTP 6 số" } },
    "/api/v1/auth/password/forgot": { post: { summary: "Yêu cầu đặt lại mật khẩu" } },
    "/api/v1/auth/password/recovery/exchange": { post: { summary: "Đổi token khôi phục mật khẩu lấy context" } },
    "/api/v1/auth/password/reset": { post: { summary: "Đặt lại mật khẩu với context" } },
    "/api/v1/auth/password/change": { post: { summary: "Đổi mật khẩu trong phiên" } },
    "/api/v1/users": { get: { summary: "Danh sách người dùng (ADMIN)" } },
    "/api/v1/users/{id}": { get: { summary: "Xem chi tiết người dùng (ADMIN)", parameters: [uuidParameter("id")] } },
    "/api/v1/users/{id}/status": { patch: { summary: "Cập nhật trạng thái người dùng (ADMIN)", parameters: [uuidParameter("id")] } },
    "/api/v1/users/{id}/role": { patch: { summary: "Cập nhật vai trò người dùng (ADMIN)", parameters: [uuidParameter("id")] } },
    "/api/v1/users/me": {
      get: { summary: "Xem hồ sơ cá nhân của người dùng hiện tại" },
      patch: { summary: "Cập nhật hồ sơ cá nhân của người dùng hiện tại" }
    },
    "/api/v1/patients": { get: {
      summary: "Search patients; Doctor access requires an appointment scope check",
      responses: { "503": errorResponse("Doctor or Appointment scope verification is unavailable") },
    } },
    "/api/v1/patients/{id}": {
      get: { summary: "Xem chi tiết hồ sơ bệnh nhân",
        parameters: [uuidParameter("id"), { name: "appointmentId", in: "query", required: false,
          description: "Required for DOCTOR; checks assignment through Doctor and Appointment services",
          schema: { type: "string", format: "uuid" } }],
        responses: { "503": errorResponse("Doctor or Appointment scope verification is unavailable") },
      },
      patch: { summary: "Cập nhật hồ sơ bệnh nhân (Bệnh nhân chính mình hoặc ADMIN)", parameters: [uuidParameter("id")] }
    },
    "/internal/v1/auth/verify": { get: {
      summary: "Xác minh access token và session cho API Gateway", security: internalTokenSecurity,
      parameters: [{ name: "Authorization", in: "header", required: true,
        schema: { type: "string", example: "Bearer <access token>" } }],
      responses: { "200": internalSuccess("VerifiedIdentity"),
        "401": internalErrorResponses["401"], "404": internalErrorResponses["404"],
        "503": internalErrorResponses["503"] },
    } },
    "/internal/v1/auth/invalidate": { post: {
      summary: "Tín hiệu thu hồi cache/session cho API Gateway và nội bộ", security: internalTokenSecurity,
      responses: { "200": internalSuccess("SuccessEnvelope"), ...internalErrorResponses },
    } },
    "/internal/v1/auth/mfa/proofs/verify": { post: {
      summary: "Xác minh proof TOTP cho Medical Record và tác vụ nhạy cảm", security: internalTokenSecurity,
      responses: { "200": internalSuccess("SuccessEnvelope"), ...internalErrorResponses },
    } },
    "/internal/v1/mfa/verify-proof": { post: {
      summary: "Alias xác minh proof TOTP", security: internalTokenSecurity,
      responses: { "200": internalSuccess("SuccessEnvelope"), ...internalErrorResponses },
    } },
    "/internal/v1/patients/lookup": { post: {
      summary: "Tra cứu danh sách tên bệnh nhân nội bộ", security: internalTokenSecurity,
      responses: { "200": internalSuccess("SuccessEnvelope"), ...internalErrorResponses },
    } },
    "/internal/v1/users/{userId}/doctor-eligibility": { get: {
      summary: "Application role and status for Doctor account linking", security: internalTokenSecurity,
      parameters: [uuidParameter("userId")],
      responses: { "200": internalSuccess("DoctorEligibility"), ...internalErrorResponses },
    } },
    "/internal/v1/patients/by-user/{userId}": { get: {
      summary: "Current PATIENT profile ID by application User ID", security: internalTokenSecurity,
      parameters: [uuidParameter("userId")],
      responses: { "200": internalSuccess("PatientReference"), ...internalErrorResponses },
    } },
    "/internal/v1/patients/{id}": { get: {
      summary: "Patient profile ID and User ID by Patient ID, including historical profiles",
      security: internalTokenSecurity, parameters: [uuidParameter("id")],
      responses: { "200": internalSuccess("PatientReference"), ...internalErrorResponses },
    } }
  }
};


const mutableDocument = swaggerDocument as unknown as {
  security?: Array<Record<string, string[]>>;
  components: { securitySchemes: Record<string, unknown>; schemas: Record<string, unknown> };
  paths: Record<string, Record<string, unknown>>;
};
mutableDocument.security = [{ bearerAuth: [] }];
mutableDocument.components.securitySchemes.bearerAuth = { type: "http", scheme: "bearer", bearerFormat: "JWT" };
mutableDocument.components.schemas.SuccessEnvelope = { type: "object", required: ["success", "data"], properties: {
  success: { type: "boolean", enum: [true] }, data: {},
} };
Object.assign(mutableDocument.components.schemas, {
  RegisterRequest: { type: "object", required: ["email", "password", "fullName"], additionalProperties: false,
    properties: { email: { type: "string", format: "email" }, password: { type: "string", minLength: 6, maxLength: 128 },
      fullName: { type: "string", minLength: 2, maxLength: 120 } } },
  LoginRequest: { type: "object", required: ["email", "password"], additionalProperties: false,
    properties: { email: { type: "string", format: "email" }, password: { type: "string", minLength: 6, maxLength: 128 } } },
  RefreshRequest: { type: "object", required: ["refreshToken"], additionalProperties: false,
    properties: { refreshToken: { type: "string", minLength: 1 } } },
  UserProfileUpdate: { type: "object", additionalProperties: false,
    properties: { fullName: { type: "string", minLength: 2, maxLength: 120 }, phone: { type: "string", nullable: true } } },
  UserStatusUpdate: { type: "object", required: ["status"], additionalProperties: false,
    properties: { status: { type: "string", enum: ["ACTIVE", "INACTIVE", "LOCKED"] } } },
  UserRoleUpdate: { type: "object", required: ["role"], additionalProperties: false,
    properties: { role: { type: "string", enum: ["PATIENT", "DOCTOR", "STAFF", "ADMIN"] } } },
  PatientProfileUpdate: { type: "object", additionalProperties: false, properties: {
    dateOfBirth: { type: "string", format: "date", nullable: true },
    gender: { type: "string", enum: ["MALE", "FEMALE", "OTHER"], nullable: true },
    address: { type: "string", maxLength: 500, nullable: true },
    emergencyContact: { type: "string", maxLength: 120, nullable: true },
    insuranceNumber: { type: "string", maxLength: 50, nullable: true },
  } },
  ChallengeCreateRequest: { type: "object", required: ["factorId", "purpose"], additionalProperties: false,
    properties: { factorId: { type: "string", format: "uuid" }, purpose: { type: "string", enum: [
      "ENROLL_TOTP", "OPEN_CLINICAL_RECORDS", "FINALIZE_MEDICAL_RECORD",
      "STAFF_ADMIN_LOGIN", "UNLOCK_SESSION", "AUTHORIZE_SENSITIVE_OPERATION"
    ] }, context: { type: "object" } } },
  ChallengeVerifyRequest: { type: "object", required: ["challengeId", "code"], additionalProperties: false,
    properties: { challengeId: { type: "string", format: "uuid" }, code: { type: "string", pattern: "^[0-9]{6}$" }, sessionId: { type: "string", format: "uuid" } } },
  PasswordForgotRequest: { type: "object", required: ["email"], additionalProperties: false,
    properties: { email: { type: "string", format: "email" } } },
  PasswordResetRequest: { type: "object", required: ["recoveryContextId", "newPassword"], additionalProperties: false,
    properties: { recoveryContextId: { type: "string", format: "uuid" }, newPassword: { type: "string", minLength: 6, maxLength: 128 } } },
  PasswordChangeRequest: { type: "object", required: ["currentPassword", "newPassword"], additionalProperties: false,
    properties: { currentPassword: { type: "string" }, newPassword: { type: "string", minLength: 6, maxLength: 128 } } },
  InvalidationRequest: { type: "object", required: ["userId", "scope", "reason"], additionalProperties: false,
    properties: { userId: { type: "string", format: "uuid" }, sessionId: { type: "string", format: "uuid", nullable: true }, scope: { type: "string", enum: ["CURRENT", "ALL", "ACCOUNT"] }, reason: { type: "string" }, sessionVersion: { type: "integer" }, invalidatedAt: { type: "string", format: "date-time" } } },
  ProofVerifyRequest: { type: "object", required: ["purpose"], additionalProperties: false,
    properties: { proofId: { type: "string", format: "uuid" }, proof_token: { type: "string" }, purpose: { type: "string" }, actorUserId: { type: "string", format: "uuid" }, actor_id: { type: "string" }, sessionId: { type: "string", format: "uuid" }, session_id: { type: "string" }, context: { type: "object" } } },
  BatchPatientLookupRequest: { type: "object", required: ["patientIds"], additionalProperties: false,
    properties: { patientIds: { type: "array", items: { type: "string", format: "uuid" } }, actorContext: { type: "object" }, appointmentIds: { type: "array", items: { type: "string", format: "uuid" } } } },
});

const defaultError = { description: "Standard API error", content: {
  "application/json": { schema: { $ref: "#/components/schemas/Error" } },
} };
const errorStatusesByOperation: Record<string, string[]> = {
  "GET /health": ["503"],
  "POST /api/v1/auth/register": ["400", "403", "429", "503"],
  "POST /api/v1/auth/login": ["400", "401", "403", "429", "503"],
  "POST /api/v1/auth/refresh": ["400", "401", "403", "429", "503"],
  "POST /api/v1/auth/logout": ["400", "401", "503"],
  "GET /api/v1/auth/me": ["401", "404"],
  "GET /api/v1/auth/session": ["401", "404"],
  "POST /api/v1/auth/session/activity": ["401", "403", "404"],
  "GET /api/v1/auth/sessions": ["401"],
  "DELETE /api/v1/auth/sessions/{sessionId}": ["401", "404"],
  "GET /api/v1/auth/mfa/factors": ["401", "503"],
  "POST /api/v1/auth/mfa/totp/enroll": ["401", "503"],
  "POST /api/v1/auth/mfa/challenges": ["400", "401", "404", "503"],
  "POST /api/v1/auth/mfa/verify": ["400", "403", "404", "429", "503"],
  "POST /api/v1/auth/password/forgot": ["400"],
  "POST /api/v1/auth/password/recovery/exchange": ["400"],
  "POST /api/v1/auth/password/reset": ["400"],
  "POST /api/v1/auth/password/change": ["400", "401"],
  "GET /api/v1/users": ["400", "401", "403"],
  "GET /api/v1/users/{id}": ["401", "403", "404"],
  "PATCH /api/v1/users/{id}/status": ["400", "401", "403", "404"],
  "PATCH /api/v1/users/{id}/role": ["400", "401", "403", "404"],
  "GET /api/v1/users/me": ["401", "404"],
  "PATCH /api/v1/users/me": ["400", "401", "404"],
  "GET /api/v1/patients": ["400", "401", "403", "503"],
  "GET /api/v1/patients/{id}": ["400", "401", "403", "404", "503"],
  "PATCH /api/v1/patients/{id}": ["400", "401", "403", "404"],
  "GET /internal/v1/auth/verify": ["401", "404", "503"],
  "POST /internal/v1/auth/invalidate": ["400", "401", "503"],
  "POST /internal/v1/auth/mfa/proofs/verify": ["400", "401", "503"],
  "POST /internal/v1/mfa/verify-proof": ["400", "401", "503"],
  "POST /internal/v1/patients/lookup": ["400", "401", "503"],
  "GET /internal/v1/users/{userId}/doctor-eligibility": ["400", "401", "404", "503"],
  "GET /internal/v1/patients/by-user/{userId}": ["400", "401", "404", "503"],
  "GET /internal/v1/patients/{id}": ["400", "401", "404", "503"],
};
const documentedMethods = ["get", "post", "put", "patch", "delete"];
for (const [path, pathItem] of Object.entries(mutableDocument.paths)) {
  for (const method of documentedMethods) {
    const operation = pathItem[method] as Record<string, unknown> | undefined;
    if (!operation) continue;
    const responses = operation.responses as Record<string, unknown> | undefined;
    const successCode = path === "/api/v1/auth/register" && method === "post" ? "201" : "200";
    const successResponse = { description: "Successful response", content: {
      "application/json": { schema: { $ref: "#/components/schemas/SuccessEnvelope" } },
    } };
    const operationErrors = Object.fromEntries(
      (errorStatusesByOperation[`${method.toUpperCase()} ${path}`] ?? []).map((status) => [status, defaultError]),
    );
    operation.responses = {
      [successCode]: successResponse,
      ...operationErrors,
      ...responses,
    };
  }
}
const requestBodySchemas: Record<string, string> = {
  "POST /api/v1/auth/register": "RegisterRequest",
  "POST /api/v1/auth/login": "LoginRequest",
  "POST /api/v1/auth/refresh": "RefreshRequest",
  "POST /api/v1/auth/logout": "RefreshRequest",
  "POST /api/v1/auth/mfa/challenges": "ChallengeCreateRequest",
  "POST /api/v1/auth/mfa/verify": "ChallengeVerifyRequest",
  "POST /api/v1/auth/password/forgot": "PasswordForgotRequest",
  "POST /api/v1/auth/password/reset": "PasswordResetRequest",
  "POST /api/v1/auth/password/change": "PasswordChangeRequest",
  "POST /internal/v1/auth/invalidate": "InvalidationRequest",
  "POST /internal/v1/auth/mfa/proofs/verify": "ProofVerifyRequest",
  "POST /internal/v1/mfa/verify-proof": "ProofVerifyRequest",
  "POST /internal/v1/patients/lookup": "BatchPatientLookupRequest",
  "PATCH /api/v1/users/{id}/status": "UserStatusUpdate",
  "PATCH /api/v1/users/{id}/role": "UserRoleUpdate",
  "PATCH /api/v1/users/me": "UserProfileUpdate",
  "PATCH /api/v1/patients/{id}": "PatientProfileUpdate",
};
for (const [operationKey, schemaName] of Object.entries(requestBodySchemas)) {
  const [method, path] = operationKey.split(" ");
  const operation = mutableDocument.paths[path]?.[method.toLowerCase()] as Record<string, unknown> | undefined;
  if (operation) operation.requestBody = { required: true, content: {
    "application/json": { schema: { $ref: `#/components/schemas/${schemaName}` } },
  } };
}
for (const path of [
  "/api/v1/auth/register",
  "/api/v1/auth/login",
  "/api/v1/auth/refresh",
  "/api/v1/auth/password/forgot",
  "/api/v1/auth/password/recovery/exchange",
  "/api/v1/auth/password/reset",
]) {
  const operation = mutableDocument.paths[path]?.post as Record<string, unknown> | undefined;
  if (operation) operation.security = [];
}
const healthOperation = mutableDocument.paths["/health"]?.get as Record<string, unknown> | undefined;
if (healthOperation) healthOperation.security = [];
