CREATE TABLE Members (
  student_id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  major VARCHAR(20) NOT NULL,
  phone VARCHAR(20) NOT NULL UNIQUE,
  gender ENUM('남자', '여자') NOT NULL,
  generation INT NOT NULL,
  authority ENUM('미인증','일반','부원','임원진','부회장','회장','admin') NOT NULL DEFAULT '부원',
  user_id INT UNIQUE COMMENT 'Users.id 참조' DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE members
CHANGE COLUMN authority authority ENUM('미인증','일반','부원','임원진','부회장','회장','admin') NOT NULL DEFAULT '미인증';

CREATE TABLE pending_auth (
  auth_code VARCHAR(10) NOT NULL PRIMARY KEY,
  kakao_id BIGINT UNSIGNED NOT NULL UNIQUE COMMENT '카카오 사용자 고유 ID',
  name VARCHAR(50) NOT NULL,
  profile_image VARCHAR(255) DEFAULT NULL COMMENT '프로필 이미지 URL',
  thumbnail_image VARCHAR(255) DEFAULT NULL COMMENT '썸네일 이미지 URL',
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  chat_room_id BIGINT UNSIGNED DEFAULT NULL COMMENT '카카오톡 채팅방 아이디',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO members (student_id,name,major,phone,gender,generation,authority)
 VALUES("20192854","이경호","소프트웨어학부","010-6406-1150","남자",3,7);

CREATE TABLE `Users` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `kakao_id` BIGINT UNSIGNED DEFAULT NULL UNIQUE COMMENT '카카오 사용자 고유 ID',
  `name` VARCHAR(50) NOT NULL,
  `profile_image` VARCHAR(255) DEFAULT NULL COMMENT '프로필 이미지 URL',
  `thumbnail_image` VARCHAR(255) DEFAULT NULL COMMENT '썸네일 이미지 URL',
  `chat_room_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '카카오톡 채팅방 아이디',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '레코드 생성 시각',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '레코드 수정 시각'
);

ALTER TABLE `Users`
CHANGE COLUMN `kakao_id` `kakao_id` BIGINT UNSIGNED DEFAULT NULL UNIQUE COMMENT '카카오 사용자 고유 ID';


ALTER TABLE `Users`
CHANGE COLUMN `chat_room_id` `chat_room_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '카카오톡 채팅방 아이디';



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
  author_id INT NOT NULL,
  updater_id INT NOT NULL,
  color CHAR(10) NOT NULL DEFAULT '#43ff7bff',
  ismultiple BOOLEAN NOT NULL,
  authority ENUM('일반','부원','임원진','부회장','회장','admin') NOT NULL DEFAULT '일반',
  isRecruiting BOOLEAN DEFAULT false,
  recruit_start DATETIME,
  recruit_end DATETIME
);

ALTER TABLE events
CHANGE COLUMN authority authority ENUM('미인증','일반','부원','임원진','부회장','회장','admin') NOT NULL DEFAULT '부원';

CREATE TABLE event_participants
(
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_id BIGINT NOT NULL COMMENT 'events.id 참조',
  member_id INT NOT NULL COMMENT 'members.student_id 참조',
  UNIQUE KEY uk_event_member (event_id, member_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(student_id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE formlist
(
  id VARCHAR(255) NOT NULL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  form_type ENUM('신규모집','활동결과','기타') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


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
  response_id VARCHAR(100) NOT NULL,
  student_id VARCHAR(20),
  name VARCHAR(50),
  major VARCHAR(100),
  phone VARCHAR(20),
  gender ENUM('남자', '여자'),
  synced_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  rating ENUM('대기','1차합격','불합격','느별','느괜','느좋','최종합격','1차불합격') NOT NULL DEFAULT '대기',
  FOREIGN KEY (form_id) REFERENCES formlist(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY uk_form_response (form_id, response_id)
);

-- 평가 노트 테이블 (OT 기반 부분 업데이트 지원)
CREATE TABLE IF NOT EXISTS evaluation_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  response_id VARCHAR(255) NOT NULL,
  form_id VARCHAR(255) NOT NULL,
  content TEXT,
  version INT DEFAULT 1,
  last_operation_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_response_form (response_id, form_id)
);

-- 작업 히스토리 테이블 (OT 작업 저장)
CREATE TABLE IF NOT EXISTS evaluation_operations (
  id VARCHAR(255) PRIMARY KEY,
  response_id VARCHAR(255) NOT NULL,
  form_id VARCHAR(255) NOT NULL,
  operation_type ENUM('insert', 'delete', 'retain') NOT NULL,
  position INT NOT NULL,
  text TEXT,
  length INT DEFAULT 0,
  version INT NOT NULL,
  client_id VARCHAR(255),
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_response_form_version (response_id, form_id, version),
  INDEX idx_timestamp (timestamp)
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
  panel_size INT NOT NULL DEFAULT 2 COMMENT '면접 패널 크기',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by INT NOT NULL COMMENT '면접 계획 생성자 (users.id 참조)',
  updated_by INT NOT NULL COMMENT '면접 계획 수정자 (users.id 참조)',
  FOREIGN KEY (form_id) REFERENCES formlist(id) ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE interview_plans
ADD COLUMN panel_size INT NOT NULL DEFAULT 2 COMMENT '면접 패널 크기';

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

--피면접자 시간대 테이블
CREATE TABLE interviewee_time_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plan_id INT NOT NULL COMMENT 'interview_plans.id 참조',
  interviewee_id VARCHAR(20) NOT NULL COMMENT '피면접자 ID (recruiting_members.student_id 참조)',
  interview_date VARCHAR(20) NOT NULL COMMENT '면접 날짜 (MM/DD(요일) 형식)',
  time_slot VARCHAR(20) NOT NULL COMMENT '시간대 (09:00~10:00, 10:00~11:00 등)',
  is_available BOOLEAN NOT NULL DEFAULT true COMMENT '해당 시간대 참여 가능 여부',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES interview_plans(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY uk_plan_interviewee_date_time (plan_id, interviewee_id, interview_date, time_slot)
);

UPDATE form_responses SET answer = REPLACE(answer, '18:00 이후', '18:00~19:00');

--면접 스케쥴 정보 테이블
CREATE TABLE interview_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plan_id INT NOT NULL COMMENT 'interview_plans.id 참조',
  interview_date VARCHAR(20) NOT NULL COMMENT '면접 날짜 (MM/DD(요일) 형식)',
  time_slot VARCHAR(20) NOT NULL COMMENT '시간대 (09:00~10:00, 10:00~11:00 등)',
  interviewer_id VARCHAR(20) NOT NULL COMMENT '면접관 ID (members.student_id 참조)',
  interviewee_id VARCHAR(20) NOT NULL COMMENT '피면접자 ID (recruiting_members.student_id 참조)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES interview_plans(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY uk_plan_interviewer_interviewee_time (plan_id, interviewer_id, interviewee_id, interview_date, time_slot)
);

Insert INTO form_responses 
(response_id, form_id, question_id, answer)
VALUES('ACYDBNhmEwjZqkg3pfCDTI5pQ3gtaw5KHGLOjewlmVBMv0u6SlOmkZt67wu4u214XVukwk0',
 '1tANnEsuWDTNitPR13EkfjYMXIAooueSIwhMNy0eDNRg', '3b71e77b', '가능 시간대 없음');


INSERT INTO interview_schedules
(plan_id, interview_date, time_slot, interviewer_id, interviewee_id)
VALUES(20, '09/02 14:15~14:30', '09/02 14:15~14:30', '20210589', '20233549');

INSERT INTO interview_schedules
(plan_id, interview_date, time_slot, interviewer_id, interviewee_id)
VALUES(20, '09/02 14:15~14:30', '09/02 14:15~14:30', '20251388', '20233549');


INSERT INTO interview_schedules
(plan_id, interview_date, time_slot, interviewer_id, interviewee_id)
VALUES(20, '09/03 17:30~17:45', '09/03 17:30~17:45', '20251258', '20252730');

INSERT INTO interview_schedules
(plan_id, interview_date, time_slot, interviewer_id, interviewee_id)
VALUES(20, '09/03 17:30~17:45', '09/03 17:30~17:45', '20251388', '20252730');


 ALTER TABLE recruiting_members
 CHANGE COLUMN rating rating ENUM('대기','1차합격','불합격','느별','느괜','느좋','최종합격','1차불합격') NOT NULL DEFAULT '대기';


 CREATE TABLE group_chat_rooms (
  id BIGINT UNSIGNED NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL PRIMARY KEY,
  authority ENUM('일반','부원','임원진','부회장','회장','admin') NOT NULL DEFAULT '일반',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
 );

ALTER TABLE group_chat_rooms
ADD COLUMN authority ENUM('일반','부원','임원진','부회장','회장','admin') NOT NULL DEFAULT '일반';


-- 정산 테이블의 collation을 Members 테이블과 동일하게 수정

-- 기존 정산 테이블 삭제
DROP TABLE IF EXISTS SettlementParticipants;
DROP TABLE IF EXISTS Settlements;

-- Members 테이블의 collation 확인
SELECT TABLE_NAME, COLUMN_NAME, COLLATION_NAME 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'UCMS' AND TABLE_NAME = 'Members' AND COLUMN_NAME = 'student_id';

-- 정산 메인 테이블 생성 (Members 테이블과 동일한 collation 사용)
CREATE TABLE Settlements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL COMMENT '정산 이름',
  total_amount INT NOT NULL COMMENT '총 금액',
  deadline DATE NOT NULL COMMENT '마감일자',
  is_dutch_pay BOOLEAN NOT NULL DEFAULT false COMMENT '더치페이 여부',
  status ENUM('active', 'completed', 'cancelled') NOT NULL DEFAULT 'active' COMMENT '정산 상태',
  created_by VARCHAR(20) NOT NULL COMMENT '생성자 (Members.student_id 참조)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 정산 참여자 테이블 생성 (Members 테이블과 동일한 collation 사용)
CREATE TABLE SettlementParticipants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  settlement_id INT NOT NULL COMMENT 'Settlements.id 참조',
  member_id VARCHAR(20) NOT NULL COMMENT 'Members.student_id 참조',
  amount INT NOT NULL COMMENT '참여자별 금액',
  status ENUM('pending', 'paid') NOT NULL DEFAULT 'pending' COMMENT '결제 상태',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_settlement_member (settlement_id, member_id),
  FOREIGN KEY (settlement_id) REFERENCES Settlements(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (member_id) REFERENCES Members(student_id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
