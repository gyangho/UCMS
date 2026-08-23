-- UCMS 0.0.1 schema-only baseline.
-- 2026-08-20: Reconstruct the deployed schema without application data or AUTO_INCREMENT counters.
-- This migration is immutable after the 0.1.1 release is deployed.

SET @UCMS_OLD_FOREIGN_KEY_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;
CREATE TABLE `evaluation_notes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `response_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `form_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `version` int DEFAULT '1',
  `last_operation_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `response_id` (`response_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `evaluation_operations` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `response_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `form_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `operation_type` enum('insert','delete','retain') COLLATE utf8mb4_unicode_ci NOT NULL,
  `position` int NOT NULL,
  `text` text COLLATE utf8mb4_unicode_ci,
  `length` int DEFAULT '0',
  `version` int NOT NULL,
  `client_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timestamp` bigint NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_response_form_version` (`response_id`,`form_id`,`version`),
  KEY `idx_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `event_participants` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `event_id` bigint NOT NULL COMMENT 'events.id 참조',
  `user_id` int NOT NULL COMMENT 'users.id 참조',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_event_user` (`event_id`,`user_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `event_participants_ibfk_1` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `event_participants_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL COMMENT '일정 제목',
  `description` text COMMENT '세부 설명',
  `start` datetime NOT NULL COMMENT '시작 시각',
  `end` datetime NOT NULL COMMENT '종료 시각',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `author_id` int NOT NULL,
  `updater_id` int NOT NULL,
  `color` char(10) NOT NULL DEFAULT '#43ff7bff',
  `ismultiple` tinyint(1) NOT NULL,
  `authority` enum('미인증','일반','부원','임원진','부회장','회장','admin') NOT NULL DEFAULT '일반',
  `isRecruiting` tinyint(1) DEFAULT '0',
  `recruit_start` datetime DEFAULT NULL,
  `recruit_end` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `form_questions` (
  `idx` int NOT NULL AUTO_INCREMENT,
  `form_id` varchar(100) NOT NULL,
  `question_id` varchar(100) NOT NULL,
  `question` varchar(255) NOT NULL,
  `synced_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`form_id`,`question_id`),
  UNIQUE KEY `idx` (`idx`),
  CONSTRAINT `form_questions_ibfk_1` FOREIGN KEY (`form_id`) REFERENCES `formlist` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `form_responses` (
  `response_id` varchar(100) NOT NULL,
  `form_id` varchar(100) NOT NULL,
  `question_id` varchar(100) NOT NULL,
  `answer` text,
  `synced_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`response_id`,`form_id`,`question_id`),
  KEY `form_id` (`form_id`),
  CONSTRAINT `form_responses_ibfk_1` FOREIGN KEY (`form_id`) REFERENCES `formlist` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `form_templates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `form_url` varchar(500) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`form_url`),
  UNIQUE KEY `id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `formlist` (
  `id` varchar(255) NOT NULL,
  `title` varchar(255) NOT NULL,
  `form_type` enum('신규모집','활동결과','기타') NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `group_chat_rooms` (
  `id` bigint unsigned NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `authority` enum('미인증','일반','부원','임원진','부회장','회장','admin') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '미인증',
  PRIMARY KEY (`name`),
  UNIQUE KEY `id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `interview_dates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `plan_id` int NOT NULL COMMENT 'interview_plans.id 참조',
  `interview_date` varchar(20) NOT NULL COMMENT '면접 날짜 (MM/DD(요일) 형식)',
  `question_id` varchar(100) NOT NULL COMMENT '해당 날짜의 질문 ID',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_plan_date` (`plan_id`,`interview_date`),
  CONSTRAINT `interview_dates_ibfk_1` FOREIGN KEY (`plan_id`) REFERENCES `interview_plans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `interview_interviewers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `plan_id` int NOT NULL COMMENT 'interview_plans.id 참조',
  `interviewer_id` varchar(20) NOT NULL COMMENT '면접관 ID (members.student_id 참조)',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_plan_interviewer` (`plan_id`,`interviewer_id`),
  KEY `interviewer_id` (`interviewer_id`),
  CONSTRAINT `interview_interviewers_ibfk_1` FOREIGN KEY (`plan_id`) REFERENCES `interview_plans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `interview_interviewers_ibfk_2` FOREIGN KEY (`interviewer_id`) REFERENCES `members` (`student_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `interview_plans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `form_id` varchar(100) NOT NULL,
  `title` varchar(255) NOT NULL COMMENT '면접 계획 제목',
  `status` enum('draft','active','completed','cancelled') NOT NULL DEFAULT 'draft' COMMENT '면접 계획 상태',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by` int NOT NULL COMMENT '면접 계획 생성자 (users.id 참조)',
  `updated_by` int NOT NULL COMMENT '면접 계획 수정자 (users.id 참조)',
  `panel_size` int NOT NULL DEFAULT '2' COMMENT '면접 패널 크기',
  PRIMARY KEY (`id`),
  KEY `form_id` (`form_id`),
  CONSTRAINT `interview_plans_ibfk_1` FOREIGN KEY (`form_id`) REFERENCES `formlist` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `interview_schedules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `plan_id` int NOT NULL COMMENT 'interview_plans.id 참조',
  `interview_date` varchar(20) NOT NULL COMMENT '면접 날짜 (MM/DD(요일) 형식)',
  `time_slot` varchar(20) NOT NULL COMMENT '시간대 (09:00~10:00, 10:00~11:00 등)',
  `interviewer_id` varchar(20) NOT NULL COMMENT '면접관 ID (members.student_id 참조)',
  `interviewee_id` varchar(20) NOT NULL COMMENT '피면접자 ID (recruiting_members.student_id 참조)',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_plan_interviewer_interviewee_time` (`plan_id`,`interviewer_id`,`interviewee_id`,`interview_date`,`time_slot`),
  CONSTRAINT `interview_schedules_ibfk_1` FOREIGN KEY (`plan_id`) REFERENCES `interview_plans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `interviewee_time_slots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `plan_id` int NOT NULL COMMENT 'interview_plans.id 참조',
  `interviewee_id` varchar(20) NOT NULL COMMENT '피면접자 ID (recruiting_members.student_id 참조)',
  `interview_date` varchar(20) NOT NULL COMMENT '면접 날짜 (MM/DD(요일) 형식)',
  `time_slot` varchar(20) NOT NULL COMMENT '시간대 (09:00~10:00, 10:00~11:00 등)',
  `is_available` tinyint(1) NOT NULL DEFAULT '1' COMMENT '해당 시간대 참여 가능 여부',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_plan_interviewee_date_time` (`plan_id`,`interviewee_id`,`interview_date`,`time_slot`),
  CONSTRAINT `interviewee_time_slots_ibfk_1` FOREIGN KEY (`plan_id`) REFERENCES `interview_plans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `interviewer_time_slots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `plan_id` int NOT NULL COMMENT 'interview_plans.id 참조',
  `interviewer_id` varchar(20) NOT NULL COMMENT '면접관 ID (members.student_id 참조)',
  `interview_date` varchar(20) NOT NULL COMMENT '면접 날짜 (MM/DD(요일) 형식)',
  `time_slot` varchar(20) NOT NULL COMMENT '시간대 (09:00~10:00, 10:00~11:00 등)',
  `is_available` tinyint(1) NOT NULL DEFAULT '1' COMMENT '해당 시간대 참여 가능 여부',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_interviewer_date_time` (`plan_id`,`interviewer_id`,`interview_date`,`time_slot`),
  KEY `interviewer_id` (`interviewer_id`),
  CONSTRAINT `interviewer_time_slots_ibfk_1` FOREIGN KEY (`plan_id`) REFERENCES `interview_plans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `interviewer_time_slots_ibfk_2` FOREIGN KEY (`interviewer_id`) REFERENCES `members` (`student_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `members` (
  `student_id` varchar(20) NOT NULL,
  `name` varchar(50) NOT NULL,
  `major` varchar(20) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `gender` enum('남자','여자') NOT NULL,
  `generation` int NOT NULL,
  `authority` enum('미인증','일반','부원','임원진','부회장','회장','admin') NOT NULL DEFAULT '부원',
  `user_id` int DEFAULT NULL COMMENT 'Users.id 참조',
  PRIMARY KEY (`student_id`),
  UNIQUE KEY `phone` (`phone`),
  UNIQUE KEY `user_id` (`user_id`),
  UNIQUE KEY `user_id_2` (`user_id`),
  CONSTRAINT `members_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `pending_auth` (
  `auth_code` varchar(10) NOT NULL,
  `kakao_id` bigint unsigned NOT NULL COMMENT '카카오 사용자 고유 ID',
  `name` varchar(50) NOT NULL,
  `profile_image` varchar(255) DEFAULT NULL COMMENT '프로필 이미지 URL',
  `thumbnail_image` varchar(255) DEFAULT NULL COMMENT '썸네일 이미지 URL',
  `is_completed` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `chat_room_id` bigint unsigned DEFAULT NULL COMMENT '카카오톡 채팅방 아이디',
  PRIMARY KEY (`auth_code`),
  UNIQUE KEY `kakao_id` (`kakao_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `pos_instances` (
  `id` int NOT NULL AUTO_INCREMENT,
  `instance_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inactive',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pos_products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `instance_id` int NOT NULL,
  `product_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_price` int NOT NULL,
  `stock` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `instance_id` (`instance_id`),
  CONSTRAINT `pos_products_ibfk_1` FOREIGN KEY (`instance_id`) REFERENCES `pos_instances` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pos_receipts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `instance_id` int NOT NULL,
  `total_price` int NOT NULL,
  `salesman_id` int NOT NULL,
  `purchase_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `instance_id` (`instance_id`),
  KEY `salesman_id` (`salesman_id`),
  CONSTRAINT `pos_receipts_ibfk_1` FOREIGN KEY (`instance_id`) REFERENCES `pos_instances` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pos_receipts_ibfk_2` FOREIGN KEY (`salesman_id`) REFERENCES `pos_salesmans` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pos_sales_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `receipt_id` int NOT NULL,
  `instance_id` int NOT NULL,
  `product_id` int NOT NULL,
  `product_quantity` int NOT NULL,
  `is_service` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `receipt_id` (`receipt_id`),
  KEY `instance_id` (`instance_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `pos_sales_history_ibfk_1` FOREIGN KEY (`receipt_id`) REFERENCES `pos_receipts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pos_sales_history_ibfk_2` FOREIGN KEY (`instance_id`) REFERENCES `pos_instances` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pos_sales_history_ibfk_3` FOREIGN KEY (`product_id`) REFERENCES `pos_products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pos_salesmans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `member_id` varchar(20) NOT NULL,
  `instance_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `member_id` (`member_id`),
  KEY `instance_id` (`instance_id`),
  CONSTRAINT `pos_salesmans_ibfk_1` FOREIGN KEY (`member_id`) REFERENCES `members` (`student_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pos_salesmans_ibfk_2` FOREIGN KEY (`instance_id`) REFERENCES `pos_instances` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `purchases` (
  `id` int NOT NULL AUTO_INCREMENT,
  `purchase_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `버터쿠키` int DEFAULT '0',
  `플레인휘낭시에` int DEFAULT '0',
  `고구마식빵휘낭` int DEFAULT '0',
  `고구마휘낭시에` int DEFAULT '0',
  `흑임자휘낭시에` int DEFAULT '0',
  `행운과자` int DEFAULT '0',
  `행운과자증정` int DEFAULT '0',
  `total_price` int DEFAULT '0',
  `paid` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `recruiting_members` (
  `id` int NOT NULL AUTO_INCREMENT,
  `form_id` varchar(100) NOT NULL,
  `response_id` varchar(100) NOT NULL,
  `student_id` varchar(20) DEFAULT NULL,
  `name` varchar(50) DEFAULT NULL,
  `major` varchar(100) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `gender` enum('남자','여자') DEFAULT NULL,
  `synced_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `rating` enum('대기','1차합격','불합격','느별','느괜','느좋','최종합격','1차불합격') NOT NULL DEFAULT '대기',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_form_response` (`form_id`,`response_id`),
  CONSTRAINT `recruiting_members_ibfk_1` FOREIGN KEY (`form_id`) REFERENCES `formlist` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `sessions` (
  `session_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `expires` int unsigned NOT NULL,
  `data` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `settlementparticipants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `settlement_id` int NOT NULL COMMENT 'Settlements.id 참조',
  `member_id` varchar(20) NOT NULL COMMENT 'Members.student_id 참조',
  `amount` int NOT NULL COMMENT '참여자별 금액',
  `status` enum('pending','paid') NOT NULL DEFAULT 'pending' COMMENT '결제 상태',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_settlement_member` (`settlement_id`,`member_id`),
  KEY `member_id` (`member_id`),
  CONSTRAINT `settlementparticipants_ibfk_1` FOREIGN KEY (`settlement_id`) REFERENCES `settlements` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `settlementparticipants_ibfk_2` FOREIGN KEY (`member_id`) REFERENCES `members` (`student_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `settlements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL COMMENT '정산 이름',
  `total_amount` int NOT NULL COMMENT '총 금액',
  `deadline` date NOT NULL COMMENT '마감일자',
  `is_dutch_pay` tinyint(1) NOT NULL DEFAULT '0' COMMENT '더치페이 여부',
  `status` enum('active','completed','cancelled') NOT NULL DEFAULT 'active' COMMENT '정산 상태',
  `created_by` varchar(20) NOT NULL COMMENT '생성자 (Members.student_id 참조)',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `kakao_id` bigint unsigned DEFAULT NULL COMMENT '카카오 사용자 고유 ID',
  `name` varchar(50) NOT NULL,
  `profile_image` varchar(255) DEFAULT NULL COMMENT '프로필 이미지 URL',
  `thumbnail_image` varchar(255) DEFAULT NULL COMMENT '썸네일 이미지 URL',
  `chat_room_id` bigint unsigned DEFAULT NULL COMMENT '카카오톡 채팅방 아이디',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '레코드 생성 시각',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '레코드 수정 시각',
  PRIMARY KEY (`id`),
  UNIQUE KEY `kakao_id` (`kakao_id`),
  UNIQUE KEY `kakao_id_2` (`kakao_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
SET FOREIGN_KEY_CHECKS = @UCMS_OLD_FOREIGN_KEY_CHECKS;
