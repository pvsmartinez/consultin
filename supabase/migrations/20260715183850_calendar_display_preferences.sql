-- Per-clinic calendar display preferences. Nullable fields retain the existing
-- behavior for clinics that have not customized their agenda view yet.
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS calendar_visible_days smallint[],
  ADD COLUMN IF NOT EXISTS calendar_display_start_time time without time zone,
  ADD COLUMN IF NOT EXISTS calendar_display_end_time time without time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinics_calendar_visible_days_valid'
  ) THEN
    ALTER TABLE public.clinics
      ADD CONSTRAINT clinics_calendar_visible_days_valid
        CHECK (calendar_visible_days IS NULL OR calendar_visible_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinics_calendar_display_time_range_valid'
  ) THEN
    ALTER TABLE public.clinics
      ADD CONSTRAINT clinics_calendar_display_time_range_valid
        CHECK (
          calendar_display_start_time IS NULL
          OR calendar_display_end_time IS NULL
          OR calendar_display_start_time < calendar_display_end_time
        );
  END IF;
END $$;
