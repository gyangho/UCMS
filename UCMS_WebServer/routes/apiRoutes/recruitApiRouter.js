const express = require("express");
const router = express.Router();
const RecruitController = require("../../controllers/recruitController");

router.post("/update-rating", RecruitController.updateRecruitRating);

module.exports = router;
