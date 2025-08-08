const db = require("./index");

class Event {
  static async findAll() {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM events ORDER BY start_date DESC"
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async findById(id) {
    try {
      const [rows] = await db.execute("SELECT * FROM events WHERE id = ?", [
        id,
      ]);
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  static async findByDateRange(startDate, endDate) {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM events WHERE start_date BETWEEN ? AND ? ORDER BY start_date",
        [startDate, endDate]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async create(eventData) {
    try {
      const [result] = await db.execute(
        "INSERT INTO events (title, description, start_date, end_date, location, color, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          eventData.title,
          eventData.description,
          eventData.start_date,
          eventData.end_date,
          eventData.location,
          eventData.color,
          eventData.created_by,
        ]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  static async update(id, eventData) {
    try {
      await db.execute(
        "UPDATE events SET title = ?, description = ?, start_date = ?, end_date = ?, location = ?, color = ? WHERE id = ?",
        [
          eventData.title,
          eventData.description,
          eventData.start_date,
          eventData.end_date,
          eventData.location,
          eventData.color,
          id,
        ]
      );
    } catch (error) {
      throw error;
    }
  }

  static async delete(id) {
    try {
      await db.execute("DELETE FROM events WHERE id = ?", [id]);
    } catch (error) {
      throw error;
    }
  }

  static async getParticipants(eventId) {
    try {
      const [rows] = await db.execute(
        "SELECT ep.*, m.name, m.student_id FROM event_participants ep JOIN Members m ON ep.member_id = m.id WHERE ep.event_id = ?",
        [eventId]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async addParticipant(eventId, memberId) {
    try {
      await db.execute(
        "INSERT INTO event_participants (event_id, member_id) VALUES (?, ?)",
        [eventId, memberId]
      );
    } catch (error) {
      throw error;
    }
  }

  static async removeParticipant(eventId, memberId) {
    try {
      await db.execute(
        "DELETE FROM event_participants WHERE event_id = ? AND member_id = ?",
        [eventId, memberId]
      );
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Event;
