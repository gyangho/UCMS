const express = require("express");
const router = express.Router();
const path = require("path");

router.use(express.static(path.join(__dirname, "../public")));

router.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/pages/dashboard.html"));
});

router.get("/pos", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/pages/pos.html"));
});

router.get("/records", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/pages/records.html"));
});

module.exports = router;
