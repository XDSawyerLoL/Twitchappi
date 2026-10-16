-- SWAPP MySQL pilot (MySQL 5.7+/MariaDB 10.2+).
-- NON-DESTRUCTIVE: creates ONE isolated pilot table.
-- Does not change existing tables, users or live Firestore application.
-- Execute only after an independent full backup of the existing Hostinger DB.
-- The pilot deliberately stores the complete original Firestore article JSON.
CREATE TABLE IF NOT EXISTS swapp_migration_news_articles (
  document_id VARCHAR(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  slug VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  title VARCHAR(180) NOT NULL,
  article_status VARCHAR(32) NOT NULL,
  article_json LONGTEXT NOT NULL,
  content_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  source_updated_at VARCHAR(40) DEFAULT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (document_id),
  KEY idx_swapp_migration_articles_status (article_status),
  KEY idx_swapp_migration_articles_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
