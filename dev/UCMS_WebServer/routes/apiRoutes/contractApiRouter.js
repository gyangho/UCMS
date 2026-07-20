const express = require("express");
const router = express.Router();
const db = require("../../models/db");
const Pos = require("../../models/Pos");
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
    [userId]
  );
  return result[0] || null;
}

function mapUser(row) {
  return {
    id: row.user_id,
    userId: row.user_id,
    name: row.member_name || row.user_name,
    email: null,
    studentId: row.student_id || null,
    department: null,
    major: row.major || null,
    phone: row.phone || null,
    role: row.authority || null,
    authority: authorityRank(row.authority),
    profileImage: row.profile_image || null,
    thumbnailImage: row.thumbnail_image || null,
    joinedAt: toDate(row.user_created_at),
  };
}

function mapMember(row) {
  return {
    id: row.student_id,
    name: row.name,
    studentId: row.student_id,
    department: null,
    major: row.major,
    phone: row.phone,
    email: null,
    role: row.authority,
    authority: authorityRank(row.authority),
    status: "active",
  };
}

function mapEvent(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    start: toIso(row.start),
    end: toIso(row.end),
    place: null,
    color: row.color || DEFAULT_EVENT_COLOR,
    author: row.author_name || null,
    authorId: row.author_id,
    isMultiple: Boolean(row.ismultiple),
    isRecruiting: Boolean(row.isRecruiting),
    settlementId: null,
  };
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
    paidCount,
    participantCount,
    progressPercent: participantCount
      ? Math.round((paidCount / participantCount) * 100)
      : 0,
    status: row.status,
  };
}

function mapPosInstance(row) {
  return {
    id: row.id,
    name: row.instance_name,
    status: row.status === "active" ? "active" : "inactive",
    createdAt: null,
    updatedAt: null,
    manager: null,
    openedAt: null,
    closedAt: null,
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
  return {
    id: row.id,
    responseId: row.response_id,
    applicantName: row.name,
    studentId: row.student_id,
    formId: row.form_id,
    formTitle: row.form_title,
    rating: row.rating,
    updatedAt: toIso(row.synced_at),
  };
}

function memberPayload(body, fallback = {}) {
  return {
    studentId: body.studentId || body.student_id || fallback.student_id,
    name: body.name || fallback.name,
    major: body.major || body.department || fallback.major || "",
    phone: body.phone || fallback.phone || "",
    gender: body.gender || fallback.gender || "남자",
    generation: Number(body.generation || fallback.generation || 1),
    authority: authorityLabel(body.authority || body.role || fallback.authority),
  };
}

function eventPayload(body, req, fallback = {}) {
  return {
    title: body.title || fallback.title,
    description: body.description ?? fallback.description ?? "",
    start: body.start || fallback.start,
    end: body.end || fallback.end,
    color: body.color || fallback.color || DEFAULT_EVENT_COLOR,
    authorId: fallback.author_id || req.session.userId,
    updaterId: req.session.userId,
    authority: authorityLabel(
      body.authority || fallback.authority || req.session.authority || 2
    ),
    isMultiple: Boolean(body.isMultiple ?? body.ismultiple ?? fallback.ismultiple),
    isRecruiting: Boolean(body.isRecruiting ?? fallback.isRecruiting),
    recruitStart: body.recruitStart || fallback.recruit_start || null,
    recruitEnd: body.recruitEnd || fallback.recruit_end || null,
  };
}

async function getVisibleEvents(authority) {
  const result = await query(
    `SELECT e.*, u.name AS author_name
       FROM events e
       LEFT JOIN users u ON u.id = e.author_id
      ORDER BY e.start DESC`
  );
  const rank = authorityRank(authority);
  return result.filter((event) => authorityRank(event.authority) <= rank);
}

async function replaceEventParticipants(connection, eventId, participantIds) {
  if (!Array.isArray(participantIds)) return;
  await connection.execute("DELETE FROM event_participants WHERE event_id = ?", [
    eventId,
  ]);
  for (const rawId of participantIds) {
    const found = rows(
      await connection.execute(
        `SELECT user_id
           FROM members
          WHERE user_id = ? OR student_id = ?
          LIMIT 1`,
        [rawId, String(rawId)]
      )
    );
    const userId = found[0]?.user_id || Number(rawId);
    if (!userId) continue;
    await connection.execute(
      "INSERT IGNORE INTO event_participants (event_id, user_id) VALUES (?, ?)",
      [eventId, userId]
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
    params
  );
}

router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const events = (await getVisibleEvents(req.session.authority)).map(mapEvent);
    ok(res, {
      calendarEvents: events,
      myEvents: events.filter((event) => !event.isRecruiting),
      recruitingEvents: events.filter((event) => event.isRecruiting),
      notices: [],
    });
  })
);

