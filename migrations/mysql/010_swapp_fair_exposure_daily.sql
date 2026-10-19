-- SWAPP Fair Discovery v2: anonymous opt-in *aggregate* card visibility.
-- No user/session ID, IP, device fingerprint, URL or browsing history columns.
-- Existing Hostinger MySQL database; safe, additive and idempotent.
CREATE TABLE IF NOT EXISTS swapp_fair_exposure_daily (
 event_day DATE NOT NULL,
 placement VARCHAR(16) NOT NULL,
 platform VARCHAR(16) NOT NULL,
 creator_login VARCHAR(40) NOT NULL,
 game_name VARCHAR(100) NOT NULL,
 audience_band VARCHAR(12) NOT NULL,
 impressions INT UNSIGNED NOT NULL DEFAULT 0,
 clicks INT UNSIGNED NOT NULL DEFAULT 0,
 PRIMARY KEY (event_day,placement,platform,creator_login,game_name,audience_band),
 KEY swapp_fair_date_band (event_day,placement,audience_band)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
