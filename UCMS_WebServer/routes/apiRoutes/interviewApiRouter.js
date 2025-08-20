const express = require("express");
const router = express.Router();
const RecruitController = require("../../controllers/recruitController");

router.get("/plans", RecruitController.getInterviewPlans);

module.exports = router;
