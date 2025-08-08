const db = require("./index");

class Recruit {
  static async getFormList() {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM formlist ORDER BY created_at DESC"
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async getFormById(id) {
    try {
      const [rows] = await db.execute("SELECT * FROM formlist WHERE id = ?", [
        id,
      ]);
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async createForm(formData) {
    try {
      const [result] = await db.execute(
        "INSERT INTO formlist (title, form_url, created_by) VALUES (?, ?, ?)",
        [formData.title, formData.form_url, formData.created_by]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  static async updateForm(id, formData) {
    try {
      await db.execute(
        "UPDATE formlist SET title = ?, form_url = ? WHERE id = ?",
        [formData.title, formData.form_url, id]
      );
    } catch (error) {
      throw error;
    }
  }

  static async deleteForm(id) {
    try {
      await db.execute("DELETE FROM formlist WHERE id = ?", [id]);
    } catch (error) {
      throw error;
    }
  }

  static async getResponses(formId) {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM form_responses WHERE form_id = ? ORDER BY created_at DESC",
        [formId]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async getResponseById(id) {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM form_responses WHERE id = ?",
        [id]
      );
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async updateResponseRating(id, rating) {
    try {
      await db.execute("UPDATE form_responses SET rating = ? WHERE id = ?", [
        rating,
        id,
      ]);
    } catch (error) {
      throw error;
    }
  }

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

  static async createInterviewPlan(planData) {
    try {
      const [result] = await db.execute(
        "INSERT INTO interview_plans (form_id, title, created_by) VALUES (?, ?, ?)",
        [planData.form_id, planData.title, planData.created_by]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  static async updateInterviewPlan(id, planData) {
    try {
      await db.execute(
        "UPDATE interview_plans SET form_id = ?, title = ? WHERE id = ?",
        [planData.form_id, planData.title, id]
      );
    } catch (error) {
      throw error;
    }
  }

  static async deleteInterviewPlan(id) {
    try {
      await db.execute("DELETE FROM interview_plans WHERE id = ?", [id]);
    } catch (error) {
      throw error;
    }
  }

  static async getInterviewDates(planId) {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM interview_dates WHERE plan_id = ? ORDER BY interview_date",
        [planId]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async addInterviewDate(dateData) {
    try {
      const [result] = await db.execute(
        "INSERT INTO interview_dates (plan_id, interview_date, question_id) VALUES (?, ?, ?)",
        [dateData.plan_id, dateData.interview_date, dateData.question_id]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  static async getInterviewers(planId) {
    try {
      const [rows] = await db.execute(
        `SELECT m.student_id as id, m.name, m.authority 
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

  static async addInterviewer(interviewerData) {
    try {
      const [result] = await db.execute(
        "INSERT INTO interview_interviewers (plan_id, interviewer_id) VALUES (?, ?)",
        [interviewerData.plan_id, interviewerData.interviewer_id]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

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

module.exports = Recruit;
