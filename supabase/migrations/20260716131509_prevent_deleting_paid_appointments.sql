-- Keep financial history intact: an appointment that has ever had a payment
-- record must be cancelled, not permanently deleted.
CREATE OR REPLACE FUNCTION public.prevent_deleting_paid_appointments()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.appointment_payments
    WHERE appointment_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'appointment_has_payments'
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS appointments_prevent_paid_delete ON public.appointments;

CREATE TRIGGER appointments_prevent_paid_delete
  BEFORE DELETE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_deleting_paid_appointments();
