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

CREATE TABLE recruit_responses (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  response_id   VARCHAR(100) NOT NULL UNIQUE,
  form_id       VARCHAR(100) NOT NULL,
  answers_json  JSON NOT NULL,
  synced_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE events (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(255) NOT NULL COMMENT '일정 제목',
  description   TEXT         NULL COMMENT '세부 설명',
  start_time    DATETIME     NOT NULL COMMENT '시작 시각',
  end_time      DATETIME     NOT NULL COMMENT '종료 시각',
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                   ON UPDATE CURRENT_TIMESTAMP
);