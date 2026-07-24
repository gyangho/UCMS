const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const db = require("../../models/db");
const Event = require("../../models/Event");
const Pos = require("../../models/Pos");
const Board = require("../../models/Board");
const {
  extractFormIdFromURL,
  getOAuthAuthorizationUrl,
  getOAuthClients,
  getOAuthConnectionStatus,
  isOAuthReconnectRequired,
} = require("../../extern_apis/googleapis");
const {
  InterviewSchedulerError,
  generateInterviewSchedule,
} = require("../../services/InterviewSchedulerService");
const {
  authorityLabel,
  authorityRank,
  asyncHandler,
  created,
  fail,
  ok,
  requireAuthority,
  toDate,
  toIso,
} = require("./apiResponse");

const DEFAULT_EVENT_COLOR = "#43ff7b";
const EVENT_MANAGER_AUTHORITY = 3;

function rows(result) {
  return Array.isArray(result) ? result[0] : [];
}

async function query(sql, params = []) {
  return rows(await db.execute(sql, params));
}

async function getCurrentUser(userId) {
  const result = await query(
    `SELECT u.id AS user_id,
            u.name AS user_name,
            u.profile_image,
            u.thumbnail_image,
            u.created_at AS user_created_at,
            m.student_id,
            m.name AS member_name,
            m.major,
            m.phone,
            m.gender,
            m.generation,
            m.authority
       FROM users u
       LEFT JOIN members m ON m.user_id = u.id
      WHERE u.id = ?`,
    [userId],
  );
  return result[0] || null;
}

function mapUser(row, fallbackAuthority = null) {
  const mappedAuthority =
    row.authority === null || row.authority === undefined
      ? sessionAuthorityRank(fallbackAuthority)
      : authorityRank(row.authority);
  return {
    id: row.user_id,
    userId: row.user_id,
    name: row.member_name || row.user_name,
    email: null,
    studentId: row.student_id || null,
    department: null,
    major: row.major || null,
    phone: row.phone || null,
    // 2026-07-23: Non-member general users retain their session role for inquiry-board access.
    role: row.authority || authorityLabel(mappedAuthority),
    authority: mappedAuthority,
    profileImage: row.profile_image || null,
    thumbnailImage: row.thumbnail_image || null,
    joinedAt: toDate(row.user_created_at),
  };
}

function mapMember(row) {
  // 2026-07-22: Preserve member-table field names needed by the React management editor.
  return {
    id: row.student_id,
    userId: row.user_id,
    name: row.name,
    studentId: row.student_id,
    department: null,
    major: row.major,
    phone: row.phone,
    phoneNumber: row.phone,
    email: null,
    role: row.authority,
    authority: authorityRank(row.authority),
    authorityLabel: authorityLabel(row.authority),
    generation: row.generation,
    status: "active",
  };
}

// 2026-07-23: Normalize both direct general rank 1 and linked-member ENUM positions for notice visibility.
function sessionAuthorityRank(authority) {
  if (typeof authority === "number") {
    return authority <= 1 ? Math.max(0, authority) : authority - 1;
  }
  return authorityRank(authority);
}

function mapEvent(row) {
  // 2026-07-23: Keep every event column required by the detail/edit screens and expose the active recruitment state.
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    start: toIso(row.start),
    end: toIso(row.end),
    place: null,
    color: row.color || DEFAULT_EVENT_COLOR,
    author: row.author_name || null,
    authorName: row.author_name || null,
    authorId: row.author_id,
    isMultiple: Boolean(row.ismultiple),
    isRecruiting: Boolean(row.isRecruiting),
    isRecruitingOpen: isEventRecruitmentOpen(row),
    authority: row.authority,
    recruitStart: toIso(row.recruit_start),
    recruitEnd: toIso(row.recruit_end),
    settlementId: null,
  };
}

function isEventRecruitmentOpen(event, now = new Date()) {
  if (!event?.isRecruiting || !event.recruit_start || !event.recruit_end) {
    return false;
  }
  const recruitStart = new Date(event.recruit_start);
  const recruitEnd = new Date(event.recruit_end);
  return recruitStart <= now && now <= recruitEnd;
}

function mapSettlement(row) {
  const participantCount = Number(row.participant_count || 0);
  const paidCount = Number(row.paid_count || 0);
  return {
    id: row.id,
    title: row.name,
    createdAt: toIso(row.created_at),
    dueDate: toDate(row.deadline),
    completedAt: row.status === "completed" ? toDate(row.updated_at) : null,
    amount: row.total_amount,
    dutchPay: Boolean(row.is_dutch_pay),
    paidCount,
    participantCount,
    progressPercent: participantCount
      ? Math.round((paidCount / participantCount) * 100)
      : 0,
    status: row.status,
  };
}

function mapPosInstance(row) {
  // 2026-07-23: React 목록/상세 양쪽에서 사용하는 POS 인스턴스 메타데이터를 통일한다.
  return {
    id: row.id,
    name: row.instance_name,
    instanceName: row.instance_name,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    creatorName: row.creator_name || null,
    managerName: row.creator_name || null,
    closedAt: toIso(row.closed_at),
  };
}

function mapPosProduct(row) {
  return {
    id: row.id,
    name: row.product_name,
    price: row.product_price,
    stock: row.stock,
  };
}

function mapRecruitResponse(row) {
  // 2026-07-23: Expose the recruiting_members fields shown by the legacy response table.
  return {
    id: row.id,
    responseId: row.response_id,
    applicantName: row.name,
    studentId: row.student_id,
    major: row.major,
    phoneNumber: row.phone,
    gender: row.gender,
    formId: row.form_id,
    formTitle: row.form_title,
    rating: row.rating,
    updatedAt: toIso(row.synced_at),
  };
}

// 2026-07-23: Normalize legacy and current interview schedule rows into one React table shape.
function groupInterviewScheduleRows(scheduleRows) {
  const groupedSchedule = new Map();
  for (const schedule of scheduleRows) {
    const { interviewDate, timeSlot } = normalizeScheduleDateTime(schedule);
    const key = `${interviewDate}|${timeSlot}|${schedule.interviewee_id}`;
    const current = groupedSchedule.get(key) || {
      id: schedule.id,
      date: interviewDate,
      timeSlot,
      start: interviewDate,
      end: timeSlot,
      applicantId: schedule.applicant_id || null,
      applicantStudentId: schedule.interviewee_id,
      applicantName: schedule.applicant_name || schedule.interviewee_id,
      rating: schedule.rating || null,
      responseId: schedule.response_id || null,
      interviewerNames: [],
      status: "scheduled",
    };
    const interviewerName =
      schedule.interviewer_name || schedule.interviewer_id;
    if (
      interviewerName &&
      !current.interviewerNames.includes(interviewerName)
    ) {
      current.interviewerNames.push(interviewerName);
    }
    groupedSchedule.set(key, current);
  }
  return [...groupedSchedule.values()];
}

function normalizeScheduleDateTime(schedule) {
  let interviewDate = String(schedule.interview_date || "");
  let timeSlot = String(schedule.time_slot || "");
  if (interviewDate.includes(" ")) {
    const [date, ...timeParts] = interviewDate.split(" ");
    if (!timeSlot || timeSlot === interviewDate) {
      timeSlot = timeParts.join(" ");
    }
    interviewDate = date;
  }
  if (timeSlot.includes(" ")) {
    timeSlot = timeSlot.split(" ").at(-1);
  }
  return { interviewDate, timeSlot };
}

function memberPayload(body, fallback = {}) {
  return {
    studentId: body.studentId || body.student_id || fallback.student_id,
    name: body.name || fallback.name,
    major: body.major || body.department || fallback.major || "",
    phone: body.phone || fallback.phone || "",
    gender: body.gender || fallback.gender || "남자",
    generation: Number(body.generation || fallback.generation || 1),
    authority: authorityLabel(
      body.authority || body.role || fallback.authority,
    ),
  };
}

