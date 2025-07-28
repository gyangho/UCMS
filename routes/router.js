const express = require("express");
const router = express.Router();
const path = require("path");
const db = require("../db");

router.get("/dashboard", async (req, res, next) => {
  const authority = req.session.authority;
  const query = `
    SELECT id, title, start, end, color, ismultiple 
    FROM events
    WHERE authority < ? 
    ORDER BY start ASC`;

  try {
    const [calendar_events] = await db.query(query, [authority]);
    const [myevents_events] = await db.query(
      `SELECT e.id, e.title, e.start, e.end, e.color, e.authority, e.ismultiple
    FROM events e
    JOIN event_participants p ON e.id = p.event_id
    WHERE p.kakao_id = ?
    ORDER BY e.start ASC`,
      [req.session.kakao_id]
    );
    calendar_events.forEach((ev) => {
      ev.start = new Date(ev.start);
      ev.end = new Date(ev.end);
    });

    const today = new Date();
    const [myEvents] = await db.query(
      `
      SELECT e.id, e.title, e.start, e.end, e.color, e.authority, e.ismultiple 
      FROM events e 
      JOIN event_participants p ON e.id = p.event_id 
      WHERE p.kakao_id = ? 
      ORDER BY e.start ASC`,
      [req.session.kakao_id]
    );
    // 자바스크립트 Date 객체로 변환
    myEvents.forEach((ev) => {
      ev.start = new Date(ev.start);
      ev.end = new Date(ev.end);
    });

    const [recruitingEvents] = await db.query(
      `
      SELECT id, title, start, end, color, authority, ismultiple
      FROM events 
      WHERE isrecruiting = true AND recruit_start <= ? AND recruit_end >= ?
      `,
      [today, today]
    );
    // 자바스크립트 Date 객체로 변환
    recruitingEvents.forEach((ev) => {
      ev.start = new Date(ev.start);
      ev.end = new Date(ev.end);
    });

    res.render("dashboard", {
      error: null,
      data: {},
      calendar_events,
      myEvents,
      recruitingEvents,
    });
  } catch (err) {
    next(err);
  }
  // 자바스크립트 Date 객체로 변환
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
