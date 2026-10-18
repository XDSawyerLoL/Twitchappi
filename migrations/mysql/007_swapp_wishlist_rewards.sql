-- No purchase is inferred from a wish; no money, credit or chance-based prizes.
CREATE TABLE IF NOT EXISTS swapp_social_game_wishlist (
 user_id VARCHAR(80) NOT NULL,
 game_slug VARCHAR(90) NOT NULL,
 game_name VARCHAR(100) NOT NULL,
 created_at BIGINT NOT NULL,
 PRIMARY KEY (user_id,game_slug),
 INDEX idx_swapp_wishlist_created (user_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- One locked counter per account prevents concurrent follow actions exceeding the cap.
CREATE TABLE IF NOT EXISTS swapp_social_reward_accounts (
 user_id VARCHAR(80) NOT NULL PRIMARY KEY,
 points INT UNSIGNED NOT NULL DEFAULT 0,
 discovery_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
 updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Lifetime idempotency: un-follow/re-follow cannot grant a second award.
CREATE TABLE IF NOT EXISTS swapp_social_reward_ledger (
 user_id VARCHAR(80) NOT NULL,
 event_key VARCHAR(110) NOT NULL,
 event_type VARCHAR(32) NOT NULL,
 points SMALLINT UNSIGNED NOT NULL,
 created_at BIGINT NOT NULL,
 PRIMARY KEY (user_id,event_key),
 INDEX idx_swapp_rewards_recent (user_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
