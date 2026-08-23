-- UCMS 0.1.1 pending-release migration.
-- 2026-08-19: Consolidate every unapplied RefactoringDocs migration into one Flyway version.
-- Prerequisite: an existing UCMS 0.0.1 schema containing users and pos_instances.

-- 2026-08-20: Preserve stable users.id audit references while collecting the newly required Kakao account fields.
ALTER TABLE users
  MODIFY COLUMN profile_image VARCHAR(2048) DEFAULT NULL COMMENT 'Kakao profile image URL',
  MODIFY COLUMN thumbnail_image VARCHAR(2048) DEFAULT NULL COMMENT 'Kakao thumbnail image URL',
  ADD COLUMN account_email VARCHAR(254) DEFAULT NULL COMMENT 'Kakao account email' AFTER kakao_id,
  ADD COLUMN phone_number VARCHAR(20) DEFAULT NULL COMMENT 'Normalized Kakao phone number' AFTER name,
  ADD COLUMN status ENUM('pending_relink', 'active', 'disabled') NOT NULL DEFAULT 'active' AFTER thumbnail_image,
  ADD COLUMN account_type ENUM('human', 'system') NOT NULL DEFAULT 'human' AFTER status,
  ADD COLUMN system_key VARCHAR(64) DEFAULT NULL COMMENT 'non-login system account identifier' AFTER account_type,
  ADD COLUMN system_authority ENUM('미인증', '일반', '부원', '임원진', '부회장', '회장', 'admin') DEFAULT NULL AFTER system_key,
  ADD COLUMN kakao_linked_at DATETIME DEFAULT NULL AFTER system_authority,
  ADD COLUMN last_login_at DATETIME DEFAULT NULL AFTER kakao_linked_at,
  ADD UNIQUE INDEX uk_users_phone_number (phone_number),
  ADD UNIQUE INDEX uk_users_system_key (system_key),
  ADD INDEX idx_users_account_email (account_email),
  ADD INDEX idx_users_status (status),
  ADD INDEX idx_users_account_type (account_type);

-- Preserve unlinked general accounts by Kakao ID; linked members must prove name + phone again on their next login.
UPDATE users
   SET kakao_linked_at = COALESCE(kakao_linked_at, updated_at)
 WHERE kakao_id IS NOT NULL;

-- 2026-08-20: Permanently remove authentication-code and room-binding storage; the future chatbot only answers utterances.
DROP TABLE pending_auth;
DROP TABLE group_chat_rooms;
ALTER TABLE users DROP COLUMN chat_room_id;

UPDATE users u
JOIN members m ON m.user_id = u.id
   SET u.name = m.name,
       u.kakao_id = NULL,
       u.account_email = NULL,
       u.phone_number = NULL,
       u.profile_image = NULL,
       u.thumbnail_image = NULL,
       u.status = 'pending_relink',
       u.kakao_linked_at = NULL,
       u.last_login_at = NULL;

-- Existing sessions contain the old identity state and must not survive the relink boundary.
DELETE FROM sessions;

-- 2026-08-20: Record every administrator-triggered Kakao relink without storing cleared Kakao PII.
CREATE TABLE user_reauthentication_audits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  target_user_id INT DEFAULT NULL COMMENT 'users.id at execution time',
  target_student_id VARCHAR(20) NOT NULL COMMENT 'member student ID snapshot',
  target_name VARCHAR(50) NOT NULL COMMENT 'member name snapshot',
  requested_by_user_id INT DEFAULT NULL COMMENT 'administrator users.id',
  requested_by_name VARCHAR(50) NOT NULL COMMENT 'administrator name snapshot',
  cleared_session_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_reauth_target_created (target_user_id, created_at),
  INDEX idx_user_reauth_requester_created (requested_by_user_id, created_at),
  CONSTRAINT fk_user_reauth_target
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_user_reauth_requester
    FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2026-08-22: Seed a credential-less system-owned administrator that is reachable only through audited impersonation.
INSERT INTO users
  (kakao_id, account_email, name, phone_number, profile_image, thumbnail_image,
   status, account_type, system_key, system_authority, kakao_linked_at, last_login_at)
VALUES
  (NULL, NULL, 'UCMS UI 테스트 관리자', NULL, NULL, NULL,
   'active', 'system', 'ui-test-admin', 'admin', NULL, NULL);

