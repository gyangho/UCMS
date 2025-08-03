CREATE TABLE Members (
  student_id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  major VARCHAR(20) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  gender ENUM('남자', '여자') NOT NULL,
  generation INT NOT NULL,
  authority ENUM('일반','부원','임원진','부회장','회장','admin') NOT NULL DEFAULT '일반'
);


CREATE TABLE `Users` (
  `kakao_id` BIGINT UNSIGNED NOT NULL COMMENT '카카오 사용자 고유 ID',
  `name` VARCHAR(50) NOT NULL COMMENT '사용자 이름',
  `email` VARCHAR(100) NOT NULL COMMENT '이메일 주소',
  `profile_image` VARCHAR(255) DEFAULT NULL COMMENT '프로필 이미지 URL',
  `thumbnail_image` VARCHAR(255) DEFAULT NULL COMMENT '썸네일 이미지 URL',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '레코드 생성 시각',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '레코드 수정 시각',
  `phone` VARCHAR(20) NOT NULL,
  `gender` ENUM('남자', '여자') NOT NULL,

  PRIMARY KEY (`kakao_id`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `purchases` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `버터쿠키` INT NOT NULL DEFAULT 0,
  `플레인휘낭시에` INT NOT NULL DEFAULT 0,
  `고구마식빵휘낭` INT NOT NULL DEFAULT 0,
  `고구마휘낭시에` INT NOT NULL DEFAULT 0,
  `흑임자휘낭시에` INT NOT NULL DEFAULT 0,
  `행운과자` INT NOT NULL DEFAULT 0,
  `행운과자증정` INT NOT NULL DEFAULT 0,
  `total_price` DECIMAL(10,2) NOT NULL,
  `purchase_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL COMMENT '일정 제목',
  description TEXT NULL COMMENT '세부 설명',
  start DATETIME NOT NULL COMMENT '시작 시각',
  end DATETIME NOT NULL COMMENT '종료 시각',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                   ON UPDATE CURRENT_TIMESTAMP,
  author_kakao_id BIGINT UNSIGNED NOT NULL,
  updater_id BIGINT UNSIGNED NOT NULL,
  color CHAR(10) NOT NULL DEFAULT '#43ff7bff',
  ismultiple BOOLEAN NOT NULL,
  authority ENUM('일반','부원','임원진','부회장','회장','admin') NOT NULL DEFAULT '일반',
  isRecruiting BOOLEAN DEFAULT false,
  recruit_start DATETIME,
  recruit_end DATETIME
);

ALTER TABLE events
  ADD COLUMN color CHAR(10) NOT NULL
    DEFAULT '#43ff7bff'
    COMMENT '일정 색상 (HEX 코드)';

ALTER TABLE events
  ADD COLUMN ismultiple BOOLEAN NOT NULL
    DEFAULT false;

ALTER TABLE events
  ADD COLUMN authority ENUM('일반','부원','임원진','부회장','회장','admin') NOT NULL DEFAULT '일반';

ALTER TABLE events
CHANGE COLUMN start_time start DATETIME NOT NULL COMMENT '시작 시각',
CHANGE COLUMN end_time end DATETIME NOT NULL COMMENT '종료 시각';

ALTER TABLE events
ADD COLUMN isRecruiting BOOLEAN DEFAULT false,
ADD COLUMN recruit_start DATETIME,
ADD COLUMN recruit_end DATETIME;

CREATE TABLE event_participants
(
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT NOT NULL COMMENT 'events.id 참조',
  kakao_id BIGINT UNSIGNED NOT NULL COMMENT 'users.kakao_id 참조',
  UNIQUE KEY uk_event_user (event_id, kakao_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (kakao_id) REFERENCES users(kakao_id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE formlist
(
  id VARCHAR(255) NOT NULL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  form_type ENUM('신규모집','활동결과','기타') NOT NULL
);

INSERT INTO members (student_id,name,major,phone,gender,generation,authority)
 VALUES("20192854","이경호","소프트웨어학부","010-6406-1150","남자",3,6);

CREATE TABLE form_responses (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  response_id   VARCHAR(100) NOT NULL UNIQUE,
  form_id       VARCHAR(100) NOT NULL,
  question_id   VARCHAR(100) NOT NULL,
  answer        TEXT,
  synced_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE form_questions
(
  form_id VARCHAR(100) NOT NULL,
  question_id VARCHAR(100) NOT NULL,
  question VARCHAR(255) NOT NULL,
  PRIMARY KEY (form_id, question_id),
  FOREIGN KEY (form_id) REFERENCES formlist(id) ON DELETE CASCADE ON UPDATE CASCADE
  synced_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)

CREATE TABLE form_questions
(
  form_id VARCHAR(100) NOT NULL,
  question_id VARCHAR(100) NOT NULL,
  question VARCHAR(255) NOT NULL,
  PRIMARY KEY (form_id, question_id),
  FOREIGN KEY (form_id) REFERENCES formlist(id) ON DELETE CASCADE ON UPDATE CASCADE
  synced_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)

CREATE TABLE recruiting_members
(
  id INT AUTO_INCREMENT PRIMARY KEY,
  response_id VARCHAR(100) NOT NULL UNIQUE,
  student_id VARCHAR(20),
  name VARCHAR(50),
  major VARCHAR(100),
  phone VARCHAR(20),
  gender ENUM('남자', '여자'),
  synced_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE recruiting_members
ADD COLUMN rating ENUM('대기','불합격','느별','느괜','느좋','합격') NOT NULL DEFAULT '대기';