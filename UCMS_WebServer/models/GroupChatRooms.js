const db = require("./db");

class GroupChatRooms {
  static async findAll() {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM group_chat_rooms"
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async findById(id) {
    try {
      const [rows] = await db.execute(
        "SELECT *, authority+0 AS authority FROM group_chat_rooms WHERE id = ?",
        [id]
      );
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async findByChatRoomName(name) {
    try {
      const [rows] = await db.execute(
        "SELECT id FROM group_chat_rooms WHERE name = ?",
        [name]
      );
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async create(name, chat_room_id, authority) {
    try {
      const [result] = await db.execute(
        `INSERT INTO group_chat_rooms (name, id, authority) VALUES (?, ?, ?) 
        ON DUPLICATE KEY UPDATE name = ?, id = ?, authority = ?`,
        [name, chat_room_id, authority, name, chat_room_id, authority]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  static async delete(id) {
    try {
      await db.execute("DELETE FROM group_chat_rooms WHERE id = ?", [
        id,
      ]);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = GroupChatRooms;