// 2026-07-22: Normalize browser datetime-local/ISO values for MySQL DATETIME columns.
function toMysqlDateTime(value) {
  if (!value || value instanceof Date) return value;
  const match = String(value).match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?/,
  );
  return match ? `${match[1]} ${match[2]}:${match[3] || "00"}` : value;
}

function eventPayload(body, req, fallback = {}) {
  return {
    title: body.title || fallback.title,
    description: body.description ?? fallback.description ?? "",
    start: toMysqlDateTime(body.start || fallback.start),
    end: toMysqlDateTime(body.end || fallback.end),
    color: body.color || fallback.color || DEFAULT_EVENT_COLOR,
    authorId: fallback.author_id || req.session.userId,
    updaterId: req.session.userId,
    authority: authorityLabel(
      body.authority || fallback.authority || req.session.authority || 2,
    ),
    isMultiple: Boolean(
      body.isMultiple ?? body.ismultiple ?? fallback.ismultiple,
    ),
    isRecruiting: Boolean(body.isRecruiting ?? fallback.isRecruiting),
    recruitStart: toMysqlDateTime(
      body.recruitStart || fallback.recruit_start || null,
    ),
    recruitEnd: toMysqlDateTime(
      body.recruitEnd || fallback.recruit_end || null,
    ),
  };
}

async function getVisibleEvents(authority) {
  const result = await query(
    `SELECT e.*, u.name AS author_name
       FROM events e
       LEFT JOIN users u ON u.id = e.author_id
      ORDER BY e.start DESC`,
  );
  const rank = authorityRank(authority);
  return result.filter((event) => authorityRank(event.authority) <= rank);
}

async function replaceEventParticipants(connection, eventId, participantIds) {
  if (!Array.isArray(participantIds)) return;
  const storage = await Event.getParticipantStorage();
  await connection.execute(
    "DELETE FROM event_participants WHERE event_id = ?",
    [eventId],
  );
  for (const rawId of participantIds) {
    const found = rows(
      await connection.execute(
        `SELECT m.student_id, m.user_id
           FROM members m
          WHERE m.user_id = ? OR m.student_id = ?
          LIMIT 1`,
        [Number(rawId) || null, String(rawId)],
      ),
    );
    const participantId =
      storage.column === "member_id"
        ? found[0]?.student_id
        : found[0]?.user_id;
    if (!participantId) continue;
    await connection.execute(
      `INSERT IGNORE INTO event_participants (event_id, ${storage.column}) VALUES (?, ?)`,
      [eventId, participantId],
    );
  }
}

async function settlementRows(status) {
  const params = [];
  let where = "";
  if (status) {
    where = "WHERE s.status = ?";
    params.push(status);
  }
  return query(
    `SELECT s.*,
            COUNT(sp.id) AS participant_count,
            SUM(CASE WHEN sp.status = 'paid' THEN 1 ELSE 0 END) AS paid_count
       FROM settlements s
       LEFT JOIN settlementparticipants sp ON sp.settlement_id = s.id
       ${where}
      GROUP BY s.id
      ORDER BY s.created_at DESC`,
    params,
  );
}

router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    // 2026-07-23: Keep the dashboard usable and identify the failing section when event loading fails.
    let events = [];
    let notices = [];
    const issues = [];
    try {
      events = (await getVisibleEvents(req.session.authority)).map(mapEvent);
    } catch (error) {
      console.error("Dashboard event query failed:", error);
      issues.push({
        scope: "events",
        code: "EVENTS_UNAVAILABLE",
        message: "일정 데이터를 불러오지 못했습니다.",
      });
    }
    // 2026-07-23: Show only notices visible to the current authority and isolate notice failures from events.
    try {
      notices = await Board.listNotices(
        sessionAuthorityRank(req.session?.authority),
        4,
      );
    } catch (error) {
      console.error("Dashboard notice query failed:", error);
      issues.push({
        scope: "notices",
        code: "NOTICES_UNAVAILABLE",
        message: "공지사항 데이터를 불러오지 못했습니다.",
      });
    }
    ok(res, {
      calendarEvents: events,
      // 2026-07-23: Keep author_id=0 holidays out of the dashboard's My Events section.
      myEvents: events.filter(
        (event) => Number(event.authorId) !== 0 && !event.isRecruiting,
      ),
      recruitingEvents: events.filter((event) => event.isRecruitingOpen),
      notices: notices.map((notice) => ({
        id: Number(notice.id),
        title: notice.title,
        authorName: notice.author_name,
        minimumAuthority: notice.minimum_authority,
        category: notice.minimum_authority,
        pinned: Boolean(notice.is_pinned),
        createdAt: toIso(notice.created_at),
        updatedAt: toIso(notice.updated_at),
      })),
      issues,
    });
  }),
);

router.get(
  "/user/me",
  asyncHandler(async (req, res) => {
    if (!req.session?.userId) {
      return fail(res, 401, "UNAUTHORIZED", "Login required.");
    }
    const user = await getCurrentUser(req.session.userId);
    // 2026-07-23: A session pointing to a deleted/missing user is invalid and must not remain cached by React.
    if (!user) {
      return req.session.destroy(() =>
        fail(res, 401, "INVALID_SESSION", "Session is no longer valid."),
      );
    }
    ok(res, {
      user: mapUser(user, req.session.authority),
      cacheTtlSeconds: 1800,
    });
  }),
);

router.delete(
  "/user/me",
  asyncHandler(async (req, res) => {
    if (!req.session?.userId) {
      return fail(res, 401, "UNAUTHORIZED", "Login required.");
    }
    await db.execute("UPDATE members SET user_id = NULL WHERE user_id = ?", [
      req.session.userId,
    ]);
    await db.execute("DELETE FROM users WHERE id = ?", [req.session.userId]);
    req.session.destroy(() => {});
    ok(res, { message: "Withdrawal completed." });
  }),
);

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => ok(res, { message: "Logged out." }));
});

router.get("/auth/member-confirm", (req, res) => {
  ok(res, { codeExpiresAt: null, confirmed: Boolean(req.session?.userId) });
});

router.post(
  "/auth/member-confirm",
  asyncHandler(async (req, res) => {
    if (!req.body.studentId) {
      return fail(res, 400, "INVALID_REQUEST", "studentId is required.");
    }
    const found = await query(
      "SELECT student_id FROM members WHERE student_id = ?",
      [req.body.studentId],
    );
    ok(res, {
      confirmed: found.length > 0,
      message: found.length > 0 ? "Member confirmed." : "Member not found.",
    });
  }),
);

router.post("/auth/member-confirm/code", (req, res) => {
  ok(res, {
    codeExpiresAt: null,
    message: "Confirmation code issuing remains in the legacy auth flow.",
  });
});

router.get(
  "/members",
  asyncHandler(async (req, res) => {
    const result = await query("SELECT * FROM members ORDER BY name ASC");
    ok(res, { members: result.map(mapMember) });
  }),
);

router.post(
  "/members",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const payload = memberPayload(req.body);
    if (!payload.studentId || !payload.name) {
      return fail(
        res,
        400,
        "INVALID_REQUEST",
        "studentId and name are required.",
      );
    }
    await db.execute(
      `INSERT INTO members
       (student_id, name, major, phone, gender, generation, authority)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         major = VALUES(major),
         phone = VALUES(phone),
         gender = VALUES(gender),
         generation = VALUES(generation),
         authority = VALUES(authority)`,
      [
        payload.studentId,
        payload.name,
        payload.major,
        payload.phone,
        payload.gender,
        payload.generation,
        payload.authority,
      ],
    );
    created(res, { id: payload.studentId, message: "Member saved." });
  }),
);

