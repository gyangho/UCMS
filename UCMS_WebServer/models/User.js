const db = require("./index");

class User {
  static async findBySessionId(sessionId) {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM Users WHERE session_id = ?",
        [sessionId]
      );
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async findById(id) {
    try {
      const [rows] = await db.execute("SELECT * FROM Users WHERE id = ?", [id]);
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async create(userData) {
    try {
      const [result] = await db.execute(
        "INSERT INTO Users (name, email, authority, session_id) VALUES (?, ?, ?, ?)",
        [userData.name, userData.email, userData.authority, userData.session_id]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  static async updateSessionId(userId, sessionId) {
    try {
      await db.execute("UPDATE Users SET session_id = ? WHERE id = ?", [
        sessionId,
        userId,
      ]);
    } catch (error) {
      throw error;
    }
  }

  static async deleteSessionId(sessionId) {
    try {
      await db.execute(
        "UPDATE Users SET session_id = NULL WHERE session_id = ?",
        [sessionId]
      );
    } catch (error) {
      throw error;
    }
  }
}

module.exports = User;