CREATE TABLE user_impersonation_audits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_user_id INT DEFAULT NULL COMMENT 'authenticated human administrator users.id',
  actor_name VARCHAR(50) NOT NULL COMMENT 'actor name snapshot',
  target_user_id INT DEFAULT NULL COMMENT 'effective users.id',
  target_name VARCHAR(50) NOT NULL COMMENT 'target name snapshot',
  action ENUM('started', 'ended') NOT NULL,
  reason VARCHAR(255) NOT NULL,
  read_only BOOLEAN NOT NULL DEFAULT TRUE,
  session_fingerprint CHAR(64) NOT NULL COMMENT 'SHA-256 of the server session ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_impersonation_actor_created (actor_user_id, created_at),
  INDEX idx_impersonation_target_created (target_user_id, created_at),
  CONSTRAINT fk_impersonation_actor
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_impersonation_target
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2026-08-22: Replace Kakao entry with password login, verified email 2FA, and revocable trusted devices.
ALTER TABLE users
  MODIFY COLUMN status ENUM('pending_email', 'pending_relink', 'active', 'disabled') NOT NULL DEFAULT 'active',
  ADD COLUMN password_hash VARCHAR(255) DEFAULT NULL AFTER account_email,
  ADD COLUMN email_verified_at DATETIME DEFAULT NULL AFTER password_hash,
  ADD COLUMN student_id VARCHAR(20) DEFAULT NULL AFTER phone_number,
  ADD COLUMN major VARCHAR(100) DEFAULT NULL AFTER student_id,
  DROP INDEX idx_users_account_email,
  ADD UNIQUE INDEX uk_users_account_email (account_email),
  ADD UNIQUE INDEX uk_users_student_id (student_id);

UPDATE users u
JOIN members m ON m.user_id = u.id
   SET u.student_id = m.student_id,
       u.major = m.major;

