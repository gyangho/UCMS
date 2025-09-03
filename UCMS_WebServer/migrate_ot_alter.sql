-- OT 기반 공유 문서 마이그레이션 스크립트 (ALTER TABLE 방식)
-- 기존 데이터를 보존하면서 테이블 구조만 수정

-- 1. evaluation_notes 테이블에 새로운 컬럼들 추가
ALTER TABLE evaluation_notes 
ADD COLUMN version INT DEFAULT 1 AFTER content,
ADD COLUMN last_operation_id VARCHAR(255) AFTER version;

-- 2. 기존 데이터의 version을 1로 설정
UPDATE evaluation_notes SET version = 1 WHERE version IS NULL;

-- 3. 작업 히스토리 테이블 생성
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

-- 4. 마이그레이션 완료 확인
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

-- 5. 테이블 구조 확인
DESCRIBE evaluation_notes;
DESCRIBE evaluation_operations;
