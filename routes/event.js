const express = require("express");
const router = express.Router();
const path = require("path");

router.get("/", async (req, res, next) => {
  res.sendFile(path.join(__dirname, "../public/views/event/events.html"));
});

module.exports = router;
