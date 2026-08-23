const db = require("./db");

class User {
  static async findById(id) {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM Users WHERE id = ?",
        [id]
      );
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  // 2026-08-22: Login account creation and credential updates live in EmailAuthenticationService transactions.
  static async delete(userId) {
    try {
      await db.execute("DELETE FROM Users WHERE id = ?", [userId]);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = User;