router.put(
  "/members/:id",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const existing = (
      await query("SELECT * FROM members WHERE student_id = ?", [req.params.id])
    )[0];
    if (!existing) return fail(res, 404, "NOT_FOUND", "Member not found.");
    const payload = memberPayload(req.body, existing);
    if (!payload.studentId || !payload.name) {
      return fail(
        res,
        400,
        "INVALID_REQUEST",
        "studentId and name are required.",
      );
    }
    // 2026-07-22: Allow every visible member field, including the student ID, to be edited.
    await db.execute(
      `UPDATE members
          SET student_id = ?, name = ?, major = ?, phone = ?, gender = ?, generation = ?, authority = ?
        WHERE student_id = ?`,
      [
        payload.studentId,
        payload.name,
        payload.major,
        payload.phone,
        payload.gender,
        payload.generation,
        payload.authority,
        req.params.id,
      ],
    );
    ok(res, { id: payload.studentId, message: "Member updated." });
  }),
);

router.delete(
  "/members/:id",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    await db.execute("DELETE FROM members WHERE student_id = ?", [
      req.params.id,
    ]);
    ok(res, { message: "Member deleted." });
  }),
);

router.get(
  "/events",
  asyncHandler(async (req, res) => {
    // 2026-07-23: Holidays use author_id=0 and are excluded from React's all/my event lists.
    const events = (await getVisibleEvents(req.session.authority))
      .filter((event) => Number(event.author_id) !== 0)
      .map(mapEvent);
    ok(res, {
      myEvents: events.filter((event) => !event.isRecruiting),
      recruitingEvents: events.filter((event) => event.isRecruitingOpen),
      events,
    });
  }),
);

router.get(
  "/events/my",
  asyncHandler(async (req, res) => {
    const storage = await Event.getParticipantStorage();
    const result = await query(
      `SELECT e.*, u.name AS author_name
         FROM event_participants ep
         JOIN events e ON e.id = ep.event_id
         LEFT JOIN users u ON u.id = e.author_id
         JOIN members participant ON participant.${storage.memberColumn} = ep.${storage.column}
        WHERE participant.user_id = ? AND e.author_id != 0
        ORDER BY e.start ASC`,
      [req.session.userId],
    );
    ok(res, { events: result.map(mapEvent) });
  }),
);

router.post(
  "/events",
  asyncHandler(async (req, res) => {
    const payload = eventPayload(req.body, req);
    if (!payload.title || !payload.start || !payload.end) {
      return fail(
        res,
        400,
        "INVALID_REQUEST",
        "title, start, and end are required.",
      );
    }
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        `INSERT INTO events
         (title, description, start, end, color, author_id, updater_id, authority,
          ismultiple, isRecruiting, recruit_start, recruit_end)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.title,
          payload.description,
          payload.start,
          payload.end,
          payload.color,
          payload.authorId,
          payload.updaterId,
          payload.authority,
          payload.isMultiple,
          payload.isRecruiting,
          payload.recruitStart,
          payload.recruitEnd,
        ],
      );
      await replaceEventParticipants(
        connection,
        result.insertId,
        req.body.participantIds,
      );
      await connection.commit();
      created(res, { id: result.insertId, path: `/event/${result.insertId}` });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

router.get(
  "/events/:id",
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT e.*, u.name AS author_name
         FROM events e
         LEFT JOIN users u ON u.id = e.author_id
        WHERE e.id = ?`,
      [req.params.id],
    );
    if (!result[0]) return fail(res, 404, "NOT_FOUND", "Event not found.");
    const event = mapEvent(result[0]);
    event.canEdit =
      Number(result[0].author_id) === Number(req.session.userId) ||
      authorityRank(req.session.authority) >= EVENT_MANAGER_AUTHORITY;
    event.canDelete = event.canEdit;
    const participantStorage = await Event.getParticipantStorage();
    // 2026-07-23: Read participants from either the documented or deployed foreign-key layout.
    event.participants = (
      await query(
        `SELECT ep.id, m.user_id, m.student_id, m.name, m.authority AS role
           FROM event_participants ep
           LEFT JOIN members m ON m.${participantStorage.memberColumn} = ep.${participantStorage.column}
          WHERE ep.event_id = ?
          ORDER BY m.name ASC`,
        [req.params.id],
      )
    ).map((participant) => ({
      id: participant.id,
      userId: participant.user_id,
      studentId: participant.student_id,
      name: participant.name,
      role: participant.role,
      status: "joined",
    }));
    const currentMember = req.session?.userId
      ? await getCurrentUser(req.session.userId)
      : null;
    event.isParticipating = Boolean(
      currentMember?.student_id &&
        event.participants.some(
          (participant) =>
            String(participant.studentId) === String(currentMember.student_id),
        ),
    );
    event.canParticipate = Boolean(
      currentMember?.student_id && event.isRecruitingOpen,
    );
    event.settlement = null;
    ok(res, { event });
  }),
);

