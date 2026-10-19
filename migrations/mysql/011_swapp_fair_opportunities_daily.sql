-- Fair Discovery v4: server-returned live candidates (not rendered impressions).
-- Public creator/game/placement aggregates only. No visitor, IP, device or session IDs.
-- Separate from the opt-in swapp_fair_exposure_daily table; 14-day retention.
CREATE TABLE IF NOT EXISTS swapp_fair_opportunities_daily (
 event_day DATE NOT NULL,
 placement VARCHAR(16) NOT NULL,
 platform VARCHAR(16) NOT NULL,
 creator_login VARCHAR(40) NOT NULL,
 game_name VARCHAR(100) NOT NULL,
 audience_band VARCHAR(12) NOT NULL,
 opportunities INT UNSIGNED NOT NULL DEFAULT 0,
 PRIMARY KEY (event_day,placement,platform,creator_login,game_name,audience_band),
 KEY swapp_fair_offers_period (event_day,placement,audience_band)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
