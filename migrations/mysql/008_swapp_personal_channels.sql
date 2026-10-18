-- SWAPP SOCIAL personal invitation-only text and voice rooms, no changes to existing public rooms.
CREATE TABLE IF NOT EXISTS swapp_social_private_rooms (
 room_id CHAR(36) PRIMARY KEY,
 owner_id VARCHAR(80) NOT NULL,
 invite_nonce CHAR(32) NOT NULL,
 created_at BIGINT NOT NULL,
 INDEX ix_social_personal_owner (owner_id,created_at),
 CONSTRAINT fk_social_personal_room FOREIGN KEY (room_id) REFERENCES swapp_social_rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS swapp_social_private_members (
 room_id CHAR(36) NOT NULL,
 user_id VARCHAR(80) NOT NULL,
 joined_at BIGINT NOT NULL,
 PRIMARY KEY (room_id,user_id),
 INDEX ix_social_personal_member (user_id,joined_at),
 CONSTRAINT fk_social_member_room FOREIGN KEY (room_id) REFERENCES swapp_social_private_rooms(room_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
