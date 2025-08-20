const express = require("express");
const router = express.Router();
const PurchaseController = require("../../controllers/purchaseController");
const userApi = require("./userApiRouter");
const memberApi = require("./memberApiRouter");
const recruitApi = require("./recruitApiRouter");
const formsApi = require("./formsApiRouter");
const interviewApi = require("./interviewApiRouter");

// 루트 경로
router.get("/", (req, res) => {
  res.json({ message: "UCMS API Server" });
});

router.use("/user", userApi);
router.use("/member", memberApi);
router.use("/recruit", recruitApi);
router.use("/forms", formsApi);
router.use("/interview", interviewApi);

// 구매 기록 관련 API
router.get("/purchases", PurchaseController.getPurchases);
router.get("/purchases/:id", PurchaseController.getPurchase);
router.post("/purchases", PurchaseController.createPurchase);
router.put("/purchases/:id", PurchaseController.updatePurchase);
router.delete("/purchases/:id", PurchaseController.deletePurchase);

// 구매 기록 조회 및 삭제 API
router.get("/records", PurchaseController.getPurchases);
router.delete("/records/:id", PurchaseController.deletePurchase);
router.post("/records/clear", PurchaseController.deleteAll);

module.exports = router;
