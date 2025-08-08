const express = require("express");
const router = express.Router();
const PurchaseController = require("../controllers/purchaseController");

// 구매 기록 관련 API
router.get("/purchases", PurchaseController.getPurchases);
router.get("/purchases/:id", PurchaseController.getPurchase);
router.post("/purchases", PurchaseController.createPurchase);
router.put("/purchases/:id", PurchaseController.updatePurchase);
router.delete("/purchases/:id", PurchaseController.deletePurchase);

// POS 페이지 렌더링
router.get("/pos", PurchaseController.renderPos);

// 기록 페이지 렌더링
router.get("/records", PurchaseController.renderRecords);

module.exports = router;
