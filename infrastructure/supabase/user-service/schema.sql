CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS user_service;

CREATE TABLE IF NOT EXISTS user_service.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_auth_user_id UUID UNIQUE NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('PATIENT', 'DOCTOR', 'STAFF', 'ADMIN')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'LOCKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_service.patient_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  date_of_birth DATE,
  gender TEXT,
  address TEXT,
  emergency_contact TEXT,
  insurance_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_patient_profile_user
ON user_service.patient_profiles (user_id);

CREATE OR REPLACE FUNCTION user_service.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  application_user_id UUID;
BEGIN
  INSERT INTO user_service.users (
    supabase_auth_user_id, email, full_name, role, status
  ) VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
      split_part(COALESCE(NEW.email, 'patient'), '@', 1)
    ),
    'PATIENT',
    'ACTIVE'
  )
  ON CONFLICT (supabase_auth_user_id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      updated_at = now()
  RETURNING id INTO application_user_id;

  INSERT INTO user_service.patient_profiles (user_id)
  VALUES (application_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT OR UPDATE OF email, raw_user_meta_data ON auth.users
FOR EACH ROW EXECUTE FUNCTION user_service.handle_new_auth_user();

INSERT INTO user_service.users (
  supabase_auth_user_id, email, full_name, role, status
)
SELECT
  auth_user.id,
  COALESCE(auth_user.email, ''),
  COALESCE(
    NULLIF(auth_user.raw_user_meta_data ->> 'full_name', ''),
    split_part(COALESCE(auth_user.email, 'patient'), '@', 1)
  ),
  'PATIENT',
  'ACTIVE'
FROM auth.users AS auth_user
ON CONFLICT (supabase_auth_user_id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    updated_at = now();

INSERT INTO user_service.patient_profiles (user_id)
SELECT application_user.id
FROM user_service.users AS application_user
WHERE application_user.role = 'PATIENT'
ON CONFLICT (user_id) DO NOTHING;
