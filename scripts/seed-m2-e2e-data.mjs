import crypto from "node:crypto";
import pg from "pg";
import { createSupabaseAuthProvider } from "../services/user-service/dist/auth.js";

const SUPABASE_URL = "https://xzzimreciacbozayycmh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_f6g7-5cfhzWtcsuwZAymKg_6k_ffsIC";

const DB_PORT = 5433;
const DB_USER = "postgres";
const DB_PASS = "testpassword";
const DB_HOST = "127.0.0.1";

const userPool = new pg.Pool({ connectionString: `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/user_service_test` });
const doctorPool = new pg.Pool({ connectionString: `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/doctor_service_test` });
const appointmentPool = new pg.Pool({ connectionString: `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/appointment_service_test` });
const recordPool = new pg.Pool({ connectionString: `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/medical_record_service_test` });
const notifyPool = new pg.Pool({ connectionString: `postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/notification_service_test` });

const TEST_SECRET = "JBSWY3DPEHPK3PXP"; // Base32 test secret

export const TEST_ACCOUNTS = {
  patient: {
    email: "patient.live.e2e@clinic.test",
    password: "Password123!",
    fullName: "Patient E2E",
    role: "PATIENT"
  },
  staff: {
    email: "staff.live.e2e@clinic.test",
    password: "Password123!",
    fullName: "Staff Reception E2E",
    role: "STAFF",
    totpSecret: TEST_SECRET
  },
  doctor: {
    email: "doctor.live.e2e@clinic.test",
    password: "Password123!",
    fullName: "Dr. Minh Nguyen",
    role: "DOCTOR",
    totpSecret: TEST_SECRET
  },
  admin: {
    email: "admin.live.e2e@clinic.test",
    password: "Password123!",
    fullName: "Admin System E2E",
    role: "ADMIN",
    totpSecret: TEST_SECRET
  }
};

async function getOrRegisterSupabaseUser(provider, email, password, fullName) {
  try {
    const login = await provider.signIn(email, password);
    return login.authUserId;
  } catch (err) {
    const signup = await provider.signUp(fullName, email, password);
    return signup.authUserId;
  }
}

