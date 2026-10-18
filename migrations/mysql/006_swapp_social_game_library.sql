-- Private followed-games library, keyed to the existing SWAPP account.
-- No orders, ownership or payments are inferred from a followed game.
CREATE TABLE IF NOT EXISTS swapp_social_game_follows (
 user_id VARCHAR(80) NOT NULL,
 game_slug VARCHAR(90) NOT NULL,
 game_name VARCHAR(100) NOT NULL,
 followed_at BIGINT NOT NULL,
 seen_at BIGINT NOT NULL DEFAULT 0,
 updated_at BIGINT NOT NULL,
 PRIMARY KEY (user_id,game_slug),
 INDEX idx_swapp_follows_user_updated (user_id,updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