router.put(
  "/events/:id",
  asyncHandler(async (req, res) => {
    const existing = (
      await query("SELECT * FROM events WHERE id = ?", [req.params.id])
    )[0];
    if (!existing) return fail(res, 404, "NOT_FOUND", "Event not found.");
    if (
      Number(existing.author_id) !== Number(req.session.userId) &&
      authorityRank(req.session.authority) < EVENT_MANAGER_AUTHORITY
    ) {
      return fail(res, 403, "FORBIDDEN", "Authority is required.");
    }
    const payload = eventPayload(req.body, req, existing);
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE events
            SET title = ?, description = ?, start = ?, end = ?, color = ?,
                updater_id = ?, authority = ?, ismultiple = ?, isRecruiting = ?,
                recruit_start = ?, recruit_end = ?
          WHERE id = ?`,
        [
          payload.title,
          payload.description,
          payload.start,
          payload.end,
          payload.color,
          payload.updaterId,
          payload.authority,
          payload.isMultiple,
          payload.isRecruiting,
          payload.recruitStart,
          payload.recruitEnd,
          req.params.id,
        ],
      );
      if (Array.isArray(req.body.participantIds)) {
        await replaceEventParticipants(
          connection,
          req.params.id,
          req.body.participantIds,
        );
      }
      await connection.commit();
      ok(res, { id: Number(req.params.id), message: "Event updated." });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

router.delete(
  "/events/:id",
  asyncHandler(async (req, res) => {
    const existing = (
      await query("SELECT * FROM events WHERE id = ?", [req.params.id])
    )[0];
    if (!existing) return fail(res, 404, "NOT_FOUND", "Event not found.");
    if (
      Number(existing.author_id) !== Number(req.session.userId) &&
      authorityRank(req.session.authority) < EVENT_MANAGER_AUTHORITY
    ) {
      return fail(res, 403, "FORBIDDEN", "Authority is required.");
    }
    await db.execute("DELETE FROM events WHERE id = ?", [req.params.id]);
    ok(res, { message: "Event deleted." });
  }),
);

router.post(
  "/events/:id/participants/me",
  asyncHandler(async (req, res) => {
    const event = (
      await query("SELECT * FROM events WHERE id = ?", [req.params.id])
    )[0];
    if (!event) return fail(res, 404, "NOT_FOUND", "Event not found.");
    if (authorityRank(event.authority) > authorityRank(req.session.authority)) {
      return fail(res, 403, "FORBIDDEN", "This event is not accessible.");
    }
    if (!isEventRecruitmentOpen(event)) {
      return fail(res, 409, "RECRUITMENT_CLOSED", "참가 모집 기간이 아닙니다.");
    }
    const member = await getCurrentUser(req.session.userId);
    if (!member?.student_id) {
      return fail(
        res,
        422,
        "INVALID_MEMBER",
        "Current user is not linked to a member.",
      );
    }
    const participantStorage = await Event.getParticipantStorage();
    const participantId =
      participantStorage.column === "member_id"
        ? member.student_id
        : member.user_id;
    await db.execute(
      `INSERT IGNORE INTO event_participants (event_id, ${participantStorage.column}) VALUES (?, ?)`,
      [req.params.id, participantId],
    );
    ok(res, { status: "joined" });
  }),
);

router.delete(
  "/events/:id/participants/me",
  asyncHandler(async (req, res) => {
    const event = (
      await query("SELECT * FROM events WHERE id = ?", [req.params.id])
    )[0];
    if (!event) return fail(res, 404, "NOT_FOUND", "Event not found.");
    if (authorityRank(event.authority) > authorityRank(req.session.authority)) {
      return fail(res, 403, "FORBIDDEN", "This event is not accessible.");
    }
    if (!isEventRecruitmentOpen(event)) {
      return fail(res, 409, "RECRUITMENT_CLOSED", "참가 모집 기간이 아닙니다.");
    }
    const member = await getCurrentUser(req.session.userId);
    if (!member?.student_id) {
      return fail(
        res,
        422,
        "INVALID_MEMBER",
        "Current user is not linked to a member.",
      );
    }
    const participantStorage = await Event.getParticipantStorage();
    const participantId =
      participantStorage.column === "member_id"
        ? member.student_id
        : member.user_id;
    await db.execute(
      `DELETE FROM event_participants WHERE event_id = ? AND ${participantStorage.column} = ?`,
      [req.params.id, participantId],
    );
    ok(res, { status: "cancelled" });
  }),
);

router.post("/admin/holidays/import", requireAuthority(4), (req, res) => {
  ok(res, {
    importedCount: 0,
    skippedCount: 0,
    message: "Holiday import is not wired to the external API yet.",
  });
});

router.get(
  "/drive/templates",
  asyncHandler(async (req, res) => {
    const result = await query(
      "SELECT id, title, form_url FROM form_templates ORDER BY created_at DESC",
    );
    ok(res, {
      templates: result.map((template) => ({
        id: template.id,
        title: template.title,
        formUrl: template.form_url,
      })),
    });
  }),
);

router.post(
  "/drive/templates",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const { title, formUrl } = req.body;
    if (!title || !formUrl) {
      return fail(
        res,
        400,
        "INVALID_REQUEST",
        "title and formUrl are required.",
      );
    }
    const [result] = await db.execute(
      "INSERT INTO form_templates (title, form_url) VALUES (?, ?)",
      [title, formUrl],
    );
    created(res, { template: { id: result.insertId, title, formUrl } });
  }),
);

router.delete(
  "/drive/templates/:id",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const templateId = Number(req.params.id);
    if (!Number.isInteger(templateId) || templateId <= 0) {
      return fail(
        res,
        400,
        "INVALID_TEMPLATE_ID",
        "삭제할 템플릿 정보가 올바르지 않습니다.",
      );
    }

    // 2026-07-23: form_templates의 숫자 식별자로 선택한 템플릿 등록 정보만 삭제합니다.
    const [result] = await db.execute(
      "DELETE FROM form_templates WHERE id = ?",
      [templateId],
    );
    if (!result.affectedRows) {
      return fail(
        res,
        404,
        "TEMPLATE_NOT_FOUND",
        "삭제할 템플릿을 찾지 못했습니다.",
      );
    }
    return ok(res, { message: "폼 템플릿을 삭제했습니다." });
  }),
);

router.post(
  "/drive/forms",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const formTitle = String(req.body.title || "").trim();
    const userEmail = String(req.body.userEmail || "").trim();
    if (!req.body.templateId || !formTitle || !userEmail) {
      return fail(
        res,
        400,
        "INVALID_REQUEST",
        "템플릿, 생성할 폼 제목, 편집자 이메일을 모두 입력해 주세요.",
      );
    }
    const result = await query(
      "SELECT title, form_url FROM form_templates WHERE id = ? LIMIT 1",
      [req.body.templateId],
    );
    if (!result[0]) return fail(res, 404, "NOT_FOUND", "Template not found.");

    const templateFormId = extractFormIdFromURL(result[0].form_url);
    if (!templateFormId) {
      return fail(
        res,
        400,
        "INVALID_TEMPLATE_URL",
        "템플릿 Google Form URL이 올바르지 않습니다.",
      );
    }

    try {
      // 2026-07-23: React에서도 기존 EJS와 동일하게 템플릿을 실제 복사하고 사용자가 입력한 제목을 적용한다.
      const { drive, forms } = getOAuthClients();
      const copyResponse = await drive.files.copy({
        fileId: templateFormId,
        requestBody: {
          name: formTitle,
          parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
        },
      });
      const newFormId = copyResponse.data.id;
      if (!newFormId) {
        return fail(
          res,
          502,
          "GOOGLE_COPY_FAILED",
          "Google Form 복사 결과에서 폼 ID를 받지 못했습니다.",
        );
      }

      await forms.forms.batchUpdate({
        formId: newFormId,
        requestBody: {
          requests: [
            {
              updateFormInfo: {
                info: { title: formTitle },
                updateMask: "title",
              },
            },
          ],
        },
      });
      await drive.permissions.create({
        fileId: newFormId,
        requestBody: {
          role: "writer",
          type: "user",
          emailAddress: userEmail,
        },
      });
      await drive.permissions.create({
        fileId: newFormId,
        requestBody: {
          role: "writer",
          type: "user",
          emailAddress: "ucms-google-api@ucms-466410.iam.gserviceaccount.com",
        },
        sendNotificationEmail: false,
      });

      const formUrl = `https://docs.google.com/forms/d/${newFormId}/edit`;
      return created(res, {
        formUrl,
        title: formTitle,
        message: "폼을 생성했습니다.",
      });
    } catch (error) {
      // 2026-07-23: invalid_grant 원문과 토큰 설정을 로그에 노출하지 않고 재연결 방법을 안내합니다.
      if (isOAuthReconnectRequired(error)) {
        return fail(
          res,
          409,
          "GOOGLE_OAUTH_RECONNECT_REQUIRED",
          "구글 계정이 만료됐습니다. 관리자에게 문의해주세요.",
        );
      }
      throw error;
    }
  }),
);

router.get(
  "/drive/oauth/status",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const status = await getOAuthConnectionStatus();
    let authorizationUrl = null;

    if (!status.connected) {
      const state = crypto.randomBytes(24).toString("hex");
      req.session.googleOAuthState = state;
      authorizationUrl = getOAuthAuthorizationUrl(state);
    }

    // 2026-07-23: Google 토큰 자체를 전달하지 않고 연결 여부와 재승인 URL만 제공합니다.
    return ok(res, {
      connected: status.connected,
      reason: status.reason,
      authorizationUrl,
    });
  }),
);

router.get(
  "/recruit/forms",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    // 2026-07-23: The React interview wizard needs the same form metadata as the legacy selector.
    const forms = await query(
      `SELECT id, title, form_type, created_at
         FROM formlist
        ORDER BY created_at DESC`,
    );
    ok(res, {
      forms: forms.map((form) => ({
        id: form.id,
        title: form.title,
        formType: form.form_type,
        createdAt: toIso(form.created_at),
      })),
    });
  }),
);

router.get(
  "/recruit/forms/:id/interview-dates",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    // 2026-07-23: Derive interview dates from Google Form questions as the EJS flow did.
    const questions = await query(
      `SELECT question_id, question
         FROM form_questions
        WHERE form_id = ?
        ORDER BY idx ASC`,
      [req.params.id],
    );
    const dates = [];
    const datePattern = /(\d{1,2})\/(\d{1,2})(\([월화수목금토일]\))/g;
    for (const question of questions) {
      if (
        !String(question.question || "")
          .replace(/\s+/g, "")
          .includes("면접가능시간")
      ) {
        continue;
      }
      for (const match of String(question.question).matchAll(datePattern)) {
        dates.push({
          date: `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}${match[3]}`,
          questionId: question.question_id,
        });
      }
    }
    ok(res, { dates });
  }),
);

