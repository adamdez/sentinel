-- SMS Messages table — proper message store replacing calls_log for SMS
CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL DEFAULT '',
  twilio_sid TEXT,
  twilio_status TEXT,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  user_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sms_messages_phone ON sms_messages(phone, created_at DESC);
CREATE INDEX idx_sms_messages_lead ON sms_messages(lead_id, created_at DESC);
CREATE INDEX idx_sms_messages_unread ON sms_messages(user_id, read_at) WHERE read_at IS NULL;

-- Migrate existing SMS data from calls_log
INSERT INTO sms_messages (phone, direction, body, twilio_sid, created_at)
SELECT phone_dialed, 'inbound', COALESCE(notes, ''), twilio_sid, started_at
FROM calls_log
WHERE disposition = 'sms_inbound'
ON CONFLICT DO NOTHING;
