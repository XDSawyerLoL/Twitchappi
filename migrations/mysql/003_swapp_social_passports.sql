-- SWAPP SOCIAL next-generation player passports. Optional public discovery only.
CREATE TABLE IF NOT EXISTS swapp_social_passports (
 user_id VARCHAR(80) NOT NULL PRIMARY KEY,
 handle VARCHAR(40) NOT NULL,
 display_name VARCHAR(60) NOT NULL DEFAULT '',
 bio VARCHAR(200) NOT NULL DEFAULT '',
 games_json JSON NOT NULL,
 platform VARCHAR(30) NOT NULL DEFAULT 'PC',
 play_style VARCHAR(30) NOT NULL DEFAULT 'Décontracté',
 availability VARCHAR(100) NOT NULL DEFAULT '',
 is_public TINYINT(1) NOT NULL DEFAULT 0,
 updated_at BIGINT NOT NULL,
 INDEX ix_passport_handle (handle)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