router.get(
  "/recruit/responses",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT rm.*, fl.title AS form_title
         FROM recruiting_members rm
         LEFT JOIN formlist fl ON fl.id = rm.form_id
        ORDER BY rm.synced_at DESC, rm.id DESC`,
    );
    ok(res, { responses: result.map(mapRecruitResponse) });
  }),
);

router.post("/recruit/sync", requireAuthority(4), (req, res) => {
  ok(res, {
    syncedCount: 0,
    message: "Recruit sync remains in the legacy Google Forms flow.",
  });
});

router.patch(
  "/recruit/responses/:id/rating",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    if (!req.body.rating) {
      return fail(res, 400, "INVALID_REQUEST", "rating is required.");
    }
    await db.execute("UPDATE recruiting_members SET rating = ? WHERE id = ?", [
      req.body.rating,
      req.params.id,
    ]);
    ok(res, { id: Number(req.params.id), message: "Rating updated." });
  }),
);

router.get(
  "/recruit/responses/:id",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const applicants = await query(
      `SELECT rm.*, fl.title AS form_title
         FROM recruiting_members rm
         LEFT JOIN formlist fl ON fl.id = rm.form_id
        WHERE rm.id = ?`,
      [req.params.id],
    );
    const applicant = applicants[0];
    if (!applicant) {
      return fail(res, 404, "NOT_FOUND", "Recruit response not found.");
    }
    const responseRows = await query(
      `SELECT fq.idx AS question_idx, fq.question, fr.answer
         FROM form_responses fr
         LEFT JOIN form_questions fq
           ON fq.form_id = fr.form_id AND fq.question_id = fr.question_id
        WHERE fr.form_id = ? AND fr.response_id = ?
        ORDER BY fq.idx ASC`,
      [applicant.form_id, applicant.response_id],
    );
    ok(res, {
      applicant: {
        responseId: applicant.id,
        // 2026-07-23: React ShareDB client needs the legacy document key and form key, not only the local row ID.
        documentId: `response-${applicant.response_id}`,
        formId: String(applicant.form_id),
        name: applicant.name,
        studentId: applicant.student_id,
        major: applicant.major,
        phone: applicant.phone,
        email: null,
        rating: applicant.rating,
        formTitle: applicant.form_title,
      },
      responses: responseRows.map((response) => ({
        questionId: response.question_idx,
        question: response.question,
        answer: response.answer,
      })),
    });
  }),
);

router.get(
  "/recruit/responses/:id/shared-document",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const applicants = await query(
      "SELECT response_id FROM recruiting_members WHERE id = ?",
      [req.params.id],
    );
    if (!applicants[0]) {
      return fail(res, 404, "NOT_FOUND", "Recruit response not found.");
    }
    const responseId = `response-${applicants[0].response_id}`;
    const notes = await query(
      "SELECT * FROM evaluation_notes WHERE response_id = ?",
      [responseId],
    );
    const note = notes[0] || {
      content: "",
      version: 1,
      updated_at: null,
    };
    ok(res, {
      document: {
        responseId: Number(req.params.id),
        content: note.content || "",
        version: note.version || 1,
        updatedAt: toIso(note.updated_at),
        updatedBy: null,
      },
    });
  }),
);

router.put(
  "/recruit/responses/:id/shared-document",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const applicants = await query(
      "SELECT response_id, form_id FROM recruiting_members WHERE id = ?",
      [req.params.id],
    );
    if (!applicants[0]) {
      return fail(res, 404, "NOT_FOUND", "Recruit response not found.");
    }
    const responseId = `response-${applicants[0].response_id}`;
    const notes = await query(
      "SELECT version FROM evaluation_notes WHERE response_id = ?",
      [responseId],
    );
    if (notes[0] && Number(req.body.version) !== Number(notes[0].version)) {
      return fail(res, 409, "VERSION_CONFLICT", "Document version conflict.");
    }
    const version = notes[0] ? Number(notes[0].version) + 1 : 1;
    await db.execute(
      `INSERT INTO evaluation_notes (response_id, form_id, content, version)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE content = VALUES(content), version = VALUES(version)`,
      [responseId, applicants[0].form_id, req.body.content || "", version],
    );
    ok(res, {
      document: {
        responseId: Number(req.params.id),
        content: req.body.content || "",
        version,
        updatedAt: toIso(new Date()),
        updatedBy: null,
      },
    });
  }),
);

router.get(
  "/interview/plans",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT ip.*, fl.title AS form_title, u.name AS owner
         FROM interview_plans ip
         LEFT JOIN formlist fl ON fl.id = ip.form_id
         LEFT JOIN users u ON u.id = ip.created_by
        ORDER BY ip.updated_at DESC`,
    );
    ok(res, {
      plans: result.map((plan) => ({
        id: plan.id,
        title: plan.title,
        formId: plan.form_id,
        formTitle: plan.form_title,
        status: plan.status,
        owner: plan.owner,
        updatedAt: toIso(plan.updated_at),
      })),
    });
  }),
);

router.get(
  "/interview/schedules/active",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    // 2026-07-23: Expose every confirmed plan with its saved schedule for the React personnel menu.
    const plans = await query(
      `SELECT ip.*, fl.title AS form_title
         FROM interview_plans ip
         LEFT JOIN formlist fl ON fl.id = ip.form_id
        WHERE ip.status = 'active'
        ORDER BY ip.updated_at DESC`,
    );
    const activeSchedules = await Promise.all(
      plans.map(async (plan) => {
        const scheduleRows = await query(
          `SELECT s.*,
                  interviewer.name AS interviewer_name,
                  interviewee.id AS applicant_id,
                  interviewee.name AS applicant_name,
                  interviewee.rating,
                  interviewee.response_id
             FROM interview_schedules s
             LEFT JOIN members interviewer
               ON interviewer.student_id = s.interviewer_id
             LEFT JOIN recruiting_members interviewee
               ON interviewee.student_id = s.interviewee_id
              AND interviewee.form_id = ?
            WHERE s.plan_id = ?
            ORDER BY s.interview_date, s.time_slot, s.interviewee_id`,
          [plan.form_id, plan.id],
        );
        return {
          plan: {
            id: plan.id,
            title: plan.title,
            formTitle: plan.form_title,
            status: plan.status,
            panelSize: plan.panel_size,
            updatedAt: toIso(plan.updated_at),
          },
          schedule: groupInterviewScheduleRows(scheduleRows),
        };
      }),
    );
    ok(res, { activeSchedules });
  }),
);

router.post(
  "/interview/plans",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    if (!req.body.title || !req.body.formId) {
      return fail(
        res,
        400,
        "INVALID_REQUEST",
        "title and formId are required.",
      );
    }
    // 2026-07-23: Persist every wizard step atomically so plan details match the schema.
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const interviewerIds = Array.isArray(req.body.interviewerIds)
        ? req.body.interviewerIds.map(String)
        : [];
      const [result] = await connection.execute(
        `INSERT INTO interview_plans
         (form_id, title, status, created_by, updated_by, panel_size)
         VALUES (?, ?, 'draft', ?, ?, ?)`,
        [
          req.body.formId,
          req.body.title,
          req.session.userId,
          req.session.userId,
          Math.max(1, Number(req.body.panelSize || 2)),
        ],
      );
      const planId = result.insertId;
      for (const item of req.body.interviewDates || []) {
        await connection.execute(
          `INSERT INTO interview_dates (plan_id, interview_date, question_id)
           VALUES (?, ?, ?)`,
          [planId, item.date, item.questionId],
        );
      }
      for (const interviewerId of interviewerIds) {
        await connection.execute(
          `INSERT INTO interview_interviewers (plan_id, interviewer_id)
           VALUES (?, ?)`,
          [planId, interviewerId],
        );
      }
      for (const availability of req.body.availability || []) {
        await connection.execute(
          `INSERT INTO interviewer_time_slots
           (plan_id, interviewer_id, interview_date, time_slot, is_available)
           VALUES (?, ?, ?, ?, true)`,
          [
            planId,
            String(availability.interviewerId),
            availability.date,
            availability.timeSlot,
          ],
        );
      }
      await connection.commit();
      created(res, { id: planId, path: `/recruit/interview/plans/${planId}` });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

router.get(
  "/interview/interviewers",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    // 2026-07-23: Limit interviewer candidates to executive members from the Members schema.
    const interviewers = await query(
      `SELECT m.student_id, m.name, m.authority, u.thumbnail_image
         FROM members m
         LEFT JOIN users u ON u.id = m.user_id
        WHERE m.authority IN ('임원진', '부회장', '회장', 'admin')
        ORDER BY FIELD(m.authority, 'admin', '회장', '부회장', '임원진'), m.name`,
    );
    ok(res, {
      interviewers: interviewers.map((member) => ({
        id: member.student_id,
        name: member.name,
        authority: member.authority,
        thumbnailImage: member.thumbnail_image || null,
      })),
    });
  }),
);

