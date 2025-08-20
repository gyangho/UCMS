const db = require("./db");

class FormQuestions {
  static async getQuestionsByFormId(formId) {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM form_questions WHERE form_id = ? ORDER BY idx",
        [formId]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async getFormQuestionsByFormId(formId) {
    try {
      const questions = await FormQuestions.getQuestionsByFormId(
        formId
      );
      return questions;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = FormQuestions;
