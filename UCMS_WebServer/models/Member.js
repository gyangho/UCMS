const db = require("./db");

class Member {
  static async findAll(
    page = 1,
    limit = 10,
    search = "",
    searchType = ""
  ) {
    try {
      // 파라미터 유효성 검사 및 정수형 변환
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.max(
        1,
        Math.min(100, parseInt(limit) || 10)
      ); // 최대 100개로 제한
      const offset = (pageNum - 1) * limitNum;

      let query = "SELECT * FROM Members";
      let params = [];

      if (search && searchType) {
        query += ` WHERE ${searchType} LIKE ?`;
        params.push(`%${search}%`);
      }

      query += ` ORDER BY authority DESC LIMIT ${limitNum} OFFSET ${offset}`;

      const [rows] = await db.execute(query, params);
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async count(search = "", searchType = "") {
    try {
      let query = "SELECT COUNT(*) as total FROM Members";
      let params = [];

      if (search && searchType) {
        query += ` WHERE ${searchType} LIKE ?`;
        params.push(`%${search}%`);
      }

      const [rows] = await db.execute(query, params);
      return rows[0].total;
    } catch (error) {
      throw error;
    }
  }

  static async findById(id) {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM Members WHERE id = ?",
        [id]
      );
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async update(id, memberData) {
    try {
      await db.execute(
        "UPDATE Members SET  name = ?, major = ?, phone = ?, gender = ?, generation = ?, authority = ? WHERE student_id = ?",
        [
          memberData.name,
          memberData.major,
          memberData.phone,
          memberData.gender,
          memberData.generation,
          memberData.authority,
          id,
        ]
      );
    } catch (error) {
      throw error;
    }
  }

  static async delete(id) {
    try {
      await db.execute("DELETE FROM Members WHERE student_id = ?", [
        id,
      ]);
    } catch (error) {
      throw error;
    }
  }

  static async create(members) {
    console.log(members);
    try {
      const [result] = await db.execute(
        `INSERT INTO Members 
        (name, student_id, major, phone, gender, generation) 
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          members.name,
          members.student_id,
          members.major,
          members.phone,
          members.gender,
          members.generation,
        ]
      );
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async getAuthorityByUserId(userId) {
    try {
      const [rows] = await db.execute(
        "SELECT authority+0 AS authority FROM Members WHERE user_id = ?",
        [userId]
      );
      return rows[0] ? rows[0].authority : null;
    } catch (error) {
      throw error;
    }
  }

  static async findByName(name) {
    try {
      const [rows] = await db.execute(
        "SELECT * , authority + 0 as authority_num FROM Members WHERE name = ?",
        [name]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async updateUserId(userId, student_id) {
    try {
      await db.execute(
        "UPDATE Members SET user_id = ? WHERE student_id = ?",
        [userId, student_id]
      );
    } catch (error) {
      throw error;
    }
  }

  static async findByUserId(userId) {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM Members WHERE user_id = ?",
        [userId]
      );
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async getMembersByAuthority(authority) {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM Members WHERE authority >= ?",
        [authority]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Member;
