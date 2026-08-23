-- 2026-08-23: Record the authoritative Spring Google Forms synchronization state per recruitment.
ALTER TABLE recruitment_instances
  ADD COLUMN last_response_sync_at DATETIME DEFAULT NULL AFTER snapshot_final_pass_count,
  ADD COLUMN last_response_sync_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER last_response_sync_at,
  ADD COLUMN response_sync_error VARCHAR(500) DEFAULT NULL AFTER last_response_sync_count,
  ADD INDEX idx_recruitment_response_sync (status, last_response_sync_at);

-- Persist the controlled identity mapping so later response syncs never infer values from arbitrary answer order.
ALTER TABLE form_questions
  ADD COLUMN semantic_key VARCHAR(32) DEFAULT NULL AFTER question,
  ADD INDEX idx_form_questions_semantic (form_id, semantic_key);
