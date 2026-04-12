-- Fix WhatsApp-related RLS policies to avoid bare auth.uid() calls.
-- This keeps fresh environments and replayed migrations aligned with the
-- workspace rule: always wrap auth helpers in (select ...).

DROP POLICY IF EXISTS "clinic staff can view their sessions" ON whatsapp_sessions;
DROP POLICY IF EXISTS "clinic staff can update their sessions" ON whatsapp_sessions;
DROP POLICY IF EXISTS "clinic staff can view their messages" ON whatsapp_messages;
DROP POLICY IF EXISTS "attendants can insert outbound messages" ON whatsapp_messages;
DROP POLICY IF EXISTS "clinic staff can manage their templates" ON whatsapp_templates;
DROP POLICY IF EXISTS "clinic staff can view their notification log" ON notification_log;

CREATE POLICY "clinic staff can view their sessions"
  ON whatsapp_sessions FOR SELECT
  USING (
    clinic_id = (
      SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "clinic staff can update their sessions"
  ON whatsapp_sessions FOR UPDATE
  USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
  )
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
  );

CREATE POLICY "clinic staff can view their messages"
  ON whatsapp_messages FOR SELECT
  USING (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
  );

CREATE POLICY "attendants can insert outbound messages"
  ON whatsapp_messages FOR INSERT
  WITH CHECK (
    clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid()))
    AND direction = 'outbound'
    AND sent_by = 'attendant'
  );

CREATE POLICY "clinic staff can manage their templates"
  ON whatsapp_templates FOR ALL
  USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid())))
  WITH CHECK (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid())));

CREATE POLICY "clinic staff can view their notification log"
  ON notification_log FOR SELECT
  USING (clinic_id = (SELECT clinic_id FROM user_profiles WHERE id = (SELECT auth.uid())));
