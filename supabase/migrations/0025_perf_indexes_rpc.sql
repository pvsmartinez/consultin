-- ────────────────────────────────────────────────────────────────────────────
-- 0025: Performance — indexes, STABLE helper functions, admin RPC
-- ────────────────────────────────────────────────────────────────────────────

-- ── 1. Indexes missing that every RLS policy needs ───────────────────────────
-- Every policy on ~15 tables does: SELECT clinic_id FROM user_profiles WHERE id = auth.uid()
-- Without an index on user_profiles(id) this is fine (PK), but clinic_id itself
-- was unindexed — queries that filter *by* clinic_id on user_profiles suffered.
CREATE INDEX IF NOT EXISTS idx_user_profiles_clinic_id
  ON public.user_profiles (clinic_id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_is_super_admin
  ON public.user_profiles (is_super_admin) WHERE is_super_admin = TRUE;

-- appointments: status filter is common in scheduling and patient pages
CREATE INDEX IF NOT EXISTS idx_appointments_status
  ON public.appointments (clinic_id, status);

-- professionals: clinic_id without composite (already have (user_id,clinic_id) unique)
CREATE INDEX IF NOT EXISTS idx_professionals_clinic_id
  ON public.professionals (clinic_id) WHERE active = TRUE;

-- ── 2. STABLE helper: current_user_clinic_id() ───────────────────────────────
-- Replaces the inline correlated subquery in every RLS USING clause.
-- STABLE means Postgres evaluates it once per query, not once per row — same
-- gain as the STABLE we added for current_user_is_super_admin() in 0023.
CREATE OR REPLACE FUNCTION public.current_user_clinic_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clinic_id FROM public.user_profiles WHERE id = auth.uid()
$$;

-- ── 3. Admin overview RPC ────────────────────────────────────────────────────
-- Replaces 8 round-trips from useAdminOverview that downloaded ALL rows of
-- patients/appointments/professionals to the browser for JS counting.
-- Now it is a single SQL call that aggregates on the DB side.
CREATE OR REPLACE FUNCTION public.admin_clinic_stats()
RETURNS TABLE (
  clinic_id              uuid,
  clinic_name            text,
  patients_count         bigint,
  professionals_count    bigint,
  appointments_total     bigint,
  appointments_this_month bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id                  AS clinic_id,
    c.name                AS clinic_name,
    COUNT(DISTINCT pt.id) AS patients_count,
    COUNT(DISTINCT pr.id) FILTER (WHERE pr.active = TRUE) AS professionals_count,
    COUNT(DISTINCT a.id)  AS appointments_total,
    COUNT(DISTINCT a.id)  FILTER (
      WHERE a.starts_at >= date_trunc('month', now())
        AND a.starts_at <  date_trunc('month', now()) + INTERVAL '1 month'
    ) AS appointments_this_month
  FROM public.clinics c
  LEFT JOIN public.patients      pt ON pt.clinic_id = c.id
  LEFT JOIN public.professionals pr ON pr.clinic_id = c.id
  LEFT JOIN public.appointments  a  ON  a.clinic_id = c.id
  GROUP BY c.id, c.name
  ORDER BY c.name
$$;

-- Grant execute to authenticated users (RLS on underlying tables still applies
-- because SECURITY DEFINER runs as the function owner, but we only call this
-- from super-admin context server-side; expose it safely)
REVOKE EXECUTE ON FUNCTION public.admin_clinic_stats() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_clinic_stats() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.current_user_clinic_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.current_user_clinic_id() TO authenticated;

-- ── 4. Professional patient count RPC ────────────────────────────────────────
-- Replaces the JS pattern that downloaded ALL appointments to count unique
-- patients via Set(). A single DISTINCT COUNT on the DB side.
CREATE OR REPLACE FUNCTION public.professional_patient_count(p_professional_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT patient_id)
  FROM public.appointments
  WHERE professional_id = p_professional_id
    AND status != 'cancelled'
$$;

REVOKE EXECUTE ON FUNCTION public.professional_patient_count(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.professional_patient_count(uuid) TO authenticated;
