BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS doctor_service;

CREATE TABLE IF NOT EXISTS doctor_service.specialties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS doctor_specialty_name_unique
  ON doctor_service.specialties (lower(name));

CREATE TABLE IF NOT EXISTS doctor_service.doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  specialty_id UUID NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doctor_specialty_lookup
  ON doctor_service.doctors (specialty_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS doctor_user_id_unique
  ON doctor_service.doctors (user_id);

CREATE TABLE IF NOT EXISTS doctor_service.doctor_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL,
  weekday INT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_duration_minutes INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doctor_schedule_lookup
  ON doctor_service.doctor_schedules (doctor_id, weekday, is_active);

CREATE TABLE IF NOT EXISTS doctor_service.doctor_time_offs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doctor_time_off_lookup
  ON doctor_service.doctor_time_offs (doctor_id, start_at, end_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'doctor_service.doctors'::regclass AND conname = 'doctor_specialty_fk') THEN
    ALTER TABLE doctor_service.doctors ADD CONSTRAINT doctor_specialty_fk FOREIGN KEY (specialty_id) REFERENCES doctor_service.specialties(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'doctor_service.doctor_schedules'::regclass AND conname = 'doctor_schedule_owner_fk') THEN
    ALTER TABLE doctor_service.doctor_schedules ADD CONSTRAINT doctor_schedule_owner_fk FOREIGN KEY (doctor_id) REFERENCES doctor_service.doctors(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'doctor_service.doctor_schedules'::regclass AND conname = 'doctor_schedule_daytime') THEN
    ALTER TABLE doctor_service.doctor_schedules ADD CONSTRAINT doctor_schedule_daytime CHECK (start_time < end_time);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'doctor_service.doctor_schedules'::regclass AND conname = 'doctor_schedule_slot_duration') THEN
    ALTER TABLE doctor_service.doctor_schedules ADD CONSTRAINT doctor_schedule_slot_duration CHECK (slot_duration_minutes BETWEEN 5 AND 240);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'doctor_service.doctor_time_offs'::regclass AND conname = 'doctor_time_off_owner_fk') THEN
    ALTER TABLE doctor_service.doctor_time_offs ADD CONSTRAINT doctor_time_off_owner_fk FOREIGN KEY (doctor_id) REFERENCES doctor_service.doctors(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'doctor_service.doctor_time_offs'::regclass AND conname = 'doctor_time_off_positive') THEN
    ALTER TABLE doctor_service.doctor_time_offs ADD CONSTRAINT doctor_time_off_positive CHECK (start_at < end_at);
  END IF;
END $$;

COMMIT;