CREATE TABLE email_auth_challenges (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  purpose ENUM('register', 'login') NOT NULL,
  code_hash CHAR(64) NOT NULL,
  pending_account_email VARCHAR(254) DEFAULT NULL,
  pending_password_hash VARCHAR(255) DEFAULT NULL COMMENT 'registration-only scrypt hash',
  pending_name VARCHAR(50) DEFAULT NULL,
  pending_phone_number VARCHAR(20) DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  consumed_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_challenge_user_purpose (user_id, purpose, created_at),
  CONSTRAINT fk_email_challenge_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE trusted_login_devices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  device_label VARCHAR(120) DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX uk_trusted_device_token (token_hash),
  INDEX idx_trusted_device_user (user_id, expires_at),
  CONSTRAINT fk_trusted_device_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2026-08-23: Audit password recovery and enforce an account-scoped delivery limit without storing temporary passwords.
CREATE TABLE password_reset_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at DATETIME DEFAULT NULL,
  INDEX idx_password_reset_user_requested (user_id, requested_at),
  CONSTRAINT fk_password_reset_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2026-08-22: Some pre-Flyway UCMS databases already contain the notice/inquiry tables; retain them during first adoption.
CREATE TABLE IF NOT EXISTS notice_posts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  author_id INT DEFAULT NULL COMMENT 'users.id reference',
  author_name VARCHAR(50) NOT NULL COMMENT 'author name at creation time',
  minimum_authority ENUM('미인증', '일반', '부원', '임원진', '부회장', '회장', 'admin')
    NOT NULL DEFAULT '부원' COMMENT 'minimum read authority',
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_notice_visibility_updated (minimum_authority, is_pinned, updated_at),
  INDEX idx_notice_author (author_id),
  CONSTRAINT fk_notice_posts_author
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS inquiry_posts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  author_id INT DEFAULT NULL COMMENT 'users.id reference',
  author_name VARCHAR(50) NOT NULL COMMENT 'author name at creation time',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_inquiry_updated (updated_at),
  INDEX idx_inquiry_author (author_id),
  CONSTRAINT fk_inquiry_posts_author
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS inquiry_comments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  inquiry_id BIGINT UNSIGNED NOT NULL COMMENT 'inquiry_posts.id reference',
  author_id INT DEFAULT NULL COMMENT 'users.id reference',
  author_name VARCHAR(50) NOT NULL COMMENT 'author name at creation time',
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_inquiry_comment_created (inquiry_id, created_at),
  INDEX idx_inquiry_comment_author (author_id),
  CONSTRAINT fk_inquiry_comments_inquiry
    FOREIGN KEY (inquiry_id) REFERENCES inquiry_posts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_inquiry_comments_author
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2026-08-22: Older manually managed schemas may already have the complete POS audit block.
SET @pos_audit_ddl = IF(
  (SELECT COUNT(*)
     FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'pos_instances'
      AND column_name IN ('created_by', 'created_at', 'updated_at', 'closed_at')) = 4,
  'SELECT 1',
  'ALTER TABLE pos_instances
     MODIFY COLUMN status ENUM(''inactive'', ''active'', ''closed'') NOT NULL DEFAULT ''inactive'',
     ADD COLUMN created_by INT DEFAULT NULL COMMENT ''users.id reference'' AFTER status,
     ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_by,
     ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
     ADD COLUMN closed_at DATETIME DEFAULT NULL AFTER updated_at,
     ADD INDEX idx_pos_instances_creator (created_by),
     ADD CONSTRAINT fk_pos_instances_creator
       FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE'
);
PREPARE pos_audit_stmt FROM @pos_audit_ddl;
EXECUTE pos_audit_stmt;
DEALLOCATE PREPARE pos_audit_stmt;

-- 2026-08-20: A recruitment draft exists before its Google Form, so model the campaign separately from formlist.
CREATE TABLE recruitment_instances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  form_id VARCHAR(255) DEFAULT NULL COMMENT '1:1 linked Google Form ID',
  title VARCHAR(255) NOT NULL,
  -- 2026-08-23: Keep member registration between interview completion and final campaign closure.
  status ENUM('draft', 'recruiting', 'planning', 'interview', 'interview_completed', 'closed') NOT NULL DEFAULT 'draft',
  recruit_start DATETIME DEFAULT NULL,
  recruit_end DATETIME DEFAULT NULL,
  -- 2026-08-23: Drive dynamic interview-date questions and the later timetable plan.
  interview_start DATETIME DEFAULT NULL,
  interview_end DATETIME DEFAULT NULL,
  form_url VARCHAR(2048) DEFAULT NULL,
  promotion_copy TEXT DEFAULT NULL,
  created_by INT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  interview_started_at DATETIME DEFAULT NULL,
  closed_at DATETIME DEFAULT NULL,
  members_registered_at DATETIME DEFAULT NULL,
  snapshot_applicant_count INT UNSIGNED DEFAULT NULL,
  snapshot_first_pass_count INT UNSIGNED DEFAULT NULL,
  snapshot_final_pass_count INT UNSIGNED DEFAULT NULL,
  UNIQUE INDEX uk_recruitment_form (form_id),
  INDEX idx_recruitment_status_updated (status, updated_at),
  CONSTRAINT fk_recruitment_form
    FOREIGN KEY (form_id) REFERENCES formlist(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_recruitment_creator
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Existing Google Forms predate the lifecycle feature and are retained as read-only closed campaigns.
INSERT INTO recruitment_instances
  (form_id, title, status, form_url, created_at, updated_at, closed_at)
SELECT id,
       title,
       'closed',
       CONCAT('https://docs.google.com/forms/d/', id, '/edit'),
       COALESCE(created_at, CURRENT_TIMESTAMP),
       COALESCE(created_at, CURRENT_TIMESTAMP),
       COALESCE(created_at, CURRENT_TIMESTAMP)
  FROM formlist;

CREATE TABLE recruitment_posters (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  recruitment_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_data LONGBLOB NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_recruitment_posters_order (recruitment_id, sort_order, id),
  CONSTRAINT fk_recruitment_posters_recruitment
    FOREIGN KEY (recruitment_id) REFERENCES recruitment_instances(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A recruitment owns at most one interview plan without deleting legacy duplicate plans for the same old form.
ALTER TABLE interview_plans
  ADD COLUMN recruitment_id BIGINT UNSIGNED DEFAULT NULL AFTER form_id,
  ADD UNIQUE INDEX uk_interview_plans_recruitment (recruitment_id),
  ADD CONSTRAINT fk_interview_plans_recruitment
    FOREIGN KEY (recruitment_id) REFERENCES recruitment_instances(id) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE interview_slot_locations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  plan_id INT NOT NULL,
  interview_date VARCHAR(20) NOT NULL,
  time_slot VARCHAR(20) NOT NULL,
  location VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX uk_interview_slot_location (plan_id, interview_date, time_slot),
  CONSTRAINT fk_interview_slot_location_plan
    FOREIGN KEY (plan_id) REFERENCES interview_plans(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2026-08-20: Keep the POS promotion PDF in the database and preserve original stock for sale-rate calculation.
ALTER TABLE pos_instances
  ADD COLUMN poster_file_name VARCHAR(255) DEFAULT NULL AFTER closed_at,
  ADD COLUMN poster_mime_type VARCHAR(100) DEFAULT NULL AFTER poster_file_name,
  ADD COLUMN poster_pdf LONGBLOB DEFAULT NULL AFTER poster_mime_type,
  ADD COLUMN auto_close_at DATETIME DEFAULT NULL AFTER poster_pdf,
  ADD INDEX idx_pos_auto_close (status, auto_close_at);

-- 2026-08-22: Store POS promotional copy beside its poster for dashboard advertising.
ALTER TABLE pos_instances
  ADD COLUMN promotion_copy TEXT DEFAULT NULL AFTER poster_pdf;

-- 2026-08-22: Retire the duplicate first-round rejection label and preserve its meaning as rejection.
UPDATE recruiting_members
   SET rating = '불합격'
 WHERE rating = '1차불합격';

ALTER TABLE recruiting_members
  MODIFY COLUMN rating ENUM('대기', '1차합격', '불합격', '느별', '느괜', '느좋', '최종합격')
    NOT NULL DEFAULT '대기';

ALTER TABLE pos_products
  ADD COLUMN initial_stock INT NOT NULL DEFAULT 0 AFTER stock;

UPDATE pos_products SET initial_stock = stock;
