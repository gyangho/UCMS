const FormList = require("./FormList");
const FormResponse = require("./FormResponse");
const FormQuestions = require("./FormQuestions");

class Form {
  // Form 메서드들
  static getFormList = FormList.getFormList;
  static getFormById = FormList.getFormById;
  static createForm = FormList.createForm;
  static updateForm = FormList.updateForm;
  static addForm = FormList.addForm;

  // FormList 메서드들
  static getQuestionIds = FormList.getQuestionIds;
  static loadFormStructure = FormList.loadFormStructure;
  static syncResponses = FormList.syncResponses;

  // FormResponse 메서드들
  static getResponses = FormResponse.getResponses;
  static getResponseById = FormResponse.getResponseById;
  static getResponsesByResponseId =
    FormResponse.getResponsesByResponseId;

  // FormQuestions 메서드들
  static getQuestionsByFormId = FormQuestions.getQuestionsByFormId;
}

module.exports = Form;
