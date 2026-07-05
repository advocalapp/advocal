
-- Push tokens table: stores FCM device tokens per user per device
CREATE TABLE push_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token        text NOT NULL,
  platform     text NOT NULL DEFAULT 'android' CHECK (platform IN ('android', 'ios', 'web')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);

-- Index for fast lookup by user
CREATE INDEX push_tokens_user_id_idx ON push_tokens(user_id);

-- RLS
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can insert/update/delete their own tokens
CREATE POLICY "push_tokens: owner insert"
  ON push_tokens FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_tokens: owner select"
  ON push_tokens FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "push_tokens: owner update"
  ON push_tokens FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_tokens: owner delete"
  ON push_tokens FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Service role (Edge Functions) can read all tokens
CREATE POLICY "push_tokens: service read all"
  ON push_tokens FOR SELECT
  TO service_role
  USING (true);

-- Notification log table: tracks every push send attempt
CREATE TABLE push_notification_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id   uuid REFERENCES admin_notifications(id) ON DELETE SET NULL,
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  token             text,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('sent','failed','invalid_token')),
  error_message     text,
  sent_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX push_notification_logs_notification_id_idx ON push_notification_logs(notification_id);
CREATE INDEX push_notification_logs_user_id_idx ON push_notification_logs(user_id);

ALTER TABLE push_notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_notification_logs: service all"
  ON push_notification_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Update sent_count + delivery stats on admin_notifications when logs change
CREATE OR REPLACE FUNCTION update_notification_sent_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.notification_id IS NOT NULL THEN
    UPDATE admin_notifications
    SET
      sent_count = (SELECT COUNT(*) FROM push_notification_logs WHERE notification_id = NEW.notification_id AND status = 'sent'),
      status = CASE
        WHEN (SELECT COUNT(*) FROM push_notification_logs WHERE notification_id = NEW.notification_id AND status = 'failed') > 0
          AND (SELECT COUNT(*) FROM push_notification_logs WHERE notification_id = NEW.notification_id AND status = 'sent') = 0
          THEN 'failed'
        ELSE 'sent'
      END
    WHERE id = NEW.notification_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER push_notification_logs_after_insert
  AFTER INSERT ON push_notification_logs
  FOR EACH ROW EXECUTE FUNCTION update_notification_sent_count();
