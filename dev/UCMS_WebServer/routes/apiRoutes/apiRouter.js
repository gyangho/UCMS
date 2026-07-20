const express = require("express");
const router = express.Router();
const contractApi = require("./contractApiRouter");
const userApi = require("./userApiRouter");
const memberApi = require("./memberApiRouter");
const recruitApi = require("./recruitApiRouter");
const formsApi = require("./formsApiRouter");
const interviewApi = require("./interviewApiRouter");
const posApi = require("./posApiRouter");
const recordsApi = require("./recordsApiRouter");
const driveApi = require("./driveApiRouter");
const eventApi = require("./eventApiRouter");

router.get("/", (req, res) => {
  res.json({ message: "UCMS API Server" });
});

router.use("/", contractApi);
router.use("/user", userApi);
router.use("/member", memberApi);
router.use("/recruit", recruitApi);
router.use("/forms", formsApi);
router.use("/interview", interviewApi);
router.use("/pos", posApi);
router.use("/records", recordsApi);
router.use("/drive", driveApi);
router.use("/event", eventApi);

module.exports = router;