router.get(
  "/user/me",
  asyncHandler(async (req, res) => {
    if (!req.session?.userId) {
      return fail(res, 401, "UNAUTHORIZED", "Login required.");
    }
    const user = await getCurrentUser(req.session.userId);
    if (!user) return fail(res, 404, "NOT_FOUND", "User not found.");
    ok(res, { user: mapUser(user), cacheTtlSeconds: 1800 });
  })
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
  })
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
    const found = await query("SELECT student_id FROM members WHERE student_id = ?", [
      req.body.studentId,
    ]);
    ok(res, {
      confirmed: found.length > 0,
      message: found.length > 0 ? "Member confirmed." : "Member not found.",
    });
  })
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
  })
);

router.post(
  "/members",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const payload = memberPayload(req.body);
    if (!payload.studentId || !payload.name) {
      return fail(res, 400, "INVALID_REQUEST", "studentId and name are required.");
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
      ]
    );
    created(res, { id: payload.studentId, message: "Member saved." });
  })
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
    await db.execute(
      `UPDATE members
          SET name = ?, major = ?, phone = ?, gender = ?, generation = ?, authority = ?
        WHERE student_id = ?`,
      [
        payload.name,
        payload.major,
        payload.phone,
        payload.gender,
        payload.generation,
        payload.authority,
        req.params.id,
      ]
    );
    ok(res, { id: req.params.id, message: "Member updated." });
  })
);

router.delete(
  "/members/:id",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    await db.execute("DELETE FROM members WHERE student_id = ?", [req.params.id]);
    ok(res, { message: "Member deleted." });
  })
);

router.get(
  "/events",
  asyncHandler(async (req, res) => {
    const events = (await getVisibleEvents(req.session.authority)).map(mapEvent);
    ok(res, {
      myEvents: events.filter((event) => !event.isRecruiting),
      recruitingEvents: events.filter((event) => event.isRecruiting),
      events,
    });
  })
);

router.get(
  "/events/my",
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT e.*, u.name AS author_name
         FROM event_participants ep
         JOIN events e ON e.id = ep.event_id
         LEFT JOIN users u ON u.id = e.author_id
        WHERE ep.user_id = ?
        ORDER BY e.start ASC`,
      [req.session.userId]
    );
    ok(res, { events: result.map(mapEvent) });
  })
);

router.post(
  "/events",
  asyncHandler(async (req, res) => {
    const payload = eventPayload(req.body, req);
    if (!payload.title || !payload.start || !payload.end) {
      return fail(res, 400, "INVALID_REQUEST", "title, start, and end are required.");
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
        ]
      );
      await replaceEventParticipants(connection, result.insertId, req.body.participantIds);
      await connection.commit();
      created(res, { id: result.insertId, path: `/event/${result.insertId}` });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

router.get(
  "/events/:id",
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT e.*, u.name AS author_name
         FROM events e
         LEFT JOIN users u ON u.id = e.author_id
        WHERE e.id = ?`,
      [req.params.id]
    );
    if (!result[0]) return fail(res, 404, "NOT_FOUND", "Event not found.");
    const event = mapEvent(result[0]);
    event.canEdit =
      Number(result[0].author_id) === Number(req.session.userId) ||
      authorityRank(req.session.authority) >= 4;
    event.canDelete = event.canEdit;
    event.participants = (
      await query(
        `SELECT ep.id, m.name, m.authority AS role
           FROM event_participants ep
           LEFT JOIN members m ON m.user_id = ep.user_id
          WHERE ep.event_id = ?
          ORDER BY m.name ASC`,
        [req.params.id]
      )
    ).map((participant) => ({
      id: participant.id,
      name: participant.name,
      role: participant.role,
      status: "joined",
    }));
    event.settlement = null;
    ok(res, { event });
  })
);

