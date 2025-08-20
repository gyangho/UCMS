const db = require("./db");

class InterviewInterviewer {
  //면접 인터뷰어 조회
  static async getInterviewers(planId) {
    try {
      const [rows] = await db.execute(
        `SELECT m.student_id as id, m.name AS name, m.authority AS authority 
         FROM interview_interviewers ii
         JOIN Members m ON ii.interviewer_id = m.student_id
         WHERE ii.plan_id = ?
         ORDER BY m.name`,
        [planId]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  //면접 인터뷰어 추가
  static async addInterviewer(planId, interviewerId) {
    try {
      const [result] = await db.execute(
        `INSERT INTO interview_interviewers 
        (plan_id, interviewer_id) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE 
        interviewer_id = VALUES(interviewer_id), created_at = NOW()`,
        [planId, interviewerId]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  //면접 인터뷰어 삭제
  static async removeInterviewer(planId, interviewerId) {
    try {
      await db.execute(
        "DELETE FROM interview_interviewers WHERE plan_id = ? AND interviewer_id = ?",
        [planId, interviewerId]
      );
    } catch (error) {
      throw error;
    }
  }
}

module.exports = InterviewInterviewer;
