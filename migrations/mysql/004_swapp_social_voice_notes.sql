-- Short SWAPP SOCIAL voice notes. Audio is never publicly reachable by URL.
-- Application-level retention: expired notes are inaccessible after 30 days.
CREATE TABLE IF NOT EXISTS swapp_social_voice_notes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  sender_id VARCHAR(80) NOT NULL,
  recipient_id VARCHAR(80) NOT NULL,
  sender_handle VARCHAR(40) NOT NULL,
  recipient_handle VARCHAR(40) NOT NULL,
  mime VARCHAR(24) NOT NULL,
  duration_seconds TINYINT UNSIGNED NOT NULL,
  byte_length INT UNSIGNED NOT NULL,
  audio_data MEDIUMBLOB NOT NULL,
  created_at BIGINT NOT NULL,
  KEY idx_sender_recipient (sender_id, recipient_id, created_at),
  KEY idx_recipient_sender (recipient_id, sender_id, created_at),
  KEY idx_expiry (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
