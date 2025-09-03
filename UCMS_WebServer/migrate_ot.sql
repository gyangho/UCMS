-- OT 기반 공유 문서 마이그레이션 스크립트

-- 1. 기존 테이블 백업
CREATE TABLE evaluation_notes_backup AS SELECT * FROM evaluation_notes;

-- 2. 기존 테이블 삭제
DROP TABLE IF EXISTS evaluation_notes;

-- 3. 새로운 스키마로 테이블 생성
CREATE TABLE evaluation_notes (
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

-- 4. 작업 히스토리 테이블 생성
CREATE TABLE evaluation_operations (
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

-- 5. 백업 데이터 복원 (새로운 스키마에 맞게)
INSERT INTO evaluation_notes (response_id, form_id, content, version, created_at, updated_at)
SELECT 
  response_id, 
  form_id, 
  content, 
  1 as version,  -- 모든 기존 문서는 버전 1으로 시작
  created_at, 
  updated_at
FROM evaluation_notes_backup;

-- 6. 마이그레이션 완료 확인
SELECT 
  'Migration completed' as status,
  COUNT(*) as total_documents,
  'evaluation_notes' as table_name
FROM evaluation_notes
UNION ALL
SELECT 
  'Operations table ready' as status,
  0 as total_documents,
  'evaluation_operations' as table_name
FROM evaluation_operations
WHERE 1=0;

-- 7. 백업 테이블 삭제 (선택사항 - 마이그레이션 확인 후 실행)
-- DROP TABLE evaluation_notes_backup;
