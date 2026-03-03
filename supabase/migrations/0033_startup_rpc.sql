-- ────────────────────────────────────────────────────────────────────────────
-- 0033: get_startup_data() — collapse 3+ sequential requests into 1 round trip
-- ────────────────────────────────────────────────────────────────────────────
-- Called once after auth resolves. Returns everything the app needs to render
-- any staff page: the caller's profile, their clinic, and the professionals list.
-- Patients are paginated and large, so they are NOT included here — the DataPrefetcher
-- fires that query in parallel on the client side.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_startup_data()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_profile    jsonb;
  v_clinic     jsonb;
  v_professionals jsonb;
BEGIN
  -- 1. Profile
  SELECT to_jsonb(p) INTO v_profile
  FROM (
    SELECT
      id, clinic_id, roles, name, is_super_admin, avatar_url,
      permission_overrides, notification_phone,
      notif_new_appointment, notif_cancellation, notif_no_show, notif_payment_overdue
    FROM public.user_profiles
    WHERE id = v_user_id
  ) p;

  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('profile', NULL, 'clinic', NULL, 'professionals', '[]'::jsonb);
  END IF;

  -- 2. Clinic (only if user has one)
  IF (v_profile->>'clinic_id') IS NOT NULL THEN
    SELECT to_jsonb(c) INTO v_clinic
    FROM (
      SELECT *
      FROM public.clinics
      WHERE id = (v_profile->>'clinic_id')::uuid
    ) c;

    -- 3. Professionals list (active + inactive, ordered by name)
    SELECT jsonb_agg(pr ORDER BY (pr->>'name')) INTO v_professionals
    FROM (
      SELECT to_jsonb(x) AS pr
      FROM public.professionals x
      WHERE x.clinic_id = (v_profile->>'clinic_id')::uuid
    ) sub;
  END IF;

  RETURN jsonb_build_object(
    'profile',       v_profile,
    'clinic',        COALESCE(v_clinic, 'null'::jsonb),
    'professionals', COALESCE(v_professionals, '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_startup_data() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_startup_data() TO authenticated;
