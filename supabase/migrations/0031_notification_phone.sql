-- Add personal notification preferences to user_profiles.
-- notification_phone : the user's personal WhatsApp number to receive alerts
-- notif_*            : which clinic events trigger a WhatsApp message to this user

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS notification_phone         TEXT,
  ADD COLUMN IF NOT EXISTS notif_new_appointment      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notif_cancellation         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notif_no_show              BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notif_payment_overdue      BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN user_profiles.notification_phone    IS 'Personal WhatsApp number for receiving clinic event alerts (e.g. 5511999990000)';
COMMENT ON COLUMN user_profiles.notif_new_appointment IS 'Receive a WhatsApp alert when a new appointment is booked';
COMMENT ON COLUMN user_profiles.notif_cancellation    IS 'Receive a WhatsApp alert when a patient cancels';
COMMENT ON COLUMN user_profiles.notif_no_show         IS 'Receive a WhatsApp alert when a patient is marked as no-show';
COMMENT ON COLUMN user_profiles.notif_payment_overdue IS 'Receive a WhatsApp alert when a payment is overdue';
