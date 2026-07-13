const express = require("express");
const router = express.Router();
const PosController = require("../controllers/posController");

router.get("/", (req, res) => {
  res.redirect("/pos/instances");
});

router.get("/instances", PosController.renderInstances);

router.get("/instances/new", PosController.renderCreateInstance);

router.get("/instances/:id", PosController.renderInstanceInfo);
router.get("/instances/:id/edit", PosController.renderEditInstance);

// 축제용 포스기 페이지
router.get("/:id", PosController.renderSale);

// 구매 기록 조회
router.get("/records/:id", PosController.renderRecords);

module.exports = router;
