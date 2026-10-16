-- SWAPP SOCIAL; execute once against the existing Hostinger MySQL database.
CREATE TABLE IF NOT EXISTS swapp_social_matches (
 id CHAR(36) PRIMARY KEY, user_id VARCHAR(80) NOT NULL, handle VARCHAR(40) NOT NULL,
 game VARCHAR(65) NOT NULL, platform VARCHAR(30) NOT NULL, availability VARCHAR(65) NOT NULL,
 style VARCHAR(50) NOT NULL DEFAULT '', created_at BIGINT NOT NULL,
 INDEX ix_match_game (game,created_at), INDEX ix_match_user (user_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS swapp_social_polls (
 id CHAR(36) PRIMARY KEY, owner_id VARCHAR(80) NOT NULL, question VARCHAR(120) NOT NULL,
 choices_json JSON NOT NULL, created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS swapp_social_votes (
 poll_id CHAR(36) NOT NULL, user_id VARCHAR(80) NOT NULL, choice_index INT NOT NULL,
 PRIMARY KEY (poll_id,user_id), CONSTRAINT swapp_social_votes_poll_fk FOREIGN KEY(poll_id) REFERENCES swapp_social_polls(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS swapp_social_rooms (
 id CHAR(36) PRIMARY KEY, owner_id VARCHAR(80) NOT NULL, name VARCHAR(60) NOT NULL,
 game VARCHAR(65) NOT NULL, created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS swapp_social_room_messages (
 id CHAR(36) PRIMARY KEY, room_id CHAR(36) NOT NULL, user_id VARCHAR(80) NOT NULL,
 handle VARCHAR(40) NOT NULL, body VARCHAR(160) NOT NULL, created_at BIGINT NOT NULL,
 INDEX ix_room_messages (room_id,created_at),
 CONSTRAINT swapp_social_messages_room_fk FOREIGN KEY(room_id) REFERENCES swapp_social_rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
