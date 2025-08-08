const express = require("express");
const router = express.Router();
const RecruitController = require("../controllers/recruitController");

// 페이지 렌더링
router.get("/formlist", RecruitController.renderFormList);
router.get("/response", RecruitController.renderRecruitResponse);
router.get("/interview/plans", RecruitController.renderInterviewPlans);
router.get("/interview/plan", RecruitController.renderInterviewPlan);
router.get(
  "/interview/plan/detail",
  RecruitController.renderInterviewPlanDetail
);
router.get(
  "/interview/selectform",
  RecruitController.renderInterviewSelectForm
);
router.get("/interview/timeinfo", RecruitController.renderInterviewTimeInfo);
router.get(
  "/interview/interviewer/add",
  RecruitController.renderInterviewInterviewerAdd
);
router.get("/detail", RecruitController.renderDetail);

// 폼 관리
router.get("/forms", RecruitController.getFormList);
router.get("/forms/:id", RecruitController.getForm);
router.post("/forms", RecruitController.createForm);
router.put("/forms/:id", RecruitController.updateForm);
router.delete("/forms/:id", RecruitController.deleteForm);

// 응답 관리
router.get("/forms/:formId/responses", RecruitController.getResponses);
router.put("/responses/:id/rating", RecruitController.updateResponseRating);

// 면접 계획 관리
router.get("/interview/plans", RecruitController.getInterviewPlans);
router.get("/interview/plans/:id", RecruitController.getInterviewPlan);
router.post("/interview/plans", RecruitController.createInterviewPlan);
router.put("/interview/plans/:id", RecruitController.updateInterviewPlan);
router.delete("/interview/plans/:id", RecruitController.deleteInterviewPlan);

// 면접 날짜 관리
router.get(
  "/interview/plans/:planId/dates",
  RecruitController.getInterviewDates
);
router.post(
  "/interview/plans/:planId/dates",
  RecruitController.addInterviewDate
);

// 면접관 관리
router.get(
  "/interview/plans/:planId/interviewers",
  RecruitController.getInterviewers
);
router.post(
  "/interview/plans/:planId/interviewers",
  RecruitController.addInterviewer
);
router.delete(
  "/interview/plans/:planId/interviewers/:interviewerId",
  RecruitController.removeInterviewer
);

module.exports = router;
