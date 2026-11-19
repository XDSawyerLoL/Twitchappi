-- SWAPP Autonomy — OPTIONAL REVIEWED DDL; NOT applied automatically.
-- Compatible with Hostinger MySQL InnoDB. Run only after backup, DBA review and separate approval.
-- No existing SWAPP table is altered or deleted.
CREATE TABLE IF NOT EXISTS swapp_autonomy_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  engine_id VARCHAR(48) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  dedup_key VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  state ENUM('running','done','failed') NOT NULL DEFAULT 'running',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 1,
  started_at DATETIME(6) NOT NULL,
  lease_expires_at DATETIME(6) DEFAULT NULL,
  completed_at DATETIME(6) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_swapp_autonomy_slot (engine_id,dedup_key),
  KEY ix_swapp_autonomy_running (state,lease_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
