const db = require("./index");

class Member {
  static async findAll(page = 1, limit = 10, search = "", searchType = "") {
    try {
      let query = "SELECT * FROM Members";
      let params = [];

      if (search && searchType) {
        query += ` WHERE ${searchType} LIKE ?`;
        params.push(`%${search}%`);
      }

      query += " ORDER BY id DESC LIMIT ? OFFSET ?";
      params.push(limit, (page - 1) * limit);

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
      const [rows] = await db.execute("SELECT * FROM Members WHERE id = ?", [
        id,
      ]);
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async create(memberData) {
    try {
      const [result] = await db.execute(
        "INSERT INTO Members (name, student_id, major, grade, phone, email) VALUES (?, ?, ?, ?, ?, ?)",
        [
          memberData.name,
          memberData.student_id,
          memberData.major,
          memberData.grade,
          memberData.phone,
          memberData.email,
        ]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  static async update(id, memberData) {
    try {
      await db.execute(
        "UPDATE Members SET name = ?, student_id = ?, major = ?, grade = ?, phone = ?, email = ? WHERE id = ?",
        [
          memberData.name,
          memberData.student_id,
          memberData.major,
          memberData.grade,
          memberData.phone,
          memberData.email,
          id,
        ]
      );
    } catch (error) {
      throw error;
    }
  }

  static async delete(id) {
    try {
      await db.execute("DELETE FROM Members WHERE id = ?", [id]);
    } catch (error) {
      throw error;
    }
  }

  static async bulkCreate(members) {
    try {
      const values = members.map((member) => [
        member.name,
        member.student_id,
        member.major,
        member.grade,
        member.phone,
        member.email,
      ]);

      const [result] = await db.execute(
        "INSERT INTO Members (name, student_id, major, grade, phone, email) VALUES ?",
        [values]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Member;
