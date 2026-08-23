const express = require("express");
const router = express.Router();
const RecruitController = require("../../controllers/recruitController");
const { requireAuthority } = require("./apiResponse");

// 2026-08-19: Rating changes and applicant exports require administrator authority.
// 2026-08-21: Recruitment management starts at the normalized executive rank.
router.use(requireAuthority(3));

router.post("/update-rating", RecruitController.updateRecruitRating);
router.get("/download-excel", RecruitController.downloadExcel);

module.exports = router;
