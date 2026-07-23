const db = require("./db");

class IntervieweeTimeSlots {
  static async createIntervieweeTimeSlots(
    planId,
    studentId,
    interviewDate,
    timeSlot
  ) {
    const query = `
            INSERT INTO interviewee_time_slots 
            (plan_id, interviewee_id, interview_date, time_slot)
            VALUES (?, ?, ?, ?)
        `;
    const values = [planId, studentId, interviewDate, timeSlot];
    const result = await db.query(query, values);
    return result;
  }

  static async getIntervieweeTimeSlots(planId) {
    const query = `
      SELECT interviewee_id, interview_date, time_slot FROM interviewee_time_slots WHERE plan_id = ?
    `;
    const values = [planId];
    const result = await db.query(query, values);
    return result[0];
  }

  static async getIntervieweeIds(planID) {
    const query = `
      SELECT DISTINCT interviewee_id FROM interviewee_time_slots WHERE plan_id = ?
    `;
    const values = [planID];
    const result = await db.query(query, values);
    return result[0];
  }

  static async deleteIntervieweeTimeSlots(planId) {
    const query = `
      DELETE FROM interviewee_time_slots WHERE plan_id = ?
    `;
    const values = [planId];
    const result = await db.query(query, values);
    return result;
  }

  // 2026-07-23: Rebuild applicant availability atomically before running the scheduler.
  static async replaceIntervieweeTimeSlots(planId, slots) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        "DELETE FROM interviewee_time_slots WHERE plan_id = ?",
        [planId]
      );
      for (const slot of slots) {
        await connection.execute(
          `INSERT INTO interviewee_time_slots
           (plan_id, interviewee_id, interview_date, time_slot)
           VALUES (?, ?, ?, ?)`,
          [planId, slot.studentId, slot.interviewDate, slot.timeSlot]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = IntervieweeTimeSlots;
