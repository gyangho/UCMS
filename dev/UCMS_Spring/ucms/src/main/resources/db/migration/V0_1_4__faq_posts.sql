-- 2026-08-24: Store public FAQ content independently from notices and member inquiries.
CREATE TABLE IF NOT EXISTS faq_posts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  author_id INT DEFAULT NULL COMMENT 'users.id reference',
  author_name VARCHAR(50) NOT NULL COMMENT 'author name at creation time',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_faq_updated (updated_at),
  INDEX idx_faq_author (author_id),
  CONSTRAINT fk_faq_posts_author
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
