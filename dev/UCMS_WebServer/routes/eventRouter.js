const express = require("express");
const router = express.Router();
const EventController = require("../controllers/eventController");
const { getHolidays } = require("../extern_apis/holidays");
const { requireAuthority } = require("./apiRoutes/apiResponse");

// 페이지 렌더링
router.get("/calendar", EventController.renderCalendar);
router.get("/form", EventController.renderEventForm);
router.get("/manage", EventController.renderEventManage);
router.get("/myevents", EventController.renderMyEvents);
router.get("/info", EventController.renderEventInfo);
router.get("/events", EventController.getEvents);

router.post("/submit", EventController.createEvent);
router.post("/edit", EventController.updateEvent);
router.delete("/delete", EventController.deleteEvent);

// 이벤트 참가자 관리
router.get("/participants", EventController.getEventParticipants);
router.post("/participate", EventController.addEventParticipant);
router.post("/cancel", EventController.removeEventParticipant);

// 2026-08-19: Holiday import mutates shared events, so require POST, same-origin validation, and administrator authority.
router.post("/holidays", requireAuthority(4), EventController.insertHolidays);

module.exports = router;
