-- Fast, consistent patient lookup for the patient list and appointment selector.
-- Search is clinic-scoped by the caller's RLS context and returns only list fields.

CREATE OR REPLACE FUNCTION public.normalize_patient_search(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT regexp_replace(
    translate(
      lower(coalesce(value, '')),
      'áàãâäéèêëíìîïóòõôöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'
    ),
    '[^a-z0-9]+',
    '',
    'g'
  )
$$;

CREATE INDEX IF NOT EXISTS idx_patients_clinic_name_search
  ON public.patients (clinic_id, (public.normalize_patient_search(name)));

CREATE INDEX IF NOT EXISTS idx_patients_clinic_cpf_digits
  ON public.patients (clinic_id, (regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g')));

CREATE INDEX IF NOT EXISTS idx_patients_clinic_phone_digits
  ON public.patients (clinic_id, (regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')));

CREATE OR REPLACE FUNCTION public.search_patients(
  p_query  text DEFAULT '',
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id                    uuid,
  clinic_id             uuid,
  user_id               uuid,
  name                  text,
  cpf                   text,
  rg                    text,
  birth_date            date,
  sex                   text,
  phone                 text,
  email                 text,
  address_street        text,
  address_number        text,
  address_complement    text,
  address_neighborhood   text,
  address_city           text,
  address_state          text,
  address_zip            text,
  notes                 text,
  custom_fields         jsonb,
  created_at            timestamptz,
  total_count           bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      public.normalize_patient_search(p_query) AS query_text,
      regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g') AS query_digits
  ),
  matches AS (
    SELECT
      p.id,
      p.clinic_id,
      p.user_id,
      p.name,
      p.cpf,
      p.rg,
      p.birth_date,
      p.sex::text AS sex,
      p.phone,
      p.email,
      p.address_street,
      p.address_number,
      p.address_complement,
      p.address_neighborhood,
      p.address_city,
      p.address_state,
      p.address_zip,
      p.notes,
      p.custom_fields,
      p.created_at,
      public.normalize_patient_search(p.name) AS name_search,
      regexp_replace(coalesce(p.cpf, ''), '[^0-9]', '', 'g') AS cpf_digits,
      regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') AS phone_digits
    FROM public.patients p
    CROSS JOIN params
    WHERE p.clinic_id = public.current_user_clinic_id()
      AND (
        params.query_text = ''
        OR public.normalize_patient_search(p.name) LIKE '%' || params.query_text || '%'
        OR (
          params.query_digits <> ''
          AND (
            regexp_replace(coalesce(p.cpf, ''), '[^0-9]', '', 'g') LIKE '%' || params.query_digits || '%'
            OR regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g') LIKE '%' || params.query_digits || '%'
          )
        )
      )
  ),
  ranked AS (
    SELECT
      matches.*,
      count(*) OVER () AS total_count,
      CASE
        WHEN params.query_text <> '' AND matches.name_search = params.query_text THEN 0
        WHEN params.query_digits <> '' AND (matches.cpf_digits = params.query_digits OR matches.phone_digits = params.query_digits) THEN 0
        WHEN params.query_text <> '' AND matches.name_search LIKE params.query_text || '%' THEN 1
        ELSE 2
      END AS match_rank
    FROM matches
    CROSS JOIN params
  )
  SELECT
    ranked.id,
    ranked.clinic_id,
    ranked.user_id,
    ranked.name,
    ranked.cpf,
    ranked.rg,
    ranked.birth_date,
    ranked.sex,
    ranked.phone,
    ranked.email,
    ranked.address_street,
    ranked.address_number,
    ranked.address_complement,
    ranked.address_neighborhood,
    ranked.address_city,
    ranked.address_state,
    ranked.address_zip,
    ranked.notes,
    ranked.custom_fields,
    ranked.created_at,
    ranked.total_count
  FROM ranked
  ORDER BY ranked.match_rank, ranked.name_search, ranked.created_at DESC
  LIMIT LEAST(GREATEST(coalesce(p_limit, 50), 1), 50)
  OFFSET GREATEST(coalesce(p_offset, 0), 0)
$$;

REVOKE EXECUTE ON FUNCTION public.search_patients(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_patients(text, integer, integer) TO authenticated;

COMMENT ON FUNCTION public.search_patients(text, integer, integer) IS
  'Clinic-scoped patient search with accent-insensitive names and punctuation-insensitive CPF/phone matching.';
