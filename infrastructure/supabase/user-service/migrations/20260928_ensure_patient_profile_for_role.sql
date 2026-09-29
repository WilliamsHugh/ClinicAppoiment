CREATE OR REPLACE FUNCTION user_service.ensure_patient_profile_for_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.role = 'PATIENT' THEN
    INSERT INTO user_service.patient_profiles (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_role_became_patient ON user_service.users;
CREATE TRIGGER on_user_role_became_patient
AFTER INSERT OR UPDATE OF role ON user_service.users
FOR EACH ROW EXECUTE FUNCTION user_service.ensure_patient_profile_for_role();

INSERT INTO user_service.patient_profiles (user_id)
SELECT id
FROM user_service.users
WHERE role = 'PATIENT'
ON CONFLICT (user_id) DO NOTHING;
