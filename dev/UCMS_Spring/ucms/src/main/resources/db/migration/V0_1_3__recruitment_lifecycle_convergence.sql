-- 2026-08-23: Bring early dev schemas to the released recruitment lifecycle without changing an applied migration.
ALTER TABLE recruitment_instances
  MODIFY COLUMN status ENUM('draft', 'recruiting', 'planning', 'interview', 'interview_completed', 'closed') NOT NULL DEFAULT 'draft';

SET @members_registered_at_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'recruitment_instances' AND column_name = 'members_registered_at') = 0,
  'ALTER TABLE recruitment_instances ADD COLUMN members_registered_at DATETIME DEFAULT NULL AFTER closed_at',
  'SELECT 1'
);
PREPARE members_registered_at_stmt FROM @members_registered_at_ddl;
EXECUTE members_registered_at_stmt;
DEALLOCATE PREPARE members_registered_at_stmt;
