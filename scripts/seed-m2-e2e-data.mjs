import crypto from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { createSupabaseAuthProvider } from "../services/user-service/dist/auth.js";
import { assertDatabaseIdentity, readM2E2EAccounts, readM2E2EConfig } from "./m2-e2e-config.mjs";

const config = readM2E2EConfig({ requireDatabaseReset: true });
const accounts = readM2E2EAccounts();
const provider = createSupabaseAuthProvider(config.supabaseUrl, config.supabaseAnonKey, 15_000);
if (!provider) throw new Error("Dedicated M2 E2E Supabase Auth configuration is required");

const pools = Object.fromEntries(Object.entries(config.databases).map(([service, database]) => [
  service,
  new pg.Pool({ connectionString: database.connectionString, application_name: "clinic-m2-e2e-seed" }),
]));

function safeErrorCode(error) {
  return typeof error?.code === "string" ? error.code : "AUTH_PROVIDER_ERROR";
}

async function main() {
  const authUserIds = {};

  // Authenticate all pre-provisioned test accounts before touching any database.
  for (const [role, account] of Object.entries(accounts)) {
    try {
      const auth = await provider.signIn(account.email, account.password);
      authUserIds[role] = auth.authUserId;
    } catch (error) {
      throw new Error(`Cannot verify pre-provisioned ${role} E2E account (${safeErrorCode(error)}); no database was reset`);
    }
  }

  for (const [service, database] of Object.entries(config.databases)) {
    await assertDatabaseIdentity(pools[service], database.expectedName);
  }

  console.log("[m2-e2e] Verified isolated auth accounts and all five loopback test databases; resetting fixture tables.");
  await pools.appointment.query("TRUNCATE appointment_service.appointment_completions, appointment_service.appointment_outbox_events, appointment_service.appointment_status_history, appointment_service.idempotency_requests, appointment_service.appointments CASCADE");
  await pools.record.query("TRUNCATE medical_record_service.medical_record_audit_logs, medical_record_service.outbox_events, medical_record_service.medical_records, medical_record_service.clinical_grants, medical_record_service.consumed_proofs, medical_record_service.consumed_grant_proofs, medical_record_service.idempotency_requests, medical_record_service.finalization_contexts CASCADE");
  await pools.notification.query("TRUNCATE notification_service.notifications, notification_service.processed_events, notification_service.notification_deliveries, notification_service.appointment_reminders CASCADE");
  await pools.user.query("TRUNCATE user_service.sessions, user_service.mfa_challenges, user_service.mfa_proofs CASCADE");

  const manifest = {};
  for (const [role, account] of Object.entries(accounts)) {
    const authUserId = authUserIds[role];
    await pools.user.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
      [authUserId, account.email, JSON.stringify({ full_name: account.fullName })],
    );
    const userResult = await pools.user.query(
      `INSERT INTO user_service.users (supabase_auth_user_id, email, full_name, role, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       ON CONFLICT (supabase_auth_user_id) DO UPDATE SET
         email = EXCLUDED.email, full_name = EXCLUDED.full_name, role = EXCLUDED.role, status = 'ACTIVE'
       RETURNING id`,
      [authUserId, account.email, account.fullName, account.role],
    );
    manifest[role] = { email: account.email, userId: userResult.rows[0].id };

    if (role === "patient") {
      await pools.user.query("DELETE FROM user_service.patient_profiles WHERE user_id = $1", [userResult.rows[0].id]);
      const patient = await pools.user.query(
        `INSERT INTO user_service.patient_profiles (user_id, date_of_birth, gender, address)
         VALUES ($1, '1995-05-15', 'OTHER', 'Synthetic E2E Address') RETURNING id`,
        [userResult.rows[0].id],
      );
      manifest.patient.patientId = patient.rows[0].id;
    }

    if (account.totpSecret) {
      await pools.user.query("DELETE FROM user_service.mfa_factors WHERE user_id = $1", [userResult.rows[0].id]);
      const factor = await pools.user.query(
        `INSERT INTO user_service.mfa_factors (user_id, type, status, secret_encrypted)
         VALUES ($1, 'totp', 'verified', $2) RETURNING id`,
        [userResult.rows[0].id, account.totpSecret],
      );
      manifest[role].factorId = factor.rows[0].id;
    }
  }

  const specialty = await pools.doctor.query(
    `INSERT INTO doctor_service.specialties (name, description, is_active)
     VALUES ($1, $2, true) RETURNING id`,
    [`M2 E2E ${crypto.randomUUID()}`, "Synthetic test specialty"],
  );
  const previousDoctors = await pools.doctor.query("SELECT id FROM doctor_service.doctors WHERE user_id = $1", [manifest.doctor.userId]);
  for (const previous of previousDoctors.rows) {
    await pools.doctor.query("DELETE FROM doctor_service.doctor_schedules WHERE doctor_id = $1", [previous.id]);
    await pools.doctor.query("DELETE FROM doctor_service.doctors WHERE id = $1", [previous.id]);
  }
  const doctor = await pools.doctor.query(
    `INSERT INTO doctor_service.doctors (user_id, specialty_id, display_name, bio, is_active)
     VALUES ($1, $2, $3, 'Synthetic test account', true) RETURNING id`,
    [manifest.doctor.userId, specialty.rows[0].id, accounts.doctor.fullName],
  );
  manifest.doctor.doctorId = doctor.rows[0].id;
  manifest.doctor.specialtyId = specialty.rows[0].id;

  for (let weekday = 1; weekday <= 5; weekday += 1) {
    await pools.doctor.query(
      `INSERT INTO doctor_service.doctor_schedules
       (doctor_id, weekday, start_time, end_time, slot_duration_minutes, is_active)
       VALUES ($1, $2, '08:00:00', '17:00:00', 30, true)`,
      [manifest.doctor.doctorId, weekday],
    );
  }

  const manifestPath = resolve(".m2-e2e-seed-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await chmod(manifestPath, 0o600);
  console.log(`[m2-e2e] Fixture provisioning complete. Redacted identity manifest written to ${manifestPath}`);
}

main()
  .catch((error) => {
    const code = typeof error?.code === "string" ? error.code : "SEED_FAILED";
    console.error(`[m2-e2e] Seed failed (${code}); details suppressed to avoid exposing configuration or fixture data.`);
    process.exitCode = 1;
  })
  .finally(async () => Promise.all(Object.values(pools).map((pool) => pool.end())));
