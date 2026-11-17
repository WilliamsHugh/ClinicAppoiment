const DATABASE_NAMES = {
  user: "user_service_test",
  doctor: "doctor_service_test",
  appointment: "appointment_service_test",
  record: "medical_record_service_test",
  notification: "notification_service_test",
};

const INTERNAL_TOKEN_NAMES = [
  "USER_GATEWAY_INTERNAL_API_TOKEN",
  "USER_DOCTOR_INTERNAL_API_TOKEN",
  "USER_APPOINTMENT_INTERNAL_API_TOKEN",
  "USER_RECORD_INTERNAL_API_TOKEN",
  "DOCTOR_USER_INTERNAL_API_TOKEN",
  "DOCTOR_INTERNAL_API_TOKEN",
  "APPOINTMENT_USER_INTERNAL_API_TOKEN",
  "RECORD_APPOINTMENT_INTERNAL_API_TOKEN",
  "APPOINTMENT_RECORD_INTERNAL_API_TOKEN",
  "APPOINTMENT_NOTIFICATION_INTERNAL_API_TOKEN",
  "NOTIFICATION_INTERNAL_API_TOKEN",
];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the M2 E2E environment`);
  return value;
}

export function readM2E2EConfig({ requireDatabaseReset = false, requireDatabaseWrites = false } = {}) {
  if (requireDatabaseReset && process.env.M2_E2E_ALLOW_DATABASE_RESET !== "1") {
    throw new Error("Refusing to seed/reset databases; set M2_E2E_ALLOW_DATABASE_RESET=1 only for disposable test databases");
  }
  if (requireDatabaseWrites && process.env.M2_E2E_ALLOW_DATABASE_WRITES !== "1") {
    throw new Error("Refusing live database writes; set M2_E2E_ALLOW_DATABASE_WRITES=1 only for disposable test databases");
  }

  const databases = Object.fromEntries(Object.entries(DATABASE_NAMES).map(([service, expectedName]) => {
    const key = `M2_E2E_DATABASE_URL_${service.toUpperCase()}`;
    const connectionString = required(key);
    let parsed;
    try {
      parsed = new URL(connectionString);
    } catch {
      throw new Error(`${key} must be a valid PostgreSQL URL`);
    }
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      throw new Error(`${key} must use PostgreSQL`);
    }
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
    if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
      throw new Error(`${key} must point to loopback; remote E2E databases are not accepted`);
    }
    if (parsed.searchParams.has("host") || parsed.searchParams.has("hostaddr")) {
      throw new Error(`${key} cannot override its loopback host through query parameters`);
    }
    if (decodeURIComponent(parsed.pathname.slice(1)) !== expectedName) {
      throw new Error(`${key} must point to database ${expectedName}`);
    }
    return [service, { connectionString, expectedName }];
  }));

  const internalTokens = Object.fromEntries(INTERNAL_TOKEN_NAMES.map((name) => {
    const value = required(name);
    if (Buffer.byteLength(value, "utf8") < 32) throw new Error(`${name} must contain at least 32 bytes`);
    if (/^(replace|change|example)/i.test(value)) throw new Error(`${name} must be configured with a test-only value`);
    return [name, value];
  }));

  const supabaseUrl = required("M2_E2E_SUPABASE_URL");
  const supabaseAnonKey = required("M2_E2E_SUPABASE_ANON_KEY");
  let supabase;
  try {
    supabase = new URL(supabaseUrl);
  } catch {
    throw new Error("M2_E2E_SUPABASE_URL must be a valid URL");
  }
  const supabaseHost = supabase.hostname.replace(/^\[|\]$/g, "");
  if (supabase.protocol !== "https:" && !(supabase.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(supabaseHost))) {
    throw new Error("M2_E2E Supabase Auth must use HTTPS unless it is a loopback development instance");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(supabaseHost) && !supabase.hostname.endsWith(".supabase.co")) {
    throw new Error("M2_E2E_SUPABASE_URL must point to a Supabase Auth test project or loopback instance");
  }
  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(supabaseHost);
  if (!isLoopback) {
    const projectRef = required("M2_E2E_SUPABASE_PROJECT_REF");
    if (supabase.hostname !== `${projectRef}.supabase.co` || process.env.M2_E2E_AUTH_PROJECT_ISOLATED !== "1") {
      throw new Error("Hosted Auth requires a matching project ref and M2_E2E_AUTH_PROJECT_ISOLATED=1 after verifying it is dedicated to E2E");
    }
  }

  return { databases, internalTokens, supabaseUrl, supabaseAnonKey };
}

export async function assertDatabaseIdentity(pool, expectedName) {
  const result = await pool.query("SELECT current_database() AS database_name");
  if (result.rows[0]?.database_name !== expectedName) {
    throw new Error(`Database identity mismatch; expected ${expectedName}`);
  }
}

export function readM2E2EAccounts() {
  const password = required("M2_E2E_TEST_PASSWORD");
  const totpSecret = required("M2_E2E_TEST_TOTP_SECRET");
  return {
    patient: { email: required("M2_E2E_PATIENT_EMAIL"), password, role: "PATIENT", fullName: "Synthetic E2E Patient" },
    staff: { email: required("M2_E2E_STAFF_EMAIL"), password, role: "STAFF", fullName: "Synthetic E2E Staff", totpSecret },
    doctor: { email: required("M2_E2E_DOCTOR_EMAIL"), password, role: "DOCTOR", fullName: "Synthetic E2E Doctor", totpSecret },
    admin: { email: required("M2_E2E_ADMIN_EMAIL"), password, role: "ADMIN", fullName: "Synthetic E2E Admin", totpSecret },
  };
}

export const m2E2EDatabaseNames = DATABASE_NAMES;
