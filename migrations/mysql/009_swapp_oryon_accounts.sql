-- SWAPP local accounts — MySQL Hostinger. Safe, additive migration.
-- Run with a restricted database user or allow app bootstrap to run this DDL.
-- NO DROP, TRUNCATE, or implicit Firestore import.
CREATE TABLE IF NOT EXISTS swapp_oryon_accounts (
  user_id VARCHAR(80) NOT NULL PRIMARY KEY,
  login VARCHAR(40) NOT NULL,
  email VARCHAR(191) NOT NULL,
  payload_json JSON NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE KEY swapp_oryon_login_unique (login),
  UNIQUE KEY swapp_oryon_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
