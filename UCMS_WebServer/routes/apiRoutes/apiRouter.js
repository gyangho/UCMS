const express = require("express");
const router = express.Router();
const userApi = require("./userApiRouter");
const memberApi = require("./memberApiRouter");
const recruitApi = require("./recruitApiRouter");
const formsApi = require("./formsApiRouter");
const interviewApi = require("./interviewApiRouter");
const posApi = require("./posApiRouter");
const recordsApi = require("./recordsApiRouter");
// 루트 경로
router.get("/", (req, res) => {
  res.json({ message: "UCMS API Server" });
});

router.use("/user", userApi);
router.use("/member", memberApi);
router.use("/recruit", recruitApi);
router.use("/forms", formsApi);
router.use("/interview", interviewApi);
router.use("/pos", posApi);
router.use("/records", recordsApi);

module.exports = router;
