import { describe, expect, it } from "vitest";
import crypto from "node:crypto";

const GATEWAY_URL = "http://127.0.0.1:8080";
const STAFF_EMAIL = "staff.live.e2e@clinic.test";
const ADMIN_EMAIL = "admin.live.e2e@clinic.test";
const PASSWORD = "Password123!";
const TOTP_SECRET = "JBSWY3DPEHPK3PXP";

function generateTotp(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (let i = 0; i < secret.length; i++) {
    const val = alphabet.indexOf(secret[i].toUpperCase());
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substr(i, 8), 2));
  }
  const key = Buffer.from(bytes);
  const epoch = Math.floor(Date.now() / 30000);
  const time = Buffer.alloc(8);
  time.writeBigInt64BE(BigInt(epoch));
  const hmac = crypto.createHmac("sha1", key).update(time).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1000000;
  return code.toString().padStart(6, "0");
}

describe("M2-INTEGRATION-006: Staff/Admin Live Auth, MFA & Session Lifecycle via Gateway (port 8080)", () => {
  it("E2E-AUTH-STAFF: login PENDING_MFA -> TOTP verify -> ACTIVE -> session revocation via /profile", async () => {
    // 1. Staff Login returns PENDING_MFA
    const loginRes = await fetch(`${GATEWAY_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: STAFF_EMAIL, password: PASSWORD }),
    });
    expect(loginRes.status).toBe(200);
    const loginData = await loginRes.json();
    expect(loginData.success).toBe(true);
    expect(loginData.data.user.role).toBe("STAFF");
    expect(loginData.data.session.state).toBe("PENDING_MFA");

    const pendingToken = loginData.data.accessToken;
    const staffRefreshToken = loginData.data.refreshToken;
    const staffSessionId = loginData.data.session.sessionId;
    expect(staffSessionId).toBeTruthy();

    // 2. Gateway enforces PENDING_MFA allowlist: clinical route is blocked
    const blockedRes = await fetch(`${GATEWAY_URL}/api/v1/appointments`, {
      headers: {
        Authorization: `Bearer ${pendingToken}`,
        Accept: "application/json",
      },
    });
    expect(blockedRes.status).toBe(403);
    const blockedData = await blockedRes.json();
    expect(blockedData.error?.code).toBe("MFA_VERIFICATION_REQUIRED");

    // 3. Create MFA challenge for STAFF_ADMIN_LOGIN
    const chRes = await fetch(`${GATEWAY_URL}/api/v1/auth/mfa/challenges`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pendingToken}`,
        "x-session-id": staffSessionId,
      },
      body: JSON.stringify({
        purpose: "STAFF_ADMIN_LOGIN",
      }),
    });
    expect(chRes.status).toBe(201);
    const chData = await chRes.json();
    expect(chData.success).toBe(true);
    const challengeId = chData.data.challengeId;
    expect(challengeId).toBeTruthy();

    // 4. Verify TOTP code
    const totpCode = generateTotp(TOTP_SECRET);
    const verifyRes = await fetch(`${GATEWAY_URL}/api/v1/auth/mfa/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pendingToken}`,
      },
      body: JSON.stringify({
        challengeId,
        code: totpCode,
        sessionId: staffSessionId,
      }),
    });
    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.success).toBe(true);
    expect(verifyData.data.purpose).toBe("STAFF_ADMIN_LOGIN");
    expect(verifyData.data.session.state).toBe("ACTIVE");

    // 5. Protected routes are now accessible
    const profileRes = await fetch(`${GATEWAY_URL}/api/v1/users/me`, {
      headers: {
        Authorization: `Bearer ${pendingToken}`,
        Accept: "application/json",
      },
    });
    expect(profileRes.status).toBe(200);
    const profileData = await profileRes.json();
    expect(profileData.data.email).toBe(STAFF_EMAIL);
    expect(profileData.data.role).toBe("STAFF");

    // 6. Record session activity
    const actRes = await fetch(`${GATEWAY_URL}/api/v1/auth/session/activity`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pendingToken}`,
        "x-session-id": staffSessionId,
      },
      body: JSON.stringify({ sessionId: staffSessionId }),
    });
    expect(actRes.status).toBe(200);

    // 7. List active sessions (G04)
    const listRes = await fetch(`${GATEWAY_URL}/api/v1/auth/sessions`, {
      headers: {
        Authorization: `Bearer ${pendingToken}`,
        Accept: "application/json",
      },
    });
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.success).toBe(true);
    expect(listData.data.items).toBeInstanceOf(Array);
    const activeStaffSession = listData.data.items.find(
      (s: any) => s.sessionId === staffSessionId
    );
    expect(activeStaffSession).toBeTruthy();
    expect(activeStaffSession.state).toBe("ACTIVE");

    // 8. Revoke session via /profile action (DELETE /api/v1/auth/sessions/:sessionId)
    const revokeRes = await fetch(
      `${GATEWAY_URL}/api/v1/auth/sessions/${staffSessionId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${pendingToken}`,
          Accept: "application/json",
        },
      }
    );
    expect(revokeRes.status).toBe(200);
    const revokeData = await revokeRes.json();
    expect(revokeData.data.revoked).toBe(true);

    // 9. Verify session is no longer active in sessions list
    const afterRevokeListRes = await fetch(`${GATEWAY_URL}/api/v1/auth/sessions`, {
      headers: {
        Authorization: `Bearer ${pendingToken}`,
        Accept: "application/json",
      },
    });
    expect(afterRevokeListRes.status).toBe(200);
    const afterRevokeListData = await afterRevokeListRes.json();
    const stillActive = afterRevokeListData.data.items.some(
      (s: any) => s.sessionId === staffSessionId
    );
    expect(stillActive).toBe(false);

    // 10. Clean logout via Gateway
    const logoutRes = await fetch(`${GATEWAY_URL}/api/v1/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pendingToken}`,
      },
      body: JSON.stringify({ refreshToken: staffRefreshToken }),
    });
    expect(logoutRes.status).toBe(200);

    // 11. Verify server-side session invalidation: logged out token is rejected
    const invalidatedRes = await fetch(`${GATEWAY_URL}/api/v1/users/me`, {
      headers: {
        Authorization: `Bearer ${pendingToken}`,
        Accept: "application/json",
      },
    });
    expect(invalidatedRes.status).toBe(401);
  }, 30000);

  it("E2E-ADMIN-STEP-UP: Admin login -> step-up TOTP verification -> role/status update with proof", async () => {
    // 1. Admin login
    const adminLoginRes = await fetch(`${GATEWAY_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: PASSWORD }),
    });
    expect(adminLoginRes.status).toBe(200);
    const adminLoginData = await adminLoginRes.json();
    const adminToken = adminLoginData.data.accessToken;
    const adminSessionId = adminLoginData.data.session.sessionId;

    // Verify MFA for Admin login
    const adminChRes = await fetch(`${GATEWAY_URL}/api/v1/auth/mfa/challenges`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
        "x-session-id": adminSessionId,
      },
      body: JSON.stringify({
        purpose: "STAFF_ADMIN_LOGIN",
      }),
    });
    const adminChData = await adminChRes.json();
    if (!adminChRes.ok) {
      console.error("adminChRes error:", adminChData);
    }
    expect(adminChRes.status).toBe(201);
    const adminTotp = generateTotp(TOTP_SECRET);
    await fetch(`${GATEWAY_URL}/api/v1/auth/mfa/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        challengeId: adminChData.data.challengeId,
        code: adminTotp,
        sessionId: adminSessionId,
      }),
    });

    // 2. Attempt sensitive operation WITHOUT proof -> rejected
    const targetUserId = "5b1dea91-1d79-4d5e-95ab-e0a5dc925241"; // Staff user
    const directPatchRes = await fetch(
      `${GATEWAY_URL}/api/v1/users/${targetUserId}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: "ACTIVE" }),
      }
    );
    expect([400, 403]).toContain(directPatchRes.status); // validation error or step-up required: verificationProofId required

    // 3. Create Step-Up Challenge for AUTHORIZE_SENSITIVE_OPERATION
    const stepUpChRes = await fetch(`${GATEWAY_URL}/api/v1/auth/mfa/challenges`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
        "x-session-id": adminSessionId,
      },
      body: JSON.stringify({
        purpose: "AUTHORIZE_SENSITIVE_OPERATION",
        context: {
          operation: "UPDATE_USER_STATUS",
          targetUserId,
          resource: targetUserId,
          status: "ACTIVE",
        },
      }),
    });
    expect(stepUpChRes.status).toBe(201);
    const stepUpChData = await stepUpChRes.json();
    const stepUpChallengeId = stepUpChData.data.challengeId;

    // 4. Verify TOTP code for step-up proof
    const stepUpTotp = generateTotp(TOTP_SECRET);
    const stepUpVerifyRes = await fetch(`${GATEWAY_URL}/api/v1/auth/mfa/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        challengeId: stepUpChallengeId,
        code: stepUpTotp,
        sessionId: adminSessionId,
      }),
    });
    expect(stepUpVerifyRes.status).toBe(200);
    const stepUpVerifyData = await stepUpVerifyRes.json();
    const proofId = stepUpVerifyData.data.authorization?.proofId;
    expect(proofId).toBeTruthy();

    // 5. Execute sensitive status update WITH valid proof
    const authorizedPatchRes = await fetch(
      `${GATEWAY_URL}/api/v1/users/${targetUserId}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          status: "ACTIVE",
          verificationProofId: proofId,
        }),
      }
    );
    expect(authorizedPatchRes.status).toBe(200);
    const updatedUserData = await authorizedPatchRes.json();
    expect(updatedUserData.data.status).toBe("ACTIVE");

    // 6. Anti-replay verification: proof cannot be reused
    const replayPatchRes = await fetch(
      `${GATEWAY_URL}/api/v1/users/${targetUserId}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          status: "ACTIVE",
          verificationProofId: proofId,
        }),
      }
    );
    expect(replayPatchRes.status).toBe(403); // STEP_UP_MFA_REQUIRED: already consumed
  }, 30000);
});
