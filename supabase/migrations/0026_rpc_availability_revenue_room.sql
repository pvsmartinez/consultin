-- ─────────────────────────────────────────────────────────────────────────────
-- 0026: RPCs de disponibilidade (atômica) e receita mensal + remoção de room
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. upsert_availability_slots ────────────────────────────────────────────
-- Substitui DELETE + INSERT sequencial do frontend (race condition) por uma
-- operação atômica no banco: toda a substituição ocorre numa única transação.
--
-- p_slots: jsonb array de objetos { weekday int, start_time text, end_time text, active bool }
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_availability_slots(
  p_professional_id uuid,
  p_clinic_id       uuid,
  p_slots           jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deleta todos os slots do profissional atomicamente
  DELETE FROM public.availability_slots
  WHERE professional_id = p_professional_id;

  -- Insere os novos slots (se houver)
  IF jsonb_array_length(p_slots) > 0 THEN
    INSERT INTO public.availability_slots
      (clinic_id, professional_id, weekday, start_time, end_time, active)
    SELECT
      p_clinic_id,
      p_professional_id,
      (slot->>'weekday')::integer,
      slot->>'start_time',
      slot->>'end_time',
      COALESCE((slot->>'active')::boolean, true)
    FROM jsonb_array_elements(p_slots) AS slot;
  END IF;
END;
$$;

-- Permissões: apenas usuarios autenticados (staff da clínica)
REVOKE EXECUTE ON FUNCTION public.upsert_availability_slots(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.upsert_availability_slots(uuid, uuid, jsonb) TO authenticated;

-- ── 2. clinic_month_revenue ─────────────────────────────────────────────────
-- Calcula receita total do mês diretamente no banco (SUM no SQL).
-- Evita buscar todas as linhas no frontend só para fazer reduce() em JS.
-- Retorna centavos (bigint), filtrado pela clínica do usuário via RLS.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.clinic_month_revenue(
  p_month_start timestamptz,
  p_month_end   timestamptz
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(paid_amount_cents), 0)::bigint
  FROM   public.appointments
  WHERE  clinic_id      = public.current_user_clinic_id()
    AND  starts_at     >= p_month_start
    AND  starts_at     <= p_month_end
    AND  status         = 'completed'
    AND  paid_amount_cents IS NOT NULL
$$;

REVOKE EXECUTE ON FUNCTION public.clinic_month_revenue(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.clinic_month_revenue(timestamptz, timestamptz) TO authenticated;

-- ── 3. Drop coluna room (legacy free-text) ──────────────────────────────────
-- Migração para roomId (FK a clinic_rooms) foi feita em 0007_appointment_room.
-- Nenhuma tela escreve ou lê mais o campo room; remover para limpar o schema.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.appointments
  DROP COLUMN IF EXISTS room;
