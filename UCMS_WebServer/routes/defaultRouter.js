const express = require("express");
const router = express.Router();
const path = require("path");
const Event = require("../models/Event");
const PurchaseController = require("../controllers/purchaseController");

// 루트 경로 - 로그인 페이지로 리다이렉트
router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

router.get("/dashboard", async (req, res, next) => {
  const authority = req.session.authority;

  try {
    const calendar_events = await Event.findByAuthority(authority);
    const myevents_events = await Event.findByUserId(
      req.session.userId
    );

    calendar_events.forEach((ev) => {
      ev.start = new Date(ev.start);
      ev.end = new Date(ev.end);
    });

    const today = new Date();
    const myEvents = await Event.findByUserId(req.session.userId);

    // 자바스크립트 Date 객체로 변환
    myEvents.forEach((ev) => {
      ev.start = new Date(ev.start);
      ev.end = new Date(ev.end);
    });

    const recruitingEvents = await Event.findRecruitingEvents(today);

    // 자바스크립트 Date 객체로 변환
    recruitingEvents.forEach((ev) => {
      ev.start = new Date(ev.start);
      ev.end = new Date(ev.end);
    });

    res.render("dashboard", {
      error: null,
      data: {},
      calendar_events: JSON.stringify(calendar_events),
      myEvents: myevents_events,
      recruitingEvents,
    });
  } catch (err) {
    next(err);
  }
});

// POS 페이지 - HTML 파일로 직접 제공
router.get("/pos", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/views/pos.html"));
});

// Records 페이지 - HTML 파일로 직접 제공
router.get("/records", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/views/records.html"));
});

// Mypage 페이지 - HTML 파일로 직접 제공
router.get("/mypage", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/views/mypage.html"));
});

module.exports = router;
