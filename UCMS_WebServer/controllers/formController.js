const Form = require("../models/Form");

class FormController {
  static async getFormQuestions(req, res) {
    const formId = req.params.id;
    const questions = await Form.getQuestionsByFormId(formId);
    res.json({ questions });
  }
}

module.exports = FormController;
