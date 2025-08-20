const db = require("./db");

class InterviewerTimeSlots {
  static async createInterviewerTimeSlots(
    planId,
    interviewerId,
    timeSlots
  ) {
    try {
      const [result] = await db.execute(
        "INSERT INTO interviewer_time_slots (plan_id, interviewer_id, time_slots) VALUES (?, ?, ?)",
        [planId, interviewerId, timeSlots]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  static async getInterviewerTimeSlots(planId) {
    const [rows] = await db.execute(
      "SELECT * FROM interviewer_time_slots WHERE plan_id = ?",
      [planId]
    );
    return rows;
  }

  static async deleteInterviewerTimeSlots(planId) {
    const [result] = await db.execute(
      "DELETE FROM interviewer_time_slots WHERE plan_id = ?",
      [planId]
    );
    return result.affectedRows;
  }
}

module.exports = InterviewerTimeSlots;