router.put(
  "/events/:id",
  asyncHandler(async (req, res) => {
    const existing = (await query("SELECT * FROM events WHERE id = ?", [req.params.id]))[0];
    if (!existing) return fail(res, 404, "NOT_FOUND", "Event not found.");
    if (
      Number(existing.author_id) !== Number(req.session.userId) &&
      authorityRank(req.session.authority) < 4
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
        ]
      );
      if (Array.isArray(req.body.participantIds)) {
        await replaceEventParticipants(connection, req.params.id, req.body.participantIds);
      }
      await connection.commit();
      ok(res, { id: Number(req.params.id), message: "Event updated." });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

router.delete(
  "/events/:id",
  asyncHandler(async (req, res) => {
    const existing = (await query("SELECT * FROM events WHERE id = ?", [req.params.id]))[0];
    if (!existing) return fail(res, 404, "NOT_FOUND", "Event not found.");
    if (
      Number(existing.author_id) !== Number(req.session.userId) &&
      authorityRank(req.session.authority) < 4
    ) {
      return fail(res, 403, "FORBIDDEN", "Authority is required.");
    }
    await db.execute("DELETE FROM events WHERE id = ?", [req.params.id]);
    ok(res, { message: "Event deleted." });
  })
);

router.post(
  "/events/:id/participants/me",
  asyncHandler(async (req, res) => {
    await db.execute(
      "INSERT IGNORE INTO event_participants (event_id, user_id) VALUES (?, ?)",
      [req.params.id, req.session.userId]
    );
    ok(res, { status: "joined" });
  })
);

router.delete(
  "/events/:id/participants/me",
  asyncHandler(async (req, res) => {
    await db.execute(
      "DELETE FROM event_participants WHERE event_id = ? AND user_id = ?",
      [req.params.id, req.session.userId]
    );
    ok(res, { status: "cancelled" });
  })
);

router.post(
  "/admin/holidays/import",
  requireAuthority(4),
  (req, res) => {
    ok(res, {
      importedCount: 0,
      skippedCount: 0,
      message: "Holiday import is not wired to the external API yet.",
    });
  }
);

router.get(
  "/drive/templates",
  asyncHandler(async (req, res) => {
    const result = await query(
      "SELECT id, title, form_url FROM form_templates ORDER BY created_at DESC"
    );
    ok(res, {
      templates: result.map((template) => ({
        id: template.id,
        title: template.title,
        formUrl: template.form_url,
      })),
    });
  })
);

router.post(
  "/drive/templates",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const { title, formUrl } = req.body;
    if (!title || !formUrl) {
      return fail(res, 400, "INVALID_REQUEST", "title and formUrl are required.");
    }
    const [result] = await db.execute(
      "INSERT INTO form_templates (title, form_url) VALUES (?, ?)",
      [title, formUrl]
    );
    created(res, { template: { id: result.insertId, title, formUrl } });
  })
);

router.post(
  "/drive/forms",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const result = await query(
      "SELECT form_url FROM form_templates WHERE id = ? LIMIT 1",
      [req.body.templateId]
    );
    if (!result[0]) return fail(res, 404, "NOT_FOUND", "Template not found.");
    ok(res, {
      formUrl: result[0].form_url,
      message: "Template URL returned. Google form generation remains in the legacy flow.",
    });
  })
);