router.get(
  "/interview/plans/:id",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT ip.*, fl.title AS form_title, u.name AS owner
         FROM interview_plans ip
         LEFT JOIN formlist fl ON fl.id = ip.form_id
         LEFT JOIN users u ON u.id = ip.created_by
        WHERE ip.id = ?`,
      [req.params.id],
    );
    const plan = result[0];
    if (!plan) return fail(res, 404, "NOT_FOUND", "Plan not found.");
    // 2026-07-23: Return the complete plan graph represented by the interview schema.
    const interviewDates = await query(
      `SELECT id, interview_date, question_id
         FROM interview_dates
        WHERE plan_id = ?
        ORDER BY id`,
      [req.params.id],
    );
    const interviewers = await query(
      `SELECT ii.id, ii.interviewer_id, m.name, m.authority
         FROM interview_interviewers ii
         LEFT JOIN members m ON m.student_id = ii.interviewer_id
        WHERE ii.plan_id = ?
        ORDER BY m.name`,
      [req.params.id],
    );
    const availability = await query(
      `SELECT id, interviewer_id, interview_date, time_slot
         FROM interviewer_time_slots
        WHERE plan_id = ? AND is_available = true
        ORDER BY interviewer_id, interview_date, time_slot`,
      [req.params.id],
    );
    const applicants = await query(
      `SELECT id, student_id, name, rating
         FROM recruiting_members
        WHERE form_id = ? AND rating = '1차합격'
        ORDER BY name`,
      [plan.form_id],
    );
    const scheduleRows = await query(
      `SELECT s.*,
              interviewer.name AS interviewer_name,
              interviewee.name AS applicant_name
         FROM interview_schedules s
         LEFT JOIN members interviewer ON interviewer.student_id = s.interviewer_id
         LEFT JOIN recruiting_members interviewee
           ON interviewee.student_id = s.interviewee_id
          AND interviewee.form_id = ?
        WHERE s.plan_id = ?
        ORDER BY s.interview_date, s.time_slot`,
      [plan.form_id, req.params.id],
    );
    ok(res, {
      plan: {
        id: plan.id,
        title: plan.title,
        formId: plan.form_id,
        formTitle: plan.form_title,
        status: plan.status,
        owner: plan.owner,
        panelSize: plan.panel_size,
        createdAt: toIso(plan.created_at),
        updatedAt: toIso(plan.updated_at),
      },
      interviewDates: interviewDates.map((item) => ({
        id: item.id,
        date: item.interview_date,
        questionId: item.question_id,
      })),
      interviewers: interviewers.map((item) => ({
        id: item.interviewer_id,
        name: item.name || item.interviewer_id,
        authority: item.authority,
      })),
      availability: availability.map((item) => ({
        id: item.id,
        interviewerId: item.interviewer_id,
        date: item.interview_date,
        timeSlot: item.time_slot,
      })),
      applicants: applicants.map((item) => ({
        id: item.id,
        studentId: item.student_id,
        name: item.name,
        rating: item.rating,
      })),
      schedule: groupInterviewScheduleRows(scheduleRows),
    });
  }),
);

router.post(
  "/interview/plans/:id/status",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    // 2026-07-23: Expose the draft/active/completed transitions used by the legacy detail page.
    const allowedStatuses = ["draft", "active", "completed", "cancelled"];
    if (!allowedStatuses.includes(req.body.status)) {
      return fail(
        res,
        400,
        "INVALID_REQUEST",
        "Invalid interview plan status.",
      );
    }
    if (req.body.status === "active") {
      const schedules = await query(
        "SELECT id FROM interview_schedules WHERE plan_id = ? LIMIT 1",
        [req.params.id],
      );
      if (schedules.length === 0) {
        return fail(
          res,
          409,
          "SCHEDULE_REQUIRED",
          "면접 스케줄을 먼저 생성해주세요.",
        );
      }
    }
    await db.execute(
      "UPDATE interview_plans SET status = ?, updated_by = ? WHERE id = ?",
      [req.body.status, req.session.userId, req.params.id],
    );
    ok(res, { id: Number(req.params.id), status: req.body.status });
  }),
);

router.post(
  "/interview/plans/:id/timetable",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    // 2026-07-23: Run the existing OR-Tools scheduler instead of returning the saved row count.
    try {
      const result = await generateInterviewSchedule(
        Number(req.params.id),
        req.body.minInterviewers,
      );
      ok(res, {
        scheduleCount: result.scheduleCount,
        isPerfect: Boolean(result.output.is_perfect),
        extraSlotsCount: Number(result.output.extra_slots_count || 0),
        fairnessGap: Number(result.output.fairness_gap || 0),
        message: `${result.scheduleCount}명의 면접 스케줄을 생성했습니다.`,
      });
    } catch (error) {
      if (error instanceof InterviewSchedulerError) {
        return fail(res, error.status, error.code, error.message);
      }
      throw error;
    }
  }),
);

router.delete(
  "/interview/plans/:id",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    await db.execute("DELETE FROM interview_plans WHERE id = ?", [
      req.params.id,
    ]);
    ok(res, { message: "Interview plan deleted." });
  }),
);

router.get(
  "/finance/settlements",
  asyncHandler(async (req, res) => {
    // 2026-07-23: Include participant cards in the list response to match the legacy finance overview.
    async function withParticipants(status) {
      return Promise.all(
        (await settlementRows(status)).map(async (row) => ({
          ...mapSettlement(row),
          participants: (
            await query(
              `SELECT sp.id, sp.member_id, sp.amount, sp.status, m.name
                 FROM settlementparticipants sp
                 LEFT JOIN members m ON m.student_id = sp.member_id
                WHERE sp.settlement_id = ?
                ORDER BY m.name`,
              [row.id],
            )
          ).map((participant) => ({
            id: participant.id,
            name: participant.name || participant.member_id,
            studentId: participant.member_id,
            amount: participant.amount,
            paid: participant.status === "paid",
          })),
        })),
      );
    }
    ok(res, {
      activeSettlements: await withParticipants("active"),
      completedSettlements: await withParticipants("completed"),
    });
  }),
);

router.post(
  "/finance/settlements",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const user = await getCurrentUser(req.session.userId);
    if (!user?.student_id) {
      return fail(
        res,
        422,
        "INVALID_MEMBER",
        "Current user is not linked to a member.",
      );
    }
    const title = String(req.body.title || "").trim();
    const amount = Number(req.body.amount);
    const hasDetailedParticipants = Array.isArray(req.body.participants);
    const detailedParticipants = hasDetailedParticipants
      ? req.body.participants.map((participant) => ({
          memberId: String(participant.memberId || "").trim(),
          amount: Number(participant.amount),
        }))
      : [];
    const participantIds = Array.from(
      new Set(
        (Array.isArray(req.body.participantIds)
          ? req.body.participantIds
          : []
        ).map(String),
      ),
    );
    if (
      !title ||
      !req.body.dueDate ||
      !Number.isFinite(amount) ||
      !Number.isInteger(amount) ||
      amount < 0 ||
      detailedParticipants.some(
        (participant) =>
          !participant.memberId ||
          !Number.isInteger(participant.amount) ||
          participant.amount < 0,
      ) ||
      (hasDetailedParticipants &&
        detailedParticipants.length > 0 &&
        detailedParticipants.reduce(
          (sum, participant) => sum + participant.amount,
          0,
        ) !== amount)
    ) {
      return fail(
        res,
        400,
        "INVALID_REQUEST",
        "정산명, 금액, 마감일을 확인해 주세요.",
      );
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      // 2026-07-23: 독립 생성 화면의 기본 정보와 참여자를 하나의 트랜잭션으로 저장한다.
      const [result] = await connection.execute(
        `INSERT INTO settlements (name, total_amount, deadline, is_dutch_pay, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [
          title,
          amount,
          req.body.dueDate,
          Boolean(req.body.dutchPay),
          user.student_id,
        ],
      );
      const participantsToInsert = hasDetailedParticipants
        ? detailedParticipants
        : participantIds.map((memberId) => ({
            memberId,
            amount:
              req.body.dutchPay && participantIds.length
                ? Math.floor(amount / participantIds.length)
                : 0,
          }));
      if (participantsToInsert.length) {
        await connection.query(
          `INSERT INTO settlementparticipants
           (settlement_id, member_id, amount)
           VALUES ?`,
          [
            participantsToInsert.map((participant) => [
              result.insertId,
              participant.memberId,
              participant.amount,
            ]),
          ],
        );
      }
      await connection.commit();
      created(res, {
        id: result.insertId,
        path: `/finance/${result.insertId}`,
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

router.get(
  "/finance/settlements/:id",
  asyncHandler(async (req, res) => {
    const allSettlements = await settlementRows();
    const settlement = allSettlements.find(
      (item) => Number(item.id) === Number(req.params.id),
    );
    if (!settlement)
      return fail(res, 404, "NOT_FOUND", "Settlement not found.");
    const participants = await query(
      `SELECT sp.*, m.name, m.student_id
         FROM settlementparticipants sp
         LEFT JOIN members m ON m.student_id = sp.member_id
        WHERE sp.settlement_id = ?
        ORDER BY m.name ASC`,
      [req.params.id],
    );
    ok(res, {
      settlement: {
        ...mapSettlement(settlement),
        dutchPay: Boolean(settlement.is_dutch_pay),
        event: null,
        canEdit: authorityRank(req.session.authority) >= 4,
        canDelete: authorityRank(req.session.authority) >= 4,
      },
      participants: participants.map((participant) => ({
        id: participant.id,
        memberId: participant.member_id,
        name: participant.name,
        studentId: participant.student_id,
        amount: participant.amount,
        paid: participant.status === "paid",
        paidAt:
          participant.status === "paid" ? toIso(participant.updated_at) : null,
      })),
    });
  }),
);

router.put(
  "/finance/settlements/:id",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const title = String(req.body.title || "").trim();
    const amount = Number(req.body.amount);
    const participants = Array.isArray(req.body.participants)
      ? req.body.participants
      : [];
    if (
      !title ||
      !req.body.dueDate ||
      !Number.isFinite(amount) ||
      !Number.isInteger(amount) ||
      amount < 0 ||
      participants.some(
        (participant) =>
          !String(participant.memberId || "").trim() ||
          !Number.isInteger(Number(participant.amount)) ||
          Number(participant.amount) < 0,
      ) ||
      participants.length > 0 &&
      participants.reduce(
        (sum, participant) => sum + Number(participant.amount || 0),
        0,
      ) !== amount
    ) {
      return fail(
        res,
        400,
        "INVALID_REQUEST",
        "정산 정보와 참여자별 금액을 확인해 주세요.",
      );
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      // 2026-07-23: 정산 기본 정보와 참여자별 납부 상태를 수정 화면에서 원자적으로 저장한다.
      const [result] = await connection.execute(
        `UPDATE settlements
            SET name = ?, total_amount = ?, deadline = ?, is_dutch_pay = ?
          WHERE id = ?`,
        [
          title,
          amount,
          req.body.dueDate,
          Boolean(req.body.dutchPay),
          req.params.id,
        ],
      );
      if (!result.affectedRows) {
        await connection.rollback();
        return fail(res, 404, "NOT_FOUND", "Settlement not found.");
      }
      // 2026-07-23: 수정 화면의 최종 참여자 목록을 기준으로 추가·삭제·금액·완료 상태를 동기화한다.
      if (participants.length) {
        await connection.query(
          `DELETE FROM settlementparticipants
            WHERE settlement_id = ?
              AND member_id NOT IN (${participants.map(() => "?").join(",")})`,
          [
            req.params.id,
            ...participants.map((participant) =>
              String(participant.memberId),
            ),
          ],
        );
      } else {
        await connection.execute(
          "DELETE FROM settlementparticipants WHERE settlement_id = ?",
          [req.params.id],
        );
      }
      for (const participant of participants) {
        await connection.execute(
          `INSERT INTO settlementparticipants
           (settlement_id, member_id, amount, status)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             amount = VALUES(amount),
             status = VALUES(status)`,
          [
            req.params.id,
            String(participant.memberId),
            Number(participant.amount),
            participant.paid ? "paid" : "pending",
          ],
        );
      }
      await connection.commit();
      ok(res, {
        id: Number(req.params.id),
        message: "Settlement updated.",
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

router.post(
  "/finance/settlements/:id/participants",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const ids = req.body.participantIds || [];
    for (const memberId of ids) {
      await db.execute(
        `INSERT IGNORE INTO settlementparticipants
         (settlement_id, member_id, amount)
         VALUES (?, ?, ?)`,
        [req.params.id, String(memberId), Number(req.body.amount || 0)],
      );
    }
    ok(res, { id: Number(req.params.id), addedCount: ids.length });
  }),
);

router.patch(
  "/finance/settlements/:id/participants/:participantId",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    await db.execute(
      `UPDATE settlementparticipants
          SET amount = COALESCE(?, amount),
              status = COALESCE(?, status)
        WHERE settlement_id = ? AND id = ?`,
      [
        req.body.amount ?? null,
        req.body.paid === undefined ? null : req.body.paid ? "paid" : "pending",
        req.params.id,
        req.params.participantId,
      ],
    );
    ok(res, {
      id: Number(req.params.participantId),
      message: "Participant updated.",
    });
  }),
);

router.post(
  "/finance/settlements/:id/complete",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    await db.execute(
      "UPDATE settlements SET status = 'completed' WHERE id = ?",
      [req.params.id],
    );
    ok(res, {
      status: "completed",
      completedAt: req.body.completedAt || toDate(new Date()),
    });
  }),
);

router.delete(
  "/finance/settlements/:id",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    // 2026-07-23: Settlement deletion mirrors the management action visible in the EJS overview.
    await db.execute("DELETE FROM settlements WHERE id = ?", [req.params.id]);
    ok(res, { id: Number(req.params.id), message: "Settlement deleted." });
  }),
);