async function main() {
  console.log("=== SEEDING M2-INTEGRATION-006 E2E DATA ===");
  const provider = createSupabaseAuthProvider(SUPABASE_URL, SUPABASE_ANON_KEY, 15000);

  // 1. Clean transactional / test data in appointment, record, notify
  console.log("Cleaning appointment, record, notification databases...");
  await appointmentPool.query("TRUNCATE appointment_service.appointment_completions, appointment_service.appointment_outbox_events, appointment_service.appointment_status_history, appointment_service.idempotency_requests, appointment_service.appointments CASCADE;");
  await recordPool.query("TRUNCATE medical_record_service.medical_record_audit_logs, medical_record_service.outbox_events, medical_record_service.medical_records, medical_record_service.clinical_grants, medical_record_service.consumed_proofs, medical_record_service.consumed_grant_proofs, medical_record_service.idempotency_requests, medical_record_service.finalization_contexts CASCADE;");
  await notifyPool.query("TRUNCATE notification_service.notifications, notification_service.processed_events, notification_service.notification_deliveries, notification_service.appointment_reminders CASCADE;");

  // Clean user sessions and challenges
  await userPool.query("TRUNCATE user_service.sessions, user_service.mfa_challenges, user_service.mfa_proofs CASCADE;");

  // 2. Provision Supabase & local User Service records
  console.log("Provisioning synthetic accounts in User Service...");
  const seeded = {};

  for (const [key, acc] of Object.entries(TEST_ACCOUNTS)) {
    console.log(`- Account [${acc.role}]: ${acc.email}`);
    const authUserId = await getOrRegisterSupabaseUser(provider, acc.email, acc.password, acc.fullName);

    // Upsert into auth.users stub
    await userPool.query(`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
    `, [authUserId, acc.email, JSON.stringify({ full_name: acc.fullName })]);

    // Upsert into user_service.users
    const userRes = await userPool.query(`
      INSERT INTO user_service.users (supabase_auth_user_id, email, full_name, role, status)
      VALUES ($1, $2, $3, $4, 'ACTIVE')
      ON CONFLICT (supabase_auth_user_id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        status = 'ACTIVE'
      RETURNING id, supabase_auth_user_id, email, full_name, role, status;
    `, [authUserId, acc.email, acc.fullName, acc.role]);

    const user = userRes.rows[0];
    seeded[key] = { ...acc, userId: user.id, authUserId };

    // Patient profile
    if (acc.role === "PATIENT") {
      await userPool.query("DELETE FROM user_service.patient_profiles WHERE user_id = $1;", [user.id]);
      const patRes = await userPool.query(`
        INSERT INTO user_service.patient_profiles (user_id, date_of_birth, gender, address)
        VALUES ($1, '1995-05-15', 'OTHER', '123 Test Street, District 1, HCMC')
        RETURNING id;
      `, [user.id]);
      seeded[key].patientId = patRes.rows[0].id;
    }

    // TOTP Factor
    if (acc.totpSecret) {
      await userPool.query(`DELETE FROM user_service.mfa_factors WHERE user_id = $1;`, [user.id]);
      const factorRes = await userPool.query(`
        INSERT INTO user_service.mfa_factors (user_id, type, status, secret_encrypted)
        VALUES ($1, 'totp', 'verified', $2)
        RETURNING id;
      `, [user.id, acc.totpSecret]);
      seeded[key].factorId = factorRes.rows[0].id;
    }
  }

  // 3. Provision Doctor Service
  console.log("Provisioning Doctor & Specialty records...");
  let specRes = await doctorPool.query(`SELECT id, name FROM doctor_service.specialties WHERE name = 'General Cardiology' LIMIT 1;`);
  let specialtyId;
  if (specRes.rows.length > 0) {
    specialtyId = specRes.rows[0].id;
  } else {
    const insertSpec = await doctorPool.query(`
      INSERT INTO doctor_service.specialties (name, description, is_active)
      VALUES ('General Cardiology', 'Comprehensive heart and cardiovascular care', true)
      RETURNING id, name;
    `);
    specialtyId = insertSpec.rows[0].id;
  }

  const docUser = seeded.doctor;
  await doctorPool.query("DELETE FROM doctor_service.doctors WHERE user_id = $1;", [docUser.userId]);
  const docRes = await doctorPool.query(`
    INSERT INTO doctor_service.doctors (user_id, specialty_id, display_name, bio, is_active)
    VALUES ($1, $2, $3, 'Senior Cardiologist with 15 years experience', true)
    RETURNING id, user_id, display_name;
  `, [docUser.userId, specialtyId, docUser.fullName]);
  const doctorId = docRes.rows[0].id;
  seeded.doctor.doctorId = doctorId;
  seeded.doctor.specialtyId = specialtyId;

  // Insert active doctor schedule: Monday-Friday 08:00 to 17:00, 30 min slots
  await doctorPool.query("DELETE FROM doctor_service.doctor_schedules WHERE doctor_id = $1;", [doctorId]);
  for (let weekday = 1; weekday <= 5; weekday++) {
    await doctorPool.query(`
      INSERT INTO doctor_service.doctor_schedules (doctor_id, weekday, start_time, end_time, slot_duration_minutes, is_active)
      VALUES ($1, $2, '08:00:00', '17:00:00', 30, true);
    `, [doctorId, weekday]);
  }

  console.log("\n=== SEEDING COMPLETED SUCCESSFULLY ===");
  console.log(JSON.stringify(seeded, null, 2));

  await userPool.end();
  await doctorPool.end();
  await appointmentPool.end();
  await recordPool.end();
  await notifyPool.end();
}

main().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
