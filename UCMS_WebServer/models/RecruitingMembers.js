const db = require("./db");

class RecruitingMembers {
  static async getRecruitingMembers(
    page = 1,
    limit = 10,
    search = "",
    column = "",
    formId
  ) {
    const offset = (page - 1) * limit;
    let query = `
      SELECT * FROM recruiting_members
      WHERE form_id = ?
    `;
    const params = [formId];

    if (search && column) {
      if (column === "rating") {
        query += ` AND rating = ?`;
        params.push(search);
      } else {
        query += ` AND ${column} LIKE ?`;
        params.push(`%${search}%`);
      }
    }

    query += `
      ORDER BY name ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [rows] = await db.execute(query, params);
    return rows;
  }

  static async countRecruitingMembers(
    search = "",
    column = "",
    formId
  ) {
    let query = `
      SELECT COUNT(*) FROM recruiting_members
      WHERE form_id = ?
    `;
    const params = [formId];

    if (search && column) {
      if (column === "rating") {
        query += ` AND rating = ?`;
        params.push(search);
      } else {
        query += ` AND ${column} LIKE ?`;
        params.push(`%${search}%`);
      }
    }

    const [rows] = await db.execute(query, params);
    return rows[0]["COUNT(*)"];
  }

  static async getMemberInfo(responseId) {
    const query = `
      SELECT * FROM recruiting_members
      WHERE response_id = ?
    `;
    const [rows] = await db.execute(query, [responseId]);
    return rows[0];
  }

  static async updateRecruitRating(responseId, rating, formId) {
    const query = `
      UPDATE recruiting_members SET rating = ? WHERE response_id = ? AND form_id = ?
    `;
    const [rows] = await db.execute(query, [
      rating,
      responseId,
      formId,
    ]);
    return rows[0];
  }
}

module.exports = RecruitingMembers;