router.get(
  "/pos/instances",
  asyncHandler(async (req, res) => {
    ok(res, {
      instances: (await Pos.findAllInstances()).map(mapPosInstance),
      canCreate: authorityRank(req.session.authority) >= 4,
    });
  }),
);

router.post(
  "/pos/instances",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const products = (req.body.products || []).map((product) => ({
      product_name: product.name || product.product_name,
      product_price: Number(product.price ?? product.product_price),
      stock: Number(product.stock ?? 0),
    }));
    const instanceName = String(
      req.body.name || req.body.instance_name || "",
    ).trim();
    if (
      !instanceName ||
      products.length === 0 ||
      products.some(
        (product) =>
          !product.product_name ||
          !Number.isFinite(product.product_price) ||
          product.product_price < 0 ||
          !Number.isInteger(product.stock) ||
          product.stock < 0,
      )
    ) {
      return fail(
        res,
        400,
        "INVALID_REQUEST",
        "인스턴스 이름과 올바른 품목 정보를 입력해 주세요.",
      );
    }
    const id = await Pos.createInstance({
      instance_name: instanceName,
      products,
      salesmans: req.body.salesmans || [],
      created_by: req.session.userId,
    });
    created(res, { id, path: `/pos/instances/${id}` });
  }),
);

router.get(
  "/pos/instances/:id",
  asyncHandler(async (req, res) => {
    const data = await Pos.findInstanceInfoById(req.params.id);
    if (!data.instance)
      return fail(res, 404, "NOT_FOUND", "POS instance not found.");
    ok(res, {
      instance: mapPosInstance(data.instance),
      products: data.products.map(mapPosProduct),
      salesmans: data.salesmans.map((salesman) => ({
        id: salesman.id,
        studentId: salesman.member_id,
        name: salesman.member_name,
      })),
      canManage: authorityRank(req.session.authority) >= 4,
    });
  }),
);

