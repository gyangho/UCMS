const db = require("./db");

class Settlement {
  static async findAll() {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM Settlements ORDER BY created_at DESC"
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async findById(id) {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM Settlements WHERE id = ?",
        [id]
      );
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async findActive() {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM Settlements WHERE status = 'active' ORDER BY deadline ASC"
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async findCompleted() {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM Settlements WHERE status = 'completed' ORDER BY deadline DESC"
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async findByMemberId(memberId) {
    try {
      const [rows] = await db.execute(
        `SELECT s.*, sp.amount, sp.status as payment_status
         FROM Settlements s
         JOIN SettlementParticipants sp ON s.id = sp.settlement_id
         WHERE sp.member_id = ? AND s.status = 'active'
         ORDER BY s.deadline ASC`,
        [memberId]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async create(settlementData) {
    try {
      const [result] = await db.execute(
        `INSERT INTO Settlements 
        (name, total_amount, deadline, is_dutch_pay, created_by)
        VALUES (?, ?, ?, ?, ?)`,
        [
          settlementData.name,
          settlementData.total_amount,
          settlementData.deadline,
          settlementData.is_dutch_pay,
          settlementData.created_by,
        ]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  static async update(id, settlementData) {
    try {
      const query = `UPDATE Settlements SET ${Object.keys(
        settlementData
      )
        .map((key) => `${key} = ?`)
        .join(", ")} WHERE id = ?`;
      const values = Object.values(settlementData);
      values.push(id);

      await db.execute(query, values);
    } catch (error) {
      throw error;
    }
  }

  static async delete(id) {
    try {
      await db.execute("DELETE FROM Settlements WHERE id = ?", [id]);
    } catch (error) {
      throw error;
    }
  }

  static async getParticipants(settlementId) {
    try {
      const [rows] = await db.execute(
        `SELECT sp.*, m.name, m.student_id 
         FROM SettlementParticipants sp 
         JOIN Members m ON sp.member_id = m.student_id 
         WHERE sp.settlement_id = ?`,
        [settlementId]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async addParticipant(settlementId, memberId, amount) {
    try {
      await db.execute(
        "INSERT INTO SettlementParticipants (settlement_id, member_id, amount) VALUES (?, ?, ?)",
        [settlementId, memberId, amount]
      );
    } catch (error) {
      throw error;
    }
  }

  static async removeParticipant(settlementId, memberId) {
    try {
      await db.execute(
        "DELETE FROM SettlementParticipants WHERE settlement_id = ? AND member_id = ?",
        [settlementId, memberId]
      );
    } catch (error) {
      throw error;
    }
  }

  static async updateParticipantAmount(
    settlementId,
    memberId,
    amount
  ) {
    try {
      await db.execute(
        "UPDATE SettlementParticipants SET amount = ? WHERE settlement_id = ? AND member_id = ?",
        [amount, settlementId, memberId]
      );
    } catch (error) {
      throw error;
    }
  }

  static async updateParticipantStatus(
    settlementId,
    memberId,
    status
  ) {
    try {
      await db.execute(
        "UPDATE SettlementParticipants SET status = ? WHERE settlement_id = ? AND member_id = ?",
        [status, settlementId, memberId]
      );
    } catch (error) {
      throw error;
    }
  }

  static async getEventParticipants(eventId) {
    try {
      const [rows] = await db.execute(
        `SELECT DISTINCT m.student_id, m.name 
         FROM event_participants ep 
         JOIN Members m ON ep.user_id = m.user_id 
         WHERE ep.event_id = ?`,
        [eventId]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Settlement;
