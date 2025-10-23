const Event = require("../models/Event");
const Member = require("../models/Member");
const { getHolidays } = require("../extern_apis/holidays");

class EventController {
  static checkValidEvent(start, end) {
    if (new Date(start) - new Date(end) > 0) {
      return false;
    }
    return true;
  }

  static isMultipleEvent(eventData) {
    if (
      new Date(eventData.end).getDate() -
        new Date(eventData.start).getDate() >=
      1
    ) {
      return true;
    }
    return false;
  }

  static async getEvents(req, res) {
    try {
      const events = await Event.findByAuthorityWithoutHolidays(
        req.session.authority
      );
      res.render("event/event_manage", { myEvents: events });
    } catch (error) {
      console.error("Get events error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getEvent(req, res) {
    try {
      const { id } = req.query;

      if (!id) {
        return res
          .status(400)
          .json({ error: "Event ID is required" });
      }

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
        author_id: req.session.userId,
        updater_id: req.session.userId,
      };

      if (eventData.isRecruiting === "on") {
        eventData.isRecruiting = true;
      } else {
        eventData.isRecruiting = false;
      }

      if (
        !EventController.checkValidEvent(
          eventData.start,
          eventData.end
        )
      ) {
        return res.status(400).send(
          `<script>alert("이벤트 생성 실패: 시작 시간이 종료 시간보다 늦습니다.");
          </script>`
        );
      }

      if (eventData.isRecruiting) {
        if (
          !EventController.checkValidEvent(
            eventData.recruit_start,
            eventData.recruit_end
          )
        ) {
          return res.status(400).send(
            `<script>alert("이벤트 생성 실패: 모집 시작 시간이 모집 종료 시간보다 늦습니다.");
            </script>`
          );
        }
      }

      if (EventController.isMultipleEvent(eventData)) {
        eventData.ismultiple = true;
      }

      await Event.create(eventData);

      res.status(201).send(
        `<script>alert("이벤트 등록 완료");
          window.location.href = "/dashboard";
          </script>`
      );
    } catch (error) {
      console.error("Create event error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async updateEvent(req, res) {
    try {
      const { id } = req.query;
      const eventData = req.body;

      if (eventData.isrecruiting === "on") {
        eventData.isrecruiting = true;
      } else {
        eventData.isrecruiting = false;
      }

      if (!id) {
        return res.status(400).send(
          `<script>alert("이벤트 수정 실패: 이벤트 ID가 필요합니다.");
          </script>`
        );
      }

      if (
        !EventController.checkValidEvent(
          eventData.start,
          eventData.end
        )
      ) {
        return res.status(400).send(
          `<script>alert("이벤트 수정 실패: 시작 시간이 종료 시간보다 늦습니다.");
          </script>`
        );
      }

      if (eventData.isRecruiting) {
        if (
          !EventController.checkValidEvent(
            eventData.recruit_start,
            eventData.recruit_end
          )
        ) {
          return res.status(400).send(
            `<script>alert("이벤트 수정 실패: 모집 시작 시간이 모집 종료 시간보다 늦습니다.");
            </script>`
          );
        }
      }

      if (EventController.isMultipleEvent(eventData)) {
        eventData.ismultiple = true;
      }

      await Event.update(id, eventData);

      res.status(200).send(
        `<script>alert("이벤트 수정 완료");
          window.location.href = "/dashboard";
          </script>`
      );
    } catch (error) {
      console.error("Update event error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async deleteEvent(req, res) {
    try {
      const { id } = req.query;

      if (!id) {
        return res
          .status(400)
          .json({ error: "Event ID is required" });
      }

      await Event.delete(id);
      res.status(204).send(
        `<script>alert("이벤트 삭제 완료");
          window.location.reload();
          </script>`
      );
    } catch (error) {
      console.error("Delete event error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getEventParticipants(req, res) {
    try {
      const { eventId } = req.query;

      if (!eventId) {
        return res
          .status(400)
          .json({ error: "Event ID is required" });
      }

      const participants = await Event.getParticipants(eventId);
      res.json(participants);
    } catch (error) {
      console.error("Get event participants error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async addEventParticipant(req, res) {
    try {
      const eventId = req.query.id;
      const userId = req.session.userId;

      if (!eventId) {
        return res
          .status(400)
          .json({ error: "Event ID is required" });
      }

      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }

      await Event.addParticipant(eventId, userId);
      res
        .status(200)
        .json({ message: "Participant added successfully" });
    } catch (error) {
      console.error("Add event participant error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async removeEventParticipant(req, res) {
    try {
      const eventId = req.query.id;
      const userId = req.session.userId;

      if (!eventId) {
        return res
          .status(400)
          .json({ error: "Event ID is required" });
      }

      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }

      await Event.removeParticipant(eventId, userId);
      res
        .status(200)
        .json({ message: "Participant removed successfully" });
    } catch (error) {
      console.error("Remove event participant error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async insertHolidays(req, res) {
    try {
      await Event.deleteHolidays();
      const year = new Date().getFullYear();
      const holidays = await getHolidays(year);
      const holidayData = holidays.map((holiday) => ({
        title: holiday.dateName,
        description: "공휴일",
        start: holiday.locdate,
        end: holiday.locdate,
        color: "#f95959",
        author_id: 0,
        updater_id: 0,
        authority: "미인증",
        ismultiple: false,
      }));
      for (const holiday of holidayData) {
        await Event.create(holiday);
      }
      res.status(200).send(
        `<script>alert("공휴일 데이터 삽입 완료");
          window.location.href = "/dashboard";
          </script>`
      );
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
      res.render("event/event_form", {
        data: {},
        error: null,
        sessionAuthority: req.session.authority,
      });
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
      const myEvents = await Event.findByUserId(req.session.userId);
      res.render("event/myevents", { myEvents });
    } catch (error) {
      console.error("Render my events error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderEventInfo(req, res) {
    try {
      const { id } = req.query;
      const event = await Event.findById(id);
      const participants = await Event.getParticipants(id);

      event.start = new Date(event.start.getTime() + 9 * 3600 * 1000)
        .toISOString()
        .slice(0, 16);
      event.end = new Date(event.end.getTime() + 9 * 3600 * 1000)
        .toISOString()
        .slice(0, 16);

      if (event.isRecruiting) {
        event.recruit_start = new Date(
          event.recruit_start.getTime() + 9 * 3600 * 1000
        )
          .toISOString()
          .slice(0, 16);
        event.recruit_end = new Date(
          event.recruit_end.getTime() + 9 * 3600 * 1000
        )
          .toISOString()
          .slice(0, 16);
      }

      console.log(event);
      res.render("event/info", {
        currentUserId: req.session.userId,
        currentEvent: event,
        error: null,
        sessionAuthority: req.session.authority,
        participants,
      });
    } catch (error) {
      console.error("Render event info error:", error);
      res.status(500).send("Internal server error");
    }
  }
}

module.exports = EventController;
