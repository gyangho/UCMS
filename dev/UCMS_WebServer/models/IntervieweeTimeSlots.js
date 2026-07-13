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
}

module.exports = IntervieweeTimeSlots;