router.patch(
  "/pos/instances/:id/status",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const status = String(req.body.status || "");
    try {
      const result = await Pos.setInstanceStatus(req.params.id, status);
      ok(res, {
        ...result,
        closedAt: status === "closed" ? toIso(new Date()) : null,
      });
    } catch (error) {
      if (error.code === "POS_NOT_FOUND") {
        return fail(res, 404, error.code, error.message);
      }
      if (
        error.code === "POS_CLOSED" ||
        error.code === "INVALID_POS_STATUS"
      ) {
        return fail(res, 409, error.code, error.message);
      }
      throw error;
    }
  }),
);

router.put(
  "/pos/instances/:id",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const products = (req.body.products || []).map((product) => ({
      product_name: product.name || product.product_name,
      product_price: product.price || product.product_price,
      stock: product.stock || 0,
    }));
    await Pos.updateInstance({
      id: Number(req.params.id),
      instance_name: req.body.name || req.body.instance_name,
      products,
      salesmans: req.body.salesmans || [],
    });
    ok(res, { id: Number(req.params.id), message: "POS instance updated." });
  }),
);

router.delete(
  "/pos/instances/:id",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    await db.execute("DELETE FROM pos_instances WHERE id = ?", [req.params.id]);
    ok(res, { message: "POS instance deleted." });
  }),
);

router.post(
  "/pos/instances/:id/open",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    await Pos.setActiveInstance(req.params.id);
    ok(res, { status: "active", openedAt: toIso(new Date()) });
  }),
);

router.post(
  "/pos/purchase",
  asyncHandler(async (req, res) => {
    const items = req.body.items || [];
    const instanceId = Number(req.body.instanceId);
    if (
      !Number.isInteger(instanceId) ||
      !items.length ||
      items.some(
        (item) =>
          !Number.isInteger(Number(item.productId || item.product_id)) ||
          !Number.isInteger(Number(item.quantity)) ||
          Number(item.quantity) <= 0,
      )
    ) {
      return fail(
        res,
        400,
        "INVALID_REQUEST",
        "판매 품목과 수량을 확인해 주세요.",
      );
    }
    const productIds = items.map((item) => item.productId || item.product_id);
    const products = productIds.length
      ? await query(
          `SELECT id, product_price FROM pos_products
            WHERE instance_id = ? AND id IN (${productIds
            .map(() => "?")
            .join(",")})`,
          [instanceId, ...productIds],
        )
      : [];
    const priceById = new Map(
      products.map((product) => [product.id, product.product_price]),
    );
    const normalizedItems = items.map((item) => ({
      product_id: Number(item.productId || item.product_id),
      quantity: Number(item.quantity || 0),
      is_service: Boolean(item.isService || item.is_service),
    }));
    if (new Set(productIds.map(Number)).size !== products.length) {
      return fail(
        res,
        400,
        "INVALID_PRODUCT",
        "해당 POS에 없는 품목이 포함되어 있습니다.",
      );
    }
    // 2026-07-23: 서비스 품목은 무료이므로 영수증 합계에서 제외한다.
    const totalPrice = normalizedItems.reduce(
      (total, item) =>
        total +
        (item.is_service
          ? 0
          : (priceById.get(item.product_id) || 0) * item.quantity),
      0,
    );
    let result;
    try {
      result = await Pos.recordPurchase({
        instanceId,
        userId: req.session.userId,
        items: normalizedItems,
        totalPrice,
      });
    } catch (error) {
      if (
        ["NOT_SALESMAN", "POS_NOT_ACTIVE", "OUT_OF_STOCK"].includes(error.code)
      ) {
        return fail(res, 409, error.code, error.message);
      }
      throw error;
    }
    created(res, {
      recordId: result.receiptId,
      totalPrice,
      purchaseTime: toIso(new Date()),
    });
  }),
);

router.post(
  "/pos/close",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    await Pos.setInstanceStatus(req.body.instanceId, "closed");
    ok(res, { status: "closed", closedAt: toIso(new Date()) });
  }),
);

router.get(
  "/pos/instances/:id/records",
  asyncHandler(async (req, res) => {
    const data = await Pos.findInstanceInfoById(req.params.id);
    if (!data.instance)
      return fail(res, 404, "NOT_FOUND", "POS instance not found.");
    const receipts = await Pos.findReceiptsByInstanceId(req.params.id);
    const records = receipts.map((receipt) => ({
      id: receipt.id,
      purchaseTime: toIso(receipt.purchase_time),
      items: receipt.items.map((item) => ({
        productId: item.product_id,
        name: item.product_name,
        quantity: item.product_quantity,
        unitPrice: item.product_price,
        isService: Boolean(item.is_service),
      })),
      totalPrice: receipt.total_price,
      paid: true,
    }));
    const summary = records.reduce(
      (acc, record) => {
        acc.totalPrice += Number(record.totalPrice || 0);
        for (const item of record.items) {
          acc.itemCounts[item.name] =
            (acc.itemCounts[item.name] || 0) + item.quantity;
        }
        return acc;
      },
      { totalPrice: 0, itemCounts: {} },
    );
    ok(res, {
      instance: { id: data.instance.id, name: data.instance.instance_name },
      records,
      summary,
      canManage: authorityRank(req.session.authority) >= 4,
    });
  }),
);

router.delete(
  "/pos/records/:recordId",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    await db.execute("DELETE FROM pos_receipts WHERE id = ?", [
      req.params.recordId,
    ]);
    ok(res, { message: "POS record deleted." });
  }),
);

router.post(
  "/pos/instances/:id/records/clear",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const [result] = await db.execute(
      "DELETE FROM pos_receipts WHERE instance_id = ?",
      [req.params.id],
    );
    ok(res, {
      deletedCount: result.affectedRows || 0,
      message: "POS records cleared.",
    });
  }),
);

router.post(
  "/public/recruit-results/search",
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT rm.*, fl.title AS form_title
         FROM recruiting_members rm
         LEFT JOIN formlist fl ON fl.id = rm.form_id
        WHERE rm.student_id = ?
        ORDER BY rm.synced_at DESC`,
      [req.body.studentId],
    );
    ok(res, {
      results: result.map((row) => ({
        formTitle: row.form_title,
        name: row.name,
        major: row.major,
        rating: row.rating,
        interviewSchedule: null,
      })),
    });
  }),
);

router.post(
  "/public/recruit-responses/search",
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT rm.*, fl.title AS form_title
         FROM recruiting_members rm
         LEFT JOIN formlist fl ON fl.id = rm.form_id
        WHERE rm.student_id = ?
        ORDER BY rm.synced_at DESC`,
      [req.body.studentId],
    );
    const apiResults = [];
    for (const row of result) {
      const responses = await query(
        `SELECT fq.question, fr.answer
           FROM form_responses fr
           LEFT JOIN form_questions fq
             ON fq.form_id = fr.form_id AND fq.question_id = fr.question_id
          WHERE fr.form_id = ? AND fr.response_id = ?
          ORDER BY fq.idx ASC`,
        [row.form_id, row.response_id],
      );
      apiResults.push({
        formId: row.form_id,
        formTitle: row.form_title,
        responseId: row.response_id,
        responses: responses.map((response) => ({
          question: response.question,
          answer: response.answer,
        })),
      });
    }
    ok(res, { results: apiResults });
  }),
);

router.use((err, req, res, next) => {
  if (err.code === "NOT_SALESMAN") {
    return fail(res, 403, "FORBIDDEN", err.message);
  }
  // 2026-07-23: 외부 API 오류 객체의 OAuth 토큰·요청 본문이 서버 로그에 기록되지 않도록 요약만 남깁니다.
  console.error(
    `${req.method} ${req.originalUrl} API error: ${err?.code || err?.status || "UNKNOWN"} ${err?.message || ""}`,
  );
  return fail(res, 500, "INTERNAL_SERVER_ERROR", "Internal server error.");
});

module.exports = router;
