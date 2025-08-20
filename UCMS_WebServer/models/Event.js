const db = require("./db");

class Event {
  static async findAll() {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM events ORDER BY start DESC"
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async findById(id) {
    try {
      const [rows] = await db.execute(
        "SELECT *, authority+0 AS authority_num FROM events WHERE id = ?",
        [id]
      );
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
        `INSERT INTO events 
        (title, description, start, end, color, author_id, updater_id, authority, ismultiple, isRecruiting, recruit_start, recruit_end)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eventData.title,
          eventData.description,
          eventData.start,
          eventData.end,
          eventData.color || "#43ff7bff",
          eventData.author_id,
          eventData.updater_id,
          eventData.authority || 2,
          eventData.ismultiple || false,
          eventData.isRecruiting || false,
          eventData.recruit_start || null,
          eventData.recruit_end || null,
        ]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  static async update(id, eventData) {
    const query = `UPDATE events SET ${Object.keys(eventData)
      .map((key) => `${key} = ?`)
      .join(", ")} WHERE id = ?`;
    const values = Object.values(eventData);
    values.push(id);
    console.log(query, values);

    try {
      await db.execute(query, values);
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

  static async deleteHolidays() {
    try {
      await db.execute("DELETE FROM events WHERE author_id = 0");
    } catch (error) {
      throw error;
    }
  }

  static async getParticipants(eventId) {
    try {
      const [rows] = await db.execute(
        "SELECT ep.*, m.name, m.student_id FROM event_participants ep JOIN Members m ON ep.user_id = m.user_id WHERE ep.event_id = ?",
        [eventId]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async addParticipant(eventId, userId) {
    try {
      await db.execute(
        "INSERT INTO event_participants (event_id, user_id) VALUES (?, ?)",
        [eventId, userId]
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

  static async findByAuthority(authority) {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM events WHERE authority <= ? ORDER BY start DESC",
        [authority]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async findByAuthorityWithoutHolidays(authority) {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM events WHERE authority <= ? AND author_id != 0 ORDER BY start DESC",
        [authority]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async findByUserId(userId) {
    try {
      const [rows] = await db.execute(
        `SELECT e.id, e.title, e.start, e.end, e.color, e.authority, e.ismultiple
         FROM events e
         JOIN event_participants p ON e.id = p.event_id
         WHERE p.user_id = ?
         ORDER BY e.start ASC`,
        [userId]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async findRecruitingEvents(today) {
    try {
      const [rows] = await db.execute(
        `SELECT id, title, start, end, color, authority, ismultiple
         FROM events 
         WHERE isrecruiting = true AND recruit_start <= ? AND recruit_end >= ?`,
        [today, today]
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Event;
