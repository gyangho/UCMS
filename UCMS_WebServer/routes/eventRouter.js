const express = require("express");
const router = express.Router();
const EventController = require("../controllers/eventController");
const { getHolidays } = require("../extern_apis/holidays");

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

// 공휴일 조회
router.get("/holidays", EventController.insertHolidays);

module.exports = router;
