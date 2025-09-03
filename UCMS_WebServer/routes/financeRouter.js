const express = require("express");
const router = express.Router();
const FinanceController = require("../controllers/financeController");

// 정산 생성 페이지
router.get("/settle/create", FinanceController.getCreatePage);

// 정산 생성 처리
router.post("/settle/create", FinanceController.createSettlement);

// 정산 관리 페이지
router.get("/settle/manage", FinanceController.getManagePage);

// 이벤트 참여자 조회
router.get(
  "/events/:eventId/participants",
  FinanceController.getEventParticipants
);

// 정산 상세 정보 조회
router.get(
  "/settlements/:id",
  FinanceController.getSettlementDetails
);

// 정산 상태 업데이트
router.put(
  "/settlements/:id/status",
  FinanceController.updateSettlementStatus
);

// 정산 참여자 추가
router.post(
  "/settlements/:settlementId/participants",
  FinanceController.addParticipant
);

// 정산 참여자 제거
router.delete(
  "/settlements/:settlementId/participants/:memberId",
  FinanceController.removeParticipant
);

// 정산 참여자 금액 업데이트
router.put(
  "/settlements/:settlementId/participants/:memberId/amount",
  FinanceController.updateParticipantAmount
);

// 정산 참여자 결제 상태 업데이트
router.put(
  "/settlements/:settlementId/participants/:memberId/status",
  FinanceController.updateParticipantStatus
);

// 사용자의 정산 목록 조회 (대시보드용)
router.get("/user/settlements", FinanceController.getUserSettlements);

// 정산 삭제
router.delete("/settlements/:id", FinanceController.deleteSettlement);

module.exports = router;
