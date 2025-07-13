const express = require("express");
const router = express.Router();
const path = require("path");

router.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/views/dashboard.html"));
});

router.get("/pos", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/views/pos.html"));
});

router.get("/records", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/views/records.html"));
});

router.get("/mypage", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/views/mypage.html"));
});

module.exports = router;
