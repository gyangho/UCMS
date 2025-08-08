CREATE TABLE Members (
  student_id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  major VARCHAR(20) NOT NULL,
  phone VARCHAR(20) NOT NULL UNIQUE,
  gender ENUM('남자', '여자') NOT NULL,
  generation INT NOT NULL,
  authority ENUM('일반','부원','임원진','부회장','회장','admin') NOT NULL DEFAULT '일반'
);


CREATE TABLE `Users` (
  `kakao_id` BIGINT UNSIGNED NOT NULL COMMENT '카카오 사용자 고유 ID',
  `name` VARCHAR(50) NOT NULL COMMENT '사용자 이름',
  `email` VARCHAR(100) NOT NULL UNIQUE COMMENT '이메일 주소',
  `profile_image` VARCHAR(255) DEFAULT NULL COMMENT '프로필 이미지 URL',
  `thumbnail_image` VARCHAR(255) DEFAULT NULL COMMENT '썸네일 이미지 URL',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '레코드 생성 시각',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '레코드 수정 시각',
  `phone` VARCHAR(20) NOT NULL UNIQUE,
  `gender` ENUM('남자', '여자') NOT NULL,
  PRIMARY KEY (`kakao_id`)
);

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
)

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

CREATE TABLE event_participants
(
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT NOT NULL COMMENT 'events.id 참조',
  kakao_id BIGINT UNSIGNED NOT NULL COMMENT 'users.kakao_id 참조',
  UNIQUE KEY uk_event_user (event_id, kakao_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (kakao_id) REFERENCES users(kakao_id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE formlist
(
  id VARCHAR(255) NOT NULL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  form_type ENUM('신규모집','활동결과','기타') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO members (student_id,name,major,phone,gender,generation,authority)
 VALUES("20192854","이경호","소프트웨어학부","010-6406-1150","남자",3,6);

CREATE TABLE form_responses (
  response_id   VARCHAR(100) NOT NULL,
  form_id       VARCHAR(100) NOT NULL,
  question_id   VARCHAR(100) NOT NULL,
  answer        TEXT,
  synced_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (response_id, form_id, question_id),
  FOREIGN KEY (form_id) REFERENCES formlist(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE form_questions
(
  idx INT AUTO_INCREMENT UNIQUE KEY,
  form_id VARCHAR(100) NOT NULL,
  question_id VARCHAR(100) NOT NULL,
  question VARCHAR(255) NOT NULL,
  synced_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (form_id, question_id),
  FOREIGN KEY (form_id) REFERENCES formlist(id) ON DELETE CASCADE ON UPDATE CASCADE
)

CREATE TABLE recruiting_members
(
  id INT AUTO_INCREMENT PRIMARY KEY,
  form_id VARCHAR(100) NOT NULL,
  response_id VARCHAR(100) NOT NULL UNIQUE,
  student_id VARCHAR(20),
  name VARCHAR(50),
  major VARCHAR(100),
  phone VARCHAR(20),
  gender ENUM('남자', '여자'),
  synced_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  rating ENUM('대기','불합격','느별','느괜','느좋','합격') NOT NULL DEFAULT '대기'
  FOREIGN KEY (form_id) REFERENCES formlist(id) ON DELETE CASCADE ON UPDATE CASCADE;
);

-- 평가 노트 저장 테이블
CREATE TABLE evaluation_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  response_id VARCHAR(100) NOT NULL UNIQUE,
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE form_templates (
  id INT AUTO_INCREMENT UNIQUE KEY,
  title VARCHAR(255) NOT NULL,
  form_url VARCHAR(500) NOT NULL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 면접 계획 관련 테이블들

-- 면접 계획 메인 테이블
CREATE TABLE interview_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  form_id VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL COMMENT '면접 계획 제목',
  status ENUM('draft', 'active', 'completed', 'cancelled') NOT NULL DEFAULT 'draft' COMMENT '면접 계획 상태',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(20) NOT NULL COMMENT '면접 계획 생성자 (members.name 참조)',
  updated_by VARCHAR(20) NOT NULL COMMENT '면접 계획 수정자 (members.name 참조)' DEFAULT created_by,
  FOREIGN KEY (form_id) REFERENCES formlist(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 면접 날짜 테이블
CREATE TABLE interview_dates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plan_id INT NOT NULL COMMENT 'interview_plans.id 참조',
  interview_date VARCHAR(20) NOT NULL COMMENT '면접 날짜 (MM/DD(요일) 형식)',
  question_id VARCHAR(100) NOT NULL COMMENT '해당 날짜의 질문 ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES interview_plans(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY uk_plan_date (plan_id, interview_date)
);

-- 면접관 테이블
CREATE TABLE interview_interviewers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plan_id INT NOT NULL COMMENT 'interview_plans.id 참조',
  interviewer_id VARCHAR(20) NOT NULL COMMENT '면접관 ID (members.student_id 참조)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES interview_plans(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (interviewer_id) REFERENCES members(student_id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY uk_plan_interviewer (plan_id, interviewer_id)
);  

-- 면접관 시간대 테이블
CREATE TABLE interviewer_time_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plan_id INT NOT NULL COMMENT 'interview_plans.id 참조',
  interviewer_id VARCHAR(20) NOT NULL COMMENT '면접관 ID (members.student_id 참조)',
  interview_date VARCHAR(20) NOT NULL COMMENT '면접 날짜 (MM/DD(요일) 형식)',
  time_slot VARCHAR(20) NOT NULL COMMENT '시간대 (09:00~10:00, 10:00~11:00 등)',
  is_available BOOLEAN NOT NULL DEFAULT true COMMENT '해당 시간대 참여 가능 여부',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES interview_plans(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (interviewer_id) REFERENCES members(student_id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY uk_interviewer_date_time (plan_id, interviewer_id, interview_date, time_slot)
);