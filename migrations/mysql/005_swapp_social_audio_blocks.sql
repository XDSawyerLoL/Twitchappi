-- Blocks for optional SWAPP native audio and voice calls.
-- Deliberately fail closed on checks when this table is unavailable.
CREATE TABLE IF NOT EXISTS swapp_social_audio_blocks (
  blocker_id VARCHAR(80) NOT NULL,
  blocked_id VARCHAR(80) NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (blocker_id,blocked_id),
  KEY idx_blocked_lookup (blocked_id,blocker_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
