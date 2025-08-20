const db = require("./db");

class InterviewPlan {
  //면접 계획 조회
  static async getInterviewPlans() {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM interview_plans ORDER BY created_at DESC"
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async getInterviewPlanById(id) {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM interview_plans WHERE id = ?",
        [id]
      );
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  //면접 계획 추가
  static async createInterviewPlan(planData) {
    try {
      const [result] = await db.execute(
        `INSERT INTO interview_plans 
        (form_id, title, created_by, updated_by) 
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
        form_id = VALUES(form_id), title = VALUES(title), updated_by = VALUES(updated_by)`,
        [
          planData.formId,
          planData.title,
          planData.created_by,
          planData.created_by,
        ]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  //면접 계획 수정
  static async updateInterviewPlan(id, planData) {
    try {
      await db.execute(
        "UPDATE interview_plans SET form_id = ?, title = ?, updated_by = ? WHERE id = ?",
        [planData.formId, planData.title, planData.created_by, id]
      );
    } catch (error) {
      throw error;
    }
  }

  //면접 계획 삭제
  static async deleteInterviewPlan(id) {
    try {
      await db.execute("DELETE FROM interview_plans WHERE id = ?", [
        id,
      ]);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = InterviewPlan;
