const db = require("./db");

class FormResponse {
  //응답 조회
  static async getResponses(page, limit, search, column, formId) {
    try {
      // 파라미터 유효성 검사 및 정수형 변환
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.max(
        1,
        Math.min(100, parseInt(limit) || 10)
      );
      const offset = (pageNum - 1) * limitNum;

      const [rows] = await db.execute(
        `SELECT * FROM form_responses WHERE form_id = ? 
        ORDER BY created_at DESC LIMIT ${limitNum} OFFSET ${offset}`,
        [formId]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  //응답 조회 id로
  static async getResponseById(id) {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM form_responses WHERE id = ?",
        [id]
      );
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  //응답 조회 id로
  static async getResponsesByResponseId(responseId, formId) {
    try {
      const [rows] = await db.execute(
        `SELECT * FROM form_responses 
        WHERE response_id = ? AND form_id = ?`,
        [responseId, formId]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = FormResponse;
