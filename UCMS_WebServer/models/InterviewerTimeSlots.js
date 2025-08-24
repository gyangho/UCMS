const db = require("./db");

class InterviewerTimeSlots {
  static async createInterviewerTimeSlots(
    planId,
    interviewerId,
    interviewDate,
    timeSlot,
    isAvailable
  ) {
    try {
      const [result] = await db.execute(
        `INSERT INTO interviewer_time_slots 
        (plan_id, interviewer_id, interview_date, time_slot, is_available) 
        VALUES (?, ?, ?, ?, ?)`,
        [planId, interviewerId, interviewDate, timeSlot, isAvailable]
      );
      return result.affectedRows;
    } catch (error) {
      throw error;
    }
  }

  static async getInterviewerTimeSlots(planId) {
    const [rows] = await db.execute(
      `SELECT its.*, m.name as interviewer_name 
       FROM interviewer_time_slots its
       JOIN Members m ON its.interviewer_id = m.student_id
       WHERE its.plan_id = ?
       ORDER BY its.interview_date, its.time_slot`,
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
