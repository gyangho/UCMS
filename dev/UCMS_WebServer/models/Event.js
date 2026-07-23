const db = require("./db");

class Event {
  // 2026-07-23: Support both the documented member_id schema and the deployed user_id schema safely.
  static async getParticipantStorage() {
    if (!this.participantStoragePromise) {
      this.participantStoragePromise = db
        .execute("SHOW COLUMNS FROM event_participants")
        .then(([columns]) => {
          if (columns.some((column) => column.Field === "member_id")) {
            return { column: "member_id", memberColumn: "student_id" };
          }
          if (columns.some((column) => column.Field === "user_id")) {
            return { column: "user_id", memberColumn: "user_id" };
          }
          throw new Error("Unsupported event_participants schema.");
        });
    }
    return this.participantStoragePromise;
  }

  static async findAll() {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM events ORDER BY start DESC",
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
        [id],
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
        [startDate, endDate],
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
                 (title, description, start, end, color, author_id, updater_id, authority, ismultiple, isRecruiting,
                  recruit_start, recruit_end)
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
        ],
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  static async update(id, eventData) {
    const query = `UPDATE events
                       SET title         = ?,
                           description   = ?,
                           start         = ?,
                           end           = ?,
                           color         = ?,
                           updater_id    = ?,
                           authority     = ?,
                           ismultiple    = ?,
                           isRecruiting  = ?,
                           recruit_start = ?,
                           recruit_end   = ?
                       WHERE id = ?`;

    try {
      await db.execute(query, [
        eventData.title,
        eventData.description,
        eventData.start,
        eventData.end,
        eventData.color || "#43ff7bff",
        eventData.updater_id,
        eventData.authority || 2,
        eventData.ismultiple || false,
        eventData.isRecruiting || false,
        eventData.recruit_start || null,
        eventData.recruit_end || null,
        id,
      ]);
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
      const storage = await this.getParticipantStorage();
      const [rows] = await db.execute(
        `SELECT ep.*, m.name, m.student_id, m.user_id
           FROM event_participants ep
           JOIN Members m ON ep.${storage.column} = m.${storage.memberColumn}
          WHERE ep.event_id = ?`,
        [eventId],
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async addParticipant(eventId, userId) {
    try {
      const [members] = await db.execute(
        "SELECT student_id FROM members WHERE user_id = ? LIMIT 1",
        [userId],
      );
      if (!members[0]) return;
      const storage = await this.getParticipantStorage();
      const participantId =
        storage.column === "member_id" ? members[0].student_id : userId;
      await db.execute(
        `INSERT IGNORE INTO event_participants (event_id, ${storage.column}) VALUES (?, ?)`,
        [eventId, participantId],
      );
    } catch (error) {
      throw error;
    }
  }

  static async removeParticipant(eventId, userId) {
    try {
      // 2026-07-23: Translate the session user ID to the member foreign key before removal.
      const [members] = await db.execute(
        "SELECT student_id FROM members WHERE user_id = ? LIMIT 1",
        [userId],
      );
      if (!members[0]) return;
      const storage = await this.getParticipantStorage();
      const participantId =
        storage.column === "member_id" ? members[0].student_id : userId;
      await db.execute(
        `DELETE FROM event_participants WHERE event_id = ? AND ${storage.column} = ?`,
        [eventId, participantId],
      );
    } catch (error) {
      throw error;
    }
  }

  static async findByAuthority(authority) {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM events WHERE authority <= ? ORDER BY start DESC",
        [authority],
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
        [authority],
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async findByUserId(userId) {
    try {
      const storage = await this.getParticipantStorage();
      const [rows] = await db.execute(
        `SELECT e.id, e.title, e.start, e.end, e.color, e.authority, e.ismultiple
                 FROM events e
                          JOIN event_participants p ON e.id = p.event_id
                          JOIN members m ON m.${storage.memberColumn} = p.${storage.column}
                 WHERE m.user_id = ?
                 ORDER BY e.start ASC`,
        [userId],
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
        [today, today],
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  static async findAllForSettlement() {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM events WHERE author_id != 0 ORDER BY start DESC",
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Event;
