const db = require("./db");

class User {
  static async findById(id) {
    try {
      const [rows] = await db.execute("SELECT * FROM Users WHERE id = ?", [id]);
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

  static async findByKakaoId(kakaoId) {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM Users WHERE kakao_id = ?",
        [kakaoId]
      );
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async create(userData) {
    try {
      const [result] = await db.execute(
        "INSERT INTO Users (kakao_id, name, profile_image, thumbnail_image, chat_room_id) VALUES (?, ?, ?, ?, ?)",
        [
          userData.kakao_id,
          userData.name,
          userData.profile_image,
          userData.thumbnail_image,
          userData.chat_room_id,
        ]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  static async update(userId, name, profile_image, thumbnail_image) {
    try {
      await db.execute(
        "UPDATE Users SET name = ?, profile_image = ?, thumbnail_image = ? WHERE id = ?",
        [name, profile_image, thumbnail_image, userId]
      );
    } catch (error) {
      throw error;
    }
  }

  static async delete(userId) {
    try {
      await db.execute("DELETE FROM Users WHERE id = ?", [userId]);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = User;
