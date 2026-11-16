-- SWAPP SOCIAL native relational shadow, stage 1.
-- Data preserved in swapp_social_native_store. Apply only with manual backfill.
CREATE TABLE IF NOT EXISTS swapp_social_native_posts_v2 (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  author_id VARCHAR(80) NOT NULL,
  circle_id VARCHAR(80) NULL,
  reply_to_id VARCHAR(80) NULL,
  created_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  payload_json LONGTEXT NOT NULL,
  KEY snp_author (author_id,created_at),
  KEY snp_feed (deleted_at,created_at),
  KEY snp_reply (reply_to_id,created_at),
  KEY snp_circle (circle_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS swapp_social_native_messages_v2 (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  conversation_key VARCHAR(180) NOT NULL,
  sender_id VARCHAR(80) NOT NULL,
  recipient_id VARCHAR(80) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  read_at DATETIME(3) NULL,
  payload_json LONGTEXT NOT NULL,
  KEY snm_thread (conversation_key,created_at),
  KEY snm_recipient (recipient_id,read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS swapp_social_native_index_meta (
  store_key VARCHAR(40) NOT NULL PRIMARY KEY,
  migration_version INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
