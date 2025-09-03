const express = require("express");
const router = express.Router();
const RecruitController = require("../../controllers/recruitController");

router.get("/plans", RecruitController.getInterviewPlans);
router.delete("/plans/:id", RecruitController.deleteInterviewPlan);
router.post("/timetable", RecruitController.generateTimetable);

// 면접 스케줄러 관련 라우트
router.post(
  "/scheduler/:planId/run",
  RecruitController.runInterviewScheduler
);
router.get(
  "/scheduler/:planId/status",
  RecruitController.getSchedulerStatus
);

// 면접 스케줄 조회
router.get(
  "/schedule/:planId",
  RecruitController.getInterviewSchedule
);

// 면접 계획 확정
router.post(
  "/plans/:planId/confirm",
  RecruitController.confirmInterviewPlan
);

// 면접 계획 확정 취소
router.post(
  "/plans/:planId/cancel",
  RecruitController.cancelInterviewPlan
);

// 면접 종료
router.post(
  "/plans/:planId/complete",
  RecruitController.completeInterviewPlan
);

module.exports = router;
