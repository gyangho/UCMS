const express = require("express");
const router = express.Router();
const FinanceController = require("../controllers/financeController");
const { requireAuthority } = require("./apiRoutes/apiResponse");
const requireFinanceManager = requireAuthority(4);

// 정산 생성 페이지
router.get("/settle/create", requireFinanceManager, FinanceController.getCreatePage);

// 정산 생성 처리
router.post("/settle/create", requireFinanceManager, FinanceController.createSettlement);

// 정산 관리 페이지
router.get("/settle/manage", requireFinanceManager, FinanceController.getManagePage);

// 이벤트 참여자 조회
router.get("/events/:eventId/participants", FinanceController.getEventParticipants);

// 정산 상세 정보 조회
router.get("/settlements/:id", FinanceController.getSettlementDetails);

// 정산 상태 업데이트
router.put("/settlements/:id/status", requireFinanceManager, FinanceController.updateSettlementStatus);

// 정산 참여자 추가
router.post("/settlements/:settlementId/participants", requireFinanceManager, FinanceController.addParticipant);

// 정산 참여자 제거
router.delete(
  "/settlements/:settlementId/participants/:memberId",
  requireFinanceManager,
  FinanceController.removeParticipant
);

// 정산 참여자 금액 업데이트
router.put(
  "/settlements/:settlementId/participants/:memberId/amount",
  requireFinanceManager,
  FinanceController.updateParticipantAmount
);

// 정산 참여자 결제 상태 업데이트
router.put(
  "/settlements/:settlementId/participants/:memberId/status",
  requireFinanceManager,
  FinanceController.updateParticipantStatus
);

// 사용자의 정산 목록 조회 (대시보드용)
router.get("/user/settlements", FinanceController.getUserSettlements);

// 정산 삭제
router.delete("/settlements/:id", requireFinanceManager, FinanceController.deleteSettlement);

module.exports = router;
