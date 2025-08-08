const express = require("express");
const router = express.Router();
const EventController = require("../controllers/eventController");

// 페이지 렌더링
router.get("/calendar", EventController.renderCalendar);
router.get("/form", EventController.renderEventForm);
router.get("/manage", EventController.renderEventManage);
router.get("/myevents", EventController.renderMyEvents);
router.get("/info", EventController.renderEventInfo);

// 이벤트 CRUD
router.get("/", EventController.getEvents);
router.get("/:id", EventController.getEvent);
router.post("/", EventController.createEvent);
router.put("/:id", EventController.updateEvent);
router.delete("/:id", EventController.deleteEvent);

// 이벤트 참가자 관리
router.get("/:eventId/participants", EventController.getEventParticipants);
router.post("/:eventId/participants", EventController.addEventParticipant);
router.delete(
  "/:eventId/participants/:memberId",
  EventController.removeEventParticipant
);

// 공휴일 조회
router.get("/holidays/:year", EventController.getHolidays);

module.exports = router;