router.get(
  "/recruit/responses",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT rm.*, fl.title AS form_title
         FROM recruiting_members rm
         LEFT JOIN formlist fl ON fl.id = rm.form_id
        ORDER BY rm.synced_at DESC, rm.id DESC`
    );
    ok(res, { responses: result.map(mapRecruitResponse) });
  })
);

router.post(
  "/recruit/sync",
  requireAuthority(4),
  (req, res) => {
    ok(res, {
      syncedCount: 0,
      message: "Recruit sync remains in the legacy Google Forms flow.",
    });
  }
);

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
  })
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
      [req.params.id]
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
      [applicant.form_id, applicant.response_id]
    );
    ok(res, {
      applicant: {
        responseId: applicant.id,
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
  })
);

router.get(
  "/recruit/responses/:id/shared-document",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const applicants = await query(
      "SELECT response_id FROM recruiting_members WHERE id = ?",
      [req.params.id]
    );
    if (!applicants[0]) {
      return fail(res, 404, "NOT_FOUND", "Recruit response not found.");
    }
    const responseId = `response-${applicants[0].response_id}`;
    const notes = await query("SELECT * FROM evaluation_notes WHERE response_id = ?", [
      responseId,
    ]);
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
  })
);

router.put(
  "/recruit/responses/:id/shared-document",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const applicants = await query(
      "SELECT response_id, form_id FROM recruiting_members WHERE id = ?",
      [req.params.id]
    );
    if (!applicants[0]) {
      return fail(res, 404, "NOT_FOUND", "Recruit response not found.");
    }
    const responseId = `response-${applicants[0].response_id}`;
    const notes = await query(
      "SELECT version FROM evaluation_notes WHERE response_id = ?",
      [responseId]
    );
    if (notes[0] && Number(req.body.version) !== Number(notes[0].version)) {
      return fail(res, 409, "VERSION_CONFLICT", "Document version conflict.");
    }
    const version = notes[0] ? Number(notes[0].version) + 1 : 1;
    await db.execute(
      `INSERT INTO evaluation_notes (response_id, form_id, content, version)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE content = VALUES(content), version = VALUES(version)`,
      [responseId, applicants[0].form_id, req.body.content || "", version]
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
  })
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
        ORDER BY ip.updated_at DESC`
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
  })
);

router.post(
  "/interview/plans",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    if (!req.body.title || !req.body.formId) {
      return fail(res, 400, "INVALID_REQUEST", "title and formId are required.");
    }
    const [result] = await db.execute(
      `INSERT INTO interview_plans
       (form_id, title, status, created_by, updated_by, panel_size)
       VALUES (?, ?, 'draft', ?, ?, ?)`,
      [
        req.body.formId,
        req.body.title,
        req.session.userId,
        req.session.userId,
        Number(req.body.interviewerIds?.length || 2),
      ]
    );
    created(res, {
      id: result.insertId,
      path: `/recruit/interview/plans/${result.insertId}`,
    });
  })
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
      [req.params.id]
    );
    const plan = result[0];
    if (!plan) return fail(res, 404, "NOT_FOUND", "Plan not found.");
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
      [plan.form_id, req.params.id]
    );
    ok(res, {
      plan: {
        id: plan.id,
        title: plan.title,
        formId: plan.form_id,
        formTitle: plan.form_title,
        status: plan.status,
        owner: plan.owner,
        updatedAt: toIso(plan.updated_at),
      },
      interviewers: [],
      applicants: [],
      schedule: scheduleRows.map((schedule) => ({
        id: schedule.id,
        start: schedule.interview_date,
        end: schedule.time_slot,
        applicantName: schedule.applicant_name,
        interviewerNames: [schedule.interviewer_name].filter(Boolean),
        status: "scheduled",
      })),
    });
  })
);

router.post(
  "/interview/plans/:id/timetable",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const countRows = await query(
      "SELECT COUNT(*) AS count FROM interview_schedules WHERE plan_id = ?",
      [req.params.id]
    );
    ok(res, {
      scheduleCount: countRows[0]?.count || 0,
      message: "Existing timetable returned. Scheduler generation remains in the legacy flow.",
    });
  })
);

router.delete(
  "/interview/plans/:id",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    await db.execute("DELETE FROM interview_plans WHERE id = ?", [req.params.id]);
    ok(res, { message: "Interview plan deleted." });
  })
);

router.get(
  "/finance/settlements",
  asyncHandler(async (req, res) => {
    ok(res, {
      activeSettlements: (await settlementRows("active")).map(mapSettlement),
      completedSettlements: (await settlementRows("completed")).map(mapSettlement),
    });
  })
);

