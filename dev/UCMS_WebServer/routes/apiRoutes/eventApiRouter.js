const express = require("express");
const router = express.Router();
const Event = require("../../models/Event");

router.get("/events", async (req, res) => {
  try {
    const events = await Event.findByAuthority(req.session.authority);
    res.json({ success: true, events });
  } catch (error) {
    console.error("GET /api/event/events error", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

router.get("/my-events", async (req, res) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const events = await Event.findByUserId(userId);
    res.json({ success: true, events });
  } catch (error) {
    console.error("GET /api/event/my-events error", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

module.exports = router;
