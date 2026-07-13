const express = require("express");
const router = express.Router();
const RecruitController = require("../../controllers/recruitController");

router.post("/update-rating", RecruitController.updateRecruitRating);
router.get("/download-excel", RecruitController.downloadExcel);

module.exports = router;
