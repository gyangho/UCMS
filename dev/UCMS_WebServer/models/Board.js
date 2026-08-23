const db = require("./db");

// 2026-07-23: Keep notice, inquiry, and answer persistence in one board model.
async function query(sql, params = []) {
  const [rows] = await db.execute(sql, params);
  return rows;
}

async function getAuthorIdentity(userId) {
  const rows = await query(
    `SELECT u.id,
            COALESCE(m.name, u.name) AS name
       FROM users u
       LEFT JOIN members m ON m.user_id = u.id
      WHERE u.id = ?`,
    [userId],
  );
  return rows[0] || null;
}

async function listNotices(maxAuthorityRank, limit = null) {
  const parsedLimit = Number(limit);
  const limitClause =
    Number.isInteger(parsedLimit) && parsedLimit > 0
      ? ` LIMIT ${Math.min(parsedLimit, 100)}`
      : "";
  return query(
    `SELECT np.*
       FROM notice_posts np
      WHERE (np.minimum_authority + 0) <= ?
      ORDER BY np.is_pinned DESC, np.updated_at DESC${limitClause}`,
    [Number(maxAuthorityRank) + 1],
  );
}

async function getNoticeById(id) {
  const rows = await query("SELECT * FROM notice_posts WHERE id = ?", [id]);
  return rows[0] || null;
}

async function createNotice({
  title,
  content,
  authorId,
  authorName,
  minimumAuthority,
  isPinned,
}) {
  const result = await db.execute(
    `INSERT INTO notice_posts
       (title, content, author_id, author_name, minimum_authority, is_pinned)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [title, content, authorId, authorName, minimumAuthority, isPinned],
  );
  return result[0].insertId;
}

async function updateNotice(
  id,
  { title, content, minimumAuthority, isPinned },
) {
  const result = await db.execute(
    `UPDATE notice_posts
        SET title = ?,
            content = ?,
            minimum_authority = ?,
            is_pinned = ?
      WHERE id = ?`,
    [title, content, minimumAuthority, isPinned, id],
  );
  return result[0].affectedRows;
}

async function deleteNotice(id) {
  const result = await db.execute("DELETE FROM notice_posts WHERE id = ?", [id]);
  return result[0].affectedRows;
}

// 2026-08-24: Persist FAQ entries separately so only executives can curate public answers.
async function listFaqs() {
  return query("SELECT * FROM faq_posts ORDER BY updated_at DESC, id DESC");
}

async function getFaqById(id) {
  const rows = await query("SELECT * FROM faq_posts WHERE id = ?", [id]);
  return rows[0] || null;
}

async function createFaq({ title, content, authorId, authorName }) {
  const result = await db.execute(
    `INSERT INTO faq_posts (title, content, author_id, author_name)
     VALUES (?, ?, ?, ?)`,
    [title, content, authorId, authorName],
  );
  return result[0].insertId;
}

async function updateFaq(id, { title, content }) {
  const result = await db.execute(
    "UPDATE faq_posts SET title = ?, content = ? WHERE id = ?",
    [title, content, id],
  );
  return result[0].affectedRows;
}

async function deleteFaq(id) {
  const result = await db.execute("DELETE FROM faq_posts WHERE id = ?", [id]);
  return result[0].affectedRows;
}

async function listInquiries() {
  return query(
    `SELECT ip.*,
            COUNT(ic.id) AS comment_count
       FROM inquiry_posts ip
       LEFT JOIN inquiry_comments ic ON ic.inquiry_id = ip.id
      GROUP BY ip.id
      ORDER BY ip.updated_at DESC`,
  );
}

async function getInquiryById(id) {
  const rows = await query(
    `SELECT ip.*,
            COUNT(ic.id) AS comment_count
       FROM inquiry_posts ip
       LEFT JOIN inquiry_comments ic ON ic.inquiry_id = ip.id
      WHERE ip.id = ?
      GROUP BY ip.id`,
    [id],
  );
  return rows[0] || null;
}

async function createInquiry({ title, content, authorId, authorName }) {
  const result = await db.execute(
    `INSERT INTO inquiry_posts (title, content, author_id, author_name)
     VALUES (?, ?, ?, ?)`,
    [title, content, authorId, authorName],
  );
  return result[0].insertId;
}

async function updateInquiry(id, { title, content }) {
  const result = await db.execute(
    "UPDATE inquiry_posts SET title = ?, content = ? WHERE id = ?",
    [title, content, id],
  );
  return result[0].affectedRows;
}

async function deleteInquiry(id) {
  const result = await db.execute("DELETE FROM inquiry_posts WHERE id = ?", [
    id,
  ]);
  return result[0].affectedRows;
}

async function listInquiryComments(inquiryId) {
  return query(
    `SELECT *
       FROM inquiry_comments
      WHERE inquiry_id = ?
      ORDER BY created_at ASC, id ASC`,
    [inquiryId],
  );
}

async function getInquiryCommentById(id) {
  const rows = await query("SELECT * FROM inquiry_comments WHERE id = ?", [id]);
  return rows[0] || null;
}

async function createInquiryComment({
  inquiryId,
  authorId,
  authorName,
  content,
}) {
  const result = await db.execute(
    `INSERT INTO inquiry_comments
       (inquiry_id, author_id, author_name, content)
     VALUES (?, ?, ?, ?)`,
    [inquiryId, authorId, authorName, content],
  );
  return result[0].insertId;
}

async function updateInquiryComment(id, content) {
  const result = await db.execute(
    "UPDATE inquiry_comments SET content = ? WHERE id = ?",
    [content, id],
  );
  return result[0].affectedRows;
}

async function deleteInquiryComment(id) {
  const result = await db.execute("DELETE FROM inquiry_comments WHERE id = ?", [
    id,
  ]);
  return result[0].affectedRows;
}

module.exports = {
  createInquiry,
  createInquiryComment,
  createFaq,
  createNotice,
  deleteFaq,
  deleteInquiry,
  deleteInquiryComment,
  deleteNotice,
  getAuthorIdentity,
  getFaqById,
  getInquiryById,
  getInquiryCommentById,
  getNoticeById,
  listInquiries,
  listInquiryComments,
  listFaqs,
  listNotices,
  updateFaq,
  updateInquiry,
  updateInquiryComment,
  updateNotice,
};
