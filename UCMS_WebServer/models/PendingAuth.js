const db = require("./db");

class PendingAuth {
  static async create(pendingAuthData) {
    try {
      const [result] = await db.execute(
        `INSERT INTO pending_auth 
        (kakao_id, name, profile_image, thumbnail_image, auth_code) 
        VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE auth_code = ?`,
        [
          pendingAuthData.kakao_id,
          pendingAuthData.name,
          pendingAuthData.profile_image,
          pendingAuthData.thumbnail_image,
          pendingAuthData.auth_code,
          pendingAuthData.auth_code,
        ]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }
}

PendingAuth.findByAuthCode = async (authCode) => {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM pending_auth WHERE auth_code = ?",
      [authCode]
    );
    return rows[0];
  } catch (error) {
    throw error;
  }
};

PendingAuth.deleteByAuthCode = async (authCode) => {
  try {
    await db.execute("DELETE FROM pending_auth WHERE auth_code = ?", [
      authCode,
    ]);
  } catch (error) {
    throw error;
  }
};

PendingAuth.updateAuthCode = async (authCode, newAuthCode) => {
  try {
    await db.execute(
      "UPDATE pending_auth SET auth_code = ? WHERE auth_code = ?",
      [newAuthCode, authCode]
    );
  } catch (error) {
    throw error;
  }
};

PendingAuth.updateIsCompleted = async (chatRoomId, authCode, isCompleted) => {
  try {
    await db.execute(
      "UPDATE pending_auth SET is_completed = ? WHERE auth_code = ?",
      [isCompleted, authCode]
    );
    await db.execute(
      "UPDATE pending_auth SET chat_room_id = ? WHERE auth_code = ?",
      [chatRoomId, authCode]
    );
    return true;
  } catch (error) {
    throw error;
  }
};

module.exports = PendingAuth;
