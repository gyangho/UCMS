const Event = require("../models/Event");
const { getHolidays } = require("../extern_apis/holidays");

class EventController {
  static async getEvents(req, res) {
    try {
      const events = await Event.findAll();
      res.json(events);
    } catch (error) {
      console.error("Get events error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getEvent(req, res) {
    try {
      const { id } = req.params;
      const event = await Event.findById(id);

      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      res.json(event);
    } catch (error) {
      console.error("Get event error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async createEvent(req, res) {
    try {
      const eventData = {
        ...req.body,
        created_by: req.session.user.id,
      };

      const eventId = await Event.create(eventData);
      const event = await Event.findById(eventId);

      res.status(201).json(event);
    } catch (error) {
      console.error("Create event error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async updateEvent(req, res) {
    try {
      const { id } = req.params;
      const eventData = req.body;

      await Event.update(id, eventData);
      const event = await Event.findById(id);

      res.json(event);
    } catch (error) {
      console.error("Update event error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async deleteEvent(req, res) {
    try {
      const { id } = req.params;
      await Event.delete(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete event error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getEventParticipants(req, res) {
    try {
      const { eventId } = req.params;
      const participants = await Event.getParticipants(eventId);
      res.json(participants);
    } catch (error) {
      console.error("Get event participants error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async addEventParticipant(req, res) {
    try {
      const { eventId } = req.params;
      const { memberId } = req.body;

      await Event.addParticipant(eventId, memberId);
      res.status(201).json({ message: "Participant added successfully" });
    } catch (error) {
      console.error("Add event participant error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async removeEventParticipant(req, res) {
    try {
      const { eventId, memberId } = req.params;
      await Event.removeParticipant(eventId, memberId);
      res.status(204).send();
    } catch (error) {
      console.error("Remove event participant error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getHolidays(req, res) {
    try {
      const { year } = req.params;
      const holidays = await getHolidays(year);
      res.json(holidays);
    } catch (error) {
      console.error("Get holidays error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async renderCalendar(req, res) {
    try {
      res.render("event/calendar");
    } catch (error) {
      console.error("Render calendar error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderEventForm(req, res) {
    try {
      res.render("event/event_form");
    } catch (error) {
      console.error("Render event form error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderEventManage(req, res) {
    try {
      res.render("event/event_manage");
    } catch (error) {
      console.error("Render event manage error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderMyEvents(req, res) {
    try {
      res.render("event/myevents");
    } catch (error) {
      console.error("Render my events error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderEventInfo(req, res) {
    try {
      res.render("event/info");
    } catch (error) {
      console.error("Render event info error:", error);
      res.status(500).send("Internal server error");
    }
  }
}

module.exports = EventController;