router.post(
  "/finance/settlements",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const user = await getCurrentUser(req.session.userId);
    if (!user?.student_id) {
      return fail(res, 422, "INVALID_MEMBER", "Current user is not linked to a member.");
    }
    const [result] = await db.execute(
      `INSERT INTO settlements (name, total_amount, deadline, is_dutch_pay, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [
        req.body.title,
        Number(req.body.amount || 0),
        req.body.dueDate,
        Boolean(req.body.dutchPay),
        user.student_id,
      ]
    );
    created(res, { id: result.insertId, path: `/finance/${result.insertId}` });
  })
);

router.get(
  "/finance/settlements/:id",
  asyncHandler(async (req, res) => {
    const allSettlements = await settlementRows();
    const settlement = allSettlements.find(
      (item) => Number(item.id) === Number(req.params.id)
    );
    if (!settlement) return fail(res, 404, "NOT_FOUND", "Settlement not found.");
    const participants = await query(
      `SELECT sp.*, m.name, m.student_id
         FROM settlementparticipants sp
         LEFT JOIN members m ON m.student_id = sp.member_id
        WHERE sp.settlement_id = ?
        ORDER BY m.name ASC`,
      [req.params.id]
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
        paidAt: participant.status === "paid" ? toIso(participant.updated_at) : null,
      })),
    });
  })
);

router.put(
  "/finance/settlements/:id",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    await db.execute(
      `UPDATE settlements
          SET name = ?, total_amount = ?, deadline = ?, is_dutch_pay = ?
        WHERE id = ?`,
      [
        req.body.title,
        Number(req.body.amount || 0),
        req.body.dueDate,
        Boolean(req.body.dutchPay),
        req.params.id,
      ]
    );
    ok(res, { id: Number(req.params.id), message: "Settlement updated." });
  })
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
        [req.params.id, String(memberId), Number(req.body.amount || 0)]
      );
    }
    ok(res, { id: Number(req.params.id), addedCount: ids.length });
  })
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
      ]
    );
    ok(res, {
      id: Number(req.params.participantId),
      message: "Participant updated.",
    });
  })
);

router.post(
  "/finance/settlements/:id/complete",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    await db.execute("UPDATE settlements SET status = 'completed' WHERE id = ?", [
      req.params.id,
    ]);
    ok(res, {
      status: "completed",
      completedAt: req.body.completedAt || toDate(new Date()),
    });
  })
);

router.get(
  "/pos/instances",
  asyncHandler(async (req, res) => {
    ok(res, { instances: (await Pos.findAllInstances()).map(mapPosInstance) });
  })
);

router.post(
  "/pos/instances",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const products = (req.body.products || []).map((product) => ({
      product_name: product.name || product.product_name,
      product_price: product.price || product.product_price,
      stock: product.stock || 0,
    }));
    const id = await Pos.createInstance({
      instance_name: req.body.name || req.body.instance_name,
      products,
      salesmans: req.body.salesmans || [],
    });
    created(res, { id, path: `/pos/instances/${id}` });
  })
);

router.get(
  "/pos/instances/:id",
  asyncHandler(async (req, res) => {
    const data = await Pos.findInstanceInfoById(req.params.id);
    if (!data.instance) return fail(res, 404, "NOT_FOUND", "POS instance not found.");
    ok(res, {
      instance: mapPosInstance(data.instance),
      products: data.products.map(mapPosProduct),
    });
  })
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
  })
);

router.delete(
  "/pos/instances/:id",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    await db.execute("DELETE FROM pos_instances WHERE id = ?", [req.params.id]);
    ok(res, { message: "POS instance deleted." });
  })
);

router.post(
  "/pos/instances/:id/open",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    await Pos.setActiveInstance(req.params.id);
    ok(res, { status: "active", openedAt: toIso(new Date()) });
  })
);

router.post(
  "/pos/purchase",
  asyncHandler(async (req, res) => {
    const items = req.body.items || [];
    const productIds = items.map((item) => item.productId || item.product_id);
    const products = productIds.length
      ? await query(
          `SELECT id, product_price FROM pos_products WHERE id IN (${productIds
            .map(() => "?")
            .join(",")})`,
          productIds
        )
      : [];
    const priceById = new Map(
      products.map((product) => [product.id, product.product_price])
    );
    const normalizedItems = items.map((item) => ({
      product_id: item.productId || item.product_id,
      quantity: Number(item.quantity || 0),
      is_service: Boolean(item.isService || item.is_service),
    }));
    const totalPrice = normalizedItems.reduce(
      (total, item) => total + (priceById.get(item.product_id) || 0) * item.quantity,
      0
    );
    const result = await Pos.recordPurchase({
      instanceId: req.body.instanceId,
      userId: req.session.userId,
      items: normalizedItems,
      totalPrice,
    });
    created(res, {
      recordId: result.receiptId,
      totalPrice,
      purchaseTime: toIso(new Date()),
    });
  })
);

router.post(
  "/pos/close",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    await db.execute("UPDATE pos_instances SET status = 'inactive' WHERE id = ?", [
      req.body.instanceId,
    ]);
    ok(res, { status: "closed", closedAt: toIso(new Date()) });
  })
);

router.get(
  "/pos/instances/:id/records",
  asyncHandler(async (req, res) => {
    const data = await Pos.findInstanceInfoById(req.params.id);
    if (!data.instance) return fail(res, 404, "NOT_FOUND", "POS instance not found.");
    const receipts = await Pos.findReceiptsByInstanceId(req.params.id);
    const records = receipts.map((receipt) => ({
      id: receipt.id,
      purchaseTime: toIso(receipt.purchase_time),
      items: receipt.items.map((item) => ({
        productId: item.product_id,
        name: item.product_name,
        quantity: item.product_quantity,
        unitPrice: item.product_price,
      })),
      totalPrice: receipt.total_price,
      paid: true,
    }));
    const summary = records.reduce(
      (acc, record) => {
        acc.totalPrice += Number(record.totalPrice || 0);
        for (const item of record.items) {
          acc.itemCounts[item.name] = (acc.itemCounts[item.name] || 0) + item.quantity;
        }
        return acc;
      },
      { totalPrice: 0, itemCounts: {} }
    );
    ok(res, {
      instance: { id: data.instance.id, name: data.instance.instance_name },
      records,
      summary,
    });
  })
);

router.delete(
  "/pos/records/:recordId",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    await db.execute("DELETE FROM pos_receipts WHERE id = ?", [req.params.recordId]);
    ok(res, { message: "POS record deleted." });
  })
);

router.post(
  "/pos/instances/:id/records/clear",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const [result] = await db.execute(
      "DELETE FROM pos_receipts WHERE instance_id = ?",
      [req.params.id]
    );
    ok(res, {
      deletedCount: result.affectedRows || 0,
      message: "POS records cleared.",
    });
  })
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
      [req.body.studentId]
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
  })
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
      [req.body.studentId]
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
        [row.form_id, row.response_id]
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
  })
);

router.get("/boards/:boardType", (req, res) => {
  ok(res, { posts: [] });
});

router.post("/boards/:boardType", requireAuthority(4), (req, res) => {
  fail(res, 422, "NOT_IMPLEMENTED", "Board schema is not present in initialData.sql.");
});

router.get("/boards/:boardType/:id", (req, res) => {
  fail(res, 404, "NOT_FOUND", "Board post not found.");
});

router.put("/boards/:boardType/:id", requireAuthority(4), (req, res) => {
  fail(res, 422, "NOT_IMPLEMENTED", "Board schema is not present in initialData.sql.");
});

router.delete("/boards/:boardType/:id", requireAuthority(4), (req, res) => {
  fail(res, 422, "NOT_IMPLEMENTED", "Board schema is not present in initialData.sql.");
});

router.post("/boards/:boardType/:id/comments", (req, res) => {
  fail(res, 422, "NOT_IMPLEMENTED", "Board schema is not present in initialData.sql.");
});

router.put("/boards/:boardType/:id/comments/:commentId", (req, res) => {
  fail(res, 422, "NOT_IMPLEMENTED", "Board schema is not present in initialData.sql.");
});

router.delete("/boards/:boardType/:id/comments/:commentId", (req, res) => {
  fail(res, 422, "NOT_IMPLEMENTED", "Board schema is not present in initialData.sql.");
});

router.use((err, req, res, next) => {
  if (err.code === "NOT_SALESMAN") {
    return fail(res, 403, "FORBIDDEN", err.message);
  }
  console.error(`${req.method} ${req.originalUrl} API error`, err);
  return fail(res, 500, "INTERNAL_SERVER_ERROR", "Internal server error.");
});

module.exports = router;
