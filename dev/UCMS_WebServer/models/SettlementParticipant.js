const db = require("./db");

class SettlementParticipant {
  static async findBySettlementId(settlementId) {
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

  static async findByMemberId(memberId) {
    try {
      const [rows] = await db.execute(
        `SELECT sp.*, s.name as settlement_name, s.deadline, s.total_amount
         FROM SettlementParticipants sp 
         JOIN Settlements s ON sp.settlement_id = s.id 
         WHERE sp.member_id = ? AND s.status = 'active'`,
        [memberId]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async create(participantData) {
    try {
      const [result] = await db.execute(
        `INSERT INTO SettlementParticipants 
        (settlement_id, member_id, amount, status)
        VALUES (?, ?, ?, ?)`,
        [
          participantData.settlement_id,
          participantData.member_id,
          participantData.amount,
          participantData.status || "pending",
        ]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  static async updateAmount(settlementId, memberId, amount) {
    try {
      await db.execute(
        "UPDATE SettlementParticipants SET amount = ? WHERE settlement_id = ? AND member_id = ?",
        [amount, settlementId, memberId]
      );
    } catch (error) {
      throw error;
    }
  }

  static async updateStatus(settlementId, memberId, status) {
    try {
      await db.execute(
        "UPDATE SettlementParticipants SET status = ? WHERE settlement_id = ? AND member_id = ?",
        [status, settlementId, memberId]
      );
    } catch (error) {
      throw error;
    }
  }

  static async delete(settlementId, memberId) {
    try {
      await db.execute(
        "DELETE FROM SettlementParticipants WHERE settlement_id = ? AND member_id = ?",
        [settlementId, memberId]
      );
    } catch (error) {
      throw error;
    }
  }

  static async getTotalAmount(settlementId) {
    try {
      const [rows] = await db.execute(
        "SELECT SUM(amount) as total FROM SettlementParticipants WHERE settlement_id = ?",
        [settlementId]
      );
      return rows[0].total || 0;
    } catch (error) {
      throw error;
    }
  }

  static async getPaidAmount(settlementId) {
    try {
      const [rows] = await db.execute(
        "SELECT SUM(amount) as paid_total FROM SettlementParticipants WHERE settlement_id = ? AND status = 'paid'",
        [settlementId]
      );
      return rows[0].paid_total || 0;
    } catch (error) {
      throw error;
    }
  }

  static async updateStatusWithStudentIdAndAmount(
    studentId,
    amount,
    status
  ) {
    try {
      await db.execute(
        "UPDATE SettlementParticipants SET status = ? WHERE member_id = ? AND amount = ?",
        [status, studentId, amount]
      );
    } catch (error) {
      throw error;
    }
  }
}

module.exports = SettlementParticipant;
