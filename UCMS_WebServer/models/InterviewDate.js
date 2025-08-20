const db = require("./db");

class InterviewDate {
  static async createInterviewDates(planData) {
    try {
      for (let i = 0; i < planData.interviewDates.length; i++) {
        const [result] = await db.execute(
          `INSERT INTO interview_dates 
          (plan_id, interview_date, question_id) 
          VALUES (?, ?, ?)`,
          [
            planData.planId,
            planData.interviewDates[i],
            planData.questionIds[i],
          ]
        );
      }
    } catch (error) {
      throw error;
    }
  }

  static async getInterviewDates(planId) {
    const [rows] = await db.execute(
      "SELECT * FROM interview_dates WHERE plan_id = ?",
      [planId]
    );
    return rows;
  }

  static async deleteInterviewDates(planId) {
    const [result] = await db.execute(
      "DELETE FROM interview_dates WHERE plan_id = ?",
      [planId]
    );
    return result.affectedRows;
  }
}

module.exports = InterviewDate;
