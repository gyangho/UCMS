const express = require("express");
const router = express.Router();
const RecruitController = require("../controllers/recruitController");
const { requireAuthority } = require("./apiRoutes/apiResponse");

// 2026-08-19: Legacy recruiting pages and mutations contain applicant data and require administrator authority.
router.use(requireAuthority(4));

// 응답 페이지 렌더링
router.get("/formlist", RecruitController.renderFormList);
router.get("/responses", RecruitController.renderRecruitMemberList);
router.get("/detail", RecruitController.renderResponseDetail);
router.post("/formlist", RecruitController.addForm);

// 구글 폼 동기화
router.post("/sync", RecruitController.syncResponses);

// 폼 관리
router.get("/forms", RecruitController.getFormList);
router.get("/forms/:id", RecruitController.getForm);
router.put("/forms/:id", RecruitController.updateForm);
router.delete("/forms/:id", RecruitController.deleteForm);

// 면접 타임테이블 생성
router.get("/interview/plan", RecruitController.renderInterviewPlan);

router.get(
  "/interview/plan/selectform",
  RecruitController.renderInterviewSelectForm
);

router.post(
  "/interview/plan/selectform",
  RecruitController.createInterviewPlan
);

router.get(
  "/interview/plan/interviewer/add",
  RecruitController.renderInterviewInterviewerAdd
);

router.post(
  "/interview/plan/interviewer/add",
  RecruitController.duplicateInterviewer
);

router.get(
  "/interview/plan/interviewer/timeinfo",
  RecruitController.renderInterviewTimeInfo
);

router.post(
  "/interview/plan/interviewer/timeinfo",
  RecruitController.createInterviewerTimeInfo
);

// 면접 계획 관리
router.get(
  "/interview/plans",
  RecruitController.renderInterviewPlans
);
router.get(
  "/interview/plans/:id",
  RecruitController.renderInterviewPlanDetail
);

// 활성 면접 스케줄 조회
router.get(
  "/interview/activedschedule",
  RecruitController.getActiveInterviewSchedules
);

module.exports = router;
