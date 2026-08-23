const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const db = require("../../models/db");
const Form = require("../../models/Form");
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
  createShareDbTicket,
} = require("../../services/ShareDbTicketService");
const {
  forceUserReauthentication,
  listUsersForReauthentication,
} = require("../../services/UserReauthenticationService");
const {
  deleteUser,
  updateUser,
} = require("../../services/SpringUserAdminService");
const { requestTemporaryPassword } = require("../../services/SpringPasswordResetService");
const { changePassword } = require("../../services/SpringPasswordChangeService");
const {
  updateInstance: updatePosInstance,
} = require("../../services/SpringPosAdminService");
const { registerFinalMembers } = require("../../services/SpringRecruitMemberService");
const {
  listImpersonationTargets,
  startUserImpersonation,
  stopUserImpersonation,
} = require("../../services/UserImpersonationService");
const {
  createTrustedDevice,
  isEmailVerificationEnabled,
  revokeTrustedDevice,
  startLogin,
  startRegistration,
  verifyChallenge,
} = require("../../services/EmailAuthenticationService");
const {
  consumeLookupAttempt,
  createVerifiedAccountIdentity,
  findOwnApplications,
  normalizeName,
  normalizePhone,
  normalizeStudentId,
  setLookupRateLimitHeaders,
} = require("../../services/ApplicantIdentityService");
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
const GOOGLE_OAUTH_STATE_TTL_MS = 20 * 60 * 1000;
const AUTH_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const INTERVIEW_TIME_SLOTS = [
  "09:00~10:00", "10:00~11:00", "11:00~12:00", "12:00~13:00",
  "13:00~14:00", "14:00~15:00", "15:00~16:00", "16:00~17:00",
  "17:00~18:00", "18:00~19:00", "19:00~20:00",
];
const authAttemptBuckets = new Map();
// 2026-08-22: Keep retired and arbitrary applicant ratings out of every write path.
const RECRUIT_RATINGS = new Set([
  "대기",
  "1차합격",
  "불합격",
  "느별",
  "느괜",
  "느좋",
  "최종합격",
]);

function rows(result) {
  return Array.isArray(result) ? result[0] : [];
}

async function query(sql, params = []) {
  return rows(await db.execute(sql, params));
}

function saveRequestSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

function regenerateRequestSession(req) {
  return new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
}

const trustedDeviceCookie = () => process.env.NODE_ENV === "dev" ? "UCMS_TRUSTED_DEVICE_DEV" : "UCMS_TRUSTED_DEVICE_PROD";
function requestCookie(req, name) {
  const match = String(req.headers.cookie || "").split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function consumeAuthAttempt(scope, keyMaterial, limit) {
  const now = Date.now();
  const key = crypto.createHash("sha256").update(`${scope}:${keyMaterial}`).digest("hex");
  const current = authAttemptBuckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + AUTH_ATTEMPT_WINDOW_MS }
    : current;
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  authAttemptBuckets.set(key, bucket);
  if (authAttemptBuckets.size > 5000) {
    for (const [bucketKey, value] of authAttemptBuckets) {
      if (value.resetAt <= now) authAttemptBuckets.delete(bucketKey);
    }
  }
  return true;
}

async function establishEmailSession(req, user) {
  await regenerateRequestSession(req);
  req.session.userId = Number(user.id);
  req.session.authority = Number(user.session_authority || 1);
  await saveRequestSession(req);
  await db.execute("UPDATE users SET last_login_at=NOW() WHERE id=?", [user.id]);
}

async function getCurrentUser(userId) {
  const result = await query(
    `SELECT u.id AS user_id,
            u.name AS user_name,
            u.account_email,
            u.phone_number,
            u.student_id AS user_student_id,
            u.major AS user_major,
            u.profile_image,
            u.thumbnail_image,
            u.account_type,
            u.system_key,
            u.system_authority,
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
  const effectiveAuthority =
    row.account_type === "system" ? row.system_authority : row.authority;
  const mappedAuthority =
    effectiveAuthority === null || effectiveAuthority === undefined
      ? sessionAuthorityRank(fallbackAuthority)
      : authorityRank(effectiveAuthority);
  return {
    id: row.user_id,
    userId: row.user_id,
    name: row.member_name || row.user_name,
    email: row.account_email || null,
    studentId: row.student_id || row.user_student_id || null,
    department: null,
    major: row.major || row.user_major || null,
    phone: row.phone || row.phone_number || null,
    // 2026-07-23: Non-member general users retain their session role for inquiry-board access.
    role: effectiveAuthority || authorityLabel(mappedAuthority),
    authority: mappedAuthority,
    accountType: row.account_type || "human",
    systemKey: row.system_key || null,
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
    autoCloseAt: toIso(row.auto_close_at),
    hasPoster: Boolean(row.poster_pdf),
    posterUrl: row.poster_pdf ? `/api/pos/instances/${row.id}/poster` : null,
    promotionCopy: row.promotion_copy || "",
  };
}

function mapPosProduct(row) {
  return {
    id: row.id,
    name: row.product_name,
    price: row.product_price,
    stock: row.stock,
    initialStock: row.initial_stock,
  };
}

function decodeBase64File(value, allowedMimeTypes, maxBytes) {
  if (!value) return null;
  const match = String(value).match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !allowedMimeTypes.includes(match[1])) {
    const error = new Error("지원하지 않는 파일 형식입니다.");
    error.code = "INVALID_UPLOAD";
    throw error;
  }
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > maxBytes) {
    const error = new Error(`파일은 ${Math.floor(maxBytes / 1024 / 1024)}MB 이하여야 합니다.`);
    error.code = "INVALID_UPLOAD";
    throw error;
  }
  return { mimeType: match[1], buffer };
}

function mapRecruitment(row) {
  const applicantCount = Number(row.snapshot_applicant_count ?? row.applicant_count ?? 0);
  const firstPassCount = Number(row.snapshot_first_pass_count ?? row.first_pass_count ?? 0);
  const finalPassCount = Number(row.snapshot_final_pass_count ?? row.final_pass_count ?? 0);
  return {
    id: Number(row.id),
    formId: row.form_id || null,
    title: row.title,
    status: row.status,
    recruitStart: toIso(row.recruit_start),
    recruitEnd: toIso(row.recruit_end),
    interviewStart: toIso(row.interview_start),
    interviewEnd: toIso(row.interview_end),
    formUrl: row.form_url || null,
    promotionCopy: row.promotion_copy || "",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    interviewStartedAt: toIso(row.interview_started_at),
    closedAt: toIso(row.closed_at),
    membersRegisteredAt: toIso(row.members_registered_at),
    applicantCount,
    maleCount: Number(row.male_count || 0),
    femaleCount: Number(row.female_count || 0),
    firstPassRate: applicantCount ? firstPassCount / applicantCount : 0,
    finalPassRate: applicantCount ? finalPassCount / applicantCount : 0,
    interviewPlanId: row.interview_plan_id ? Number(row.interview_plan_id) : null,
    interviewPlanStatus: row.interview_plan_status || null,
    posterUrls: row.poster_ids
      ? String(row.poster_ids).split(",").map((id) => `/api/recruit/instances/${row.id}/posters/${id}`)
      : [],
  };
}

function koreaDateParts(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

// 2026-08-23: Replace stale interview-date questions in a copied recruitment form.
function buildInterviewQuestionRequests(form, interviewStart, interviewEnd) {
  const start = new Date(interviewStart);
  const end = new Date(interviewEnd);
  const startParts = koreaDateParts(start);
  const endParts = koreaDateParts(end);
  const cursor = new Date(Date.UTC(Number(startParts.year), Number(startParts.month) - 1, Number(startParts.day)));
  const last = new Date(Date.UTC(Number(endParts.year), Number(endParts.month) - 1, Number(endParts.day)));
  const questions = [];
  const weekday = ["일", "월", "화", "수", "목", "금", "토"];
  while (cursor <= last) {
    const year = cursor.getUTCFullYear();
    const month = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const day = String(cursor.getUTCDate()).padStart(2, "0");
    const ymd = `${year}-${month}-${day}`;
    const options = INTERVIEW_TIME_SLOTS.filter((slot) => {
      const [from, to] = slot.split("~");
      const slotStart = new Date(`${ymd}T${from}:00+09:00`);
      const slotEnd = new Date(`${ymd}T${to}:00+09:00`);
      return slotStart >= start && slotEnd <= end;
    });
    if (options.length > 0) {
      questions.push({
        title: `면접 가능 시간 - ${month}/${day}(${weekday[cursor.getUTCDay()]})`,
        // 2026-08-23: Let applicants explicitly report no availability for each interview date.
        options: [...options, "가능한 시간대 없음"],
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (questions.length === 0) {
    const error = new Error("면접 기간 안에 생성 가능한 1시간 단위 시간대가 없습니다. 면접 시작·종료 일시를 확인해 주세요.");
    error.code = "INVALID_INTERVIEW_PERIOD";
    throw error;
  }
  const items = form.items || [];
  const deleteIndices = items
    .map((item, index) => ({ index, title: String(item.title || "").replace(/\s+/g, "") }))
    .filter((item) => item.title.includes("면접가능시간"))
    .map((item) => item.index)
    .sort((a, b) => b - a);
  const remainingCount = items.length - deleteIndices.length;
  return [
    ...deleteIndices.map((index) => ({ deleteItem: { location: { index } } })),
    ...questions.map((question, index) => ({
      createItem: {
        location: { index: remainingCount + index },
        item: {
          title: question.title,
          questionItem: {
            question: {
              required: true,
              choiceQuestion: {
                type: "CHECKBOX",
                options: question.options.map((value) => ({ value })),
                shuffle: false,
              },
            },
          },
        },
      },
    })),
  ];
}

const recruitmentSelect = `
  SELECT ri.*,
         COUNT(DISTINCT rm.id) AS applicant_count,
         COUNT(DISTINCT CASE WHEN rm.gender = '남자' THEN rm.id END) AS male_count,
         COUNT(DISTINCT CASE WHEN rm.gender = '여자' THEN rm.id END) AS female_count,
         COUNT(DISTINCT CASE WHEN rm.rating IN ('1차합격', '최종합격') THEN rm.id END) AS first_pass_count,
         COUNT(DISTINCT CASE WHEN rm.rating = '최종합격' THEN rm.id END) AS final_pass_count,
         ip.id AS interview_plan_id,
         ip.status AS interview_plan_status,
         GROUP_CONCAT(DISTINCT rp.id ORDER BY rp.sort_order, rp.id) AS poster_ids
    FROM recruitment_instances ri
    LEFT JOIN recruiting_members rm ON rm.form_id = ri.form_id
    LEFT JOIN interview_plans ip ON ip.recruitment_id = ri.id
    LEFT JOIN recruitment_posters rp ON rp.recruitment_id = ri.id`;

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
      location: schedule.location || null,
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
  const start = toMysqlDateTime(body.start || fallback.start);
  const end = toMysqlDateTime(body.end || fallback.end);
  return {
    title: body.title || fallback.title,
    description: body.description ?? fallback.description ?? "",
    start,
    end,
    color: body.color || fallback.color || DEFAULT_EVENT_COLOR,
    authorId: fallback.author_id || req.session.userId,
    updaterId: req.session.userId,
    authority: authorityLabel(
      body.authority || fallback.authority || req.session.authority || 2,
    ),
    // 2026-08-23: Derive multi-day status at the API boundary instead of trusting a redundant checkbox.
    isMultiple: Boolean(start && end && koreanDateKey(start) !== koreanDateKey(end)),
    isRecruiting: Boolean(body.isRecruiting ?? fallback.isRecruiting),
    recruitStart: toMysqlDateTime(
      body.recruitStart || fallback.recruit_start || null,
    ),
    recruitEnd: toMysqlDateTime(
      body.recruitEnd || fallback.recruit_end || null,
    ),
  };
}

function koreanDateKey(value) {
  if (!(value instanceof Date)) return String(value).slice(0, 10);
  return new Date(value.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function getVisibleEvents(authority) {
  const result = await query(
    `SELECT e.*, u.name AS author_name
       FROM events e
       LEFT JOIN users u ON u.id = e.author_id
      ORDER BY e.start DESC`,
  );
  const rank = sessionAuthorityRank(authority);
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
    let activePos = null;
    let recruitmentPromotions = [];
    let recruitResultLookup = null;
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
    // 2026-08-20: Surface active recruitment/POS promotions and the time-bounded result lookup window.
    try {
      const promotion = await Pos.getActivePromotion();
      activePos = promotion
        ? {
            ...mapPosInstance(promotion),
            initialStock: promotion.initial_stock,
            soldQuantity: promotion.sold_quantity,
            saleRate: promotion.sale_rate,
          }
        : null;
      recruitmentPromotions = (
        await query(
          `${recruitmentSelect}
           WHERE ri.status = 'recruiting'
           GROUP BY ri.id, ip.id
           ORDER BY ri.updated_at DESC`,
        )
      ).map(mapRecruitment);
      const resultWindows = await query(
        `SELECT id, title, status, closed_at
           FROM recruitment_instances
          WHERE status IN ('interview', 'interview_completed')
             OR (status = 'closed' AND closed_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 3 DAY))
          ORDER BY updated_at DESC LIMIT 1`,
      );
      if (resultWindows[0]) {
        const item = resultWindows[0];
        recruitResultLookup = {
          recruitmentId: Number(item.id),
          title: item.title,
          phase: item.status,
          showFinalResult: ["interview_completed", "closed"].includes(item.status),
          visibleUntil: item.closed_at
            ? toIso(new Date(new Date(item.closed_at).getTime() + 3 * 24 * 60 * 60 * 1000))
            : null,
        };
      }
    } catch (error) {
      console.error("Dashboard promotion query failed:", error);
      issues.push({ scope: "promotions", code: "PROMOTIONS_UNAVAILABLE", message: "모집/POS 홍보 정보를 불러오지 못했습니다." });
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
      activePos,
      recruitmentPromotions,
      recruitResultLookup,
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
      user: {
        ...mapUser(user, req.session.authority),
        // 2026-08-22: Expose only display-safe impersonation state so every page can offer a reliable exit.
        impersonation: req.session.impersonation
          ? {
              active: true,
              actorName: req.session.impersonation.actorName,
              targetName: req.session.impersonation.targetName,
              readOnly: !req.session.impersonation.allowMutations,
              systemTestAccount:
                req.session.impersonation.targetSystemKey === "ui-test-admin",
              startedAt: req.session.impersonation.startedAt,
            }
          : null,
      },
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
    if (req.session.impersonation) {
      return fail(
        res,
        409,
        "IMPERSONATION_WITHDRAWAL_FORBIDDEN",
        "End impersonation before withdrawing an account.",
      );
    }
    const currentUser = await getCurrentUser(req.session.userId);
    if (currentUser?.account_type === "system") {
      return fail(
        res,
        409,
        "SYSTEM_ACCOUNT_WITHDRAWAL_FORBIDDEN",
        "A system account cannot be withdrawn through the user API.",
      );
    }
    await db.execute("UPDATE members SET user_id = NULL WHERE user_id = ?", [
      req.session.userId,
    ]);
    await db.execute("DELETE FROM users WHERE id = ?", [req.session.userId]);
    req.session.destroy(() => {});
    ok(res, { message: "Withdrawal completed." });
  }),
);

// 2026-08-22: UCMS native auth keeps production verification while dev can temporarily complete immediately.
router.post("/auth/register/start", asyncHandler(async (req, res) => {
  if (!consumeAuthAttempt("register", req.ip, 10)) {
    return fail(res, 429, "AUTH_RATE_LIMITED", "회원가입 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
  }
  const result = await startRegistration(req.body || {});
  if (result.activated) {
    await establishEmailSession(req, result.user);
    return ok(res, { authenticated: true, emailVerificationRequired: false, next: "complete" });
  }
  req.session.pendingEmailAuth = { challengeId: result.challengeId, userId: result.userId, purpose: "register" };
  await saveRequestSession(req);
  ok(res, { authenticated: false, emailVerificationRequired: true, next: "verify", email: result.email });
}));

router.post("/auth/login/start", asyncHandler(async (req, res) => {
  if (!consumeAuthAttempt("login", `${req.ip}:${String(req.body?.email || "").toLowerCase()}`, 10)) {
    return fail(res, 429, "AUTH_RATE_LIMITED", "로그인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
  }
  const result = await startLogin(req.body?.email, req.body?.password, requestCookie(req, trustedDeviceCookie()));
  if (result.authenticated || result.trusted) {
    await establishEmailSession(req, result.user);
    return ok(res, { authenticated: true, twoFactorRequired: false });
  }
  req.session.pendingEmailAuth = { challengeId: result.challengeId, userId: Number(result.user.id), purpose: "login" };
  await saveRequestSession(req);
  return ok(res, { authenticated: false, twoFactorRequired: true });
}));

router.post("/auth/password/temporary", asyncHandler(async (req, res) => {
  // 2026-08-23: Apply an IP-level limit and keep account existence private with one generic response.
  if (!consumeAuthAttempt("temporary-password", req.ip, 5)) {
    return fail(res, 429, "AUTH_RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
  }
  await requestTemporaryPassword(req.body?.email);
  return ok(res, {
    message: "가입된 이메일이라면 임시 비밀번호를 발송했습니다.",
  });
}));

router.post("/auth/password/change", asyncHandler(async (req, res) => {
  if (!req.session?.userId) {
    return fail(res, 401, "UNAUTHORIZED", "로그인이 필요합니다.");
  }
  await changePassword(req.session.userId, {
    currentPassword: req.body?.currentPassword,
    newPassword: req.body?.newPassword,
  });
  // 2026-08-23: Spring revoked persisted login state; also close the live Express session and trusted cookie.
  res.clearCookie(trustedDeviceCookie(), { path: "/" });
  return req.session.destroy(() => ok(res, {
    message: "비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.",
  }));
}));

router.post("/auth/email/verify", asyncHandler(async (req, res) => {
  if (!isEmailVerificationEnabled()) {
    return fail(res, 410, "EMAIL_VERIFICATION_DISABLED", "개발 환경에서는 이메일 인증을 사용하지 않습니다.");
  }
  const pending = req.session?.pendingEmailAuth;
  if (!pending) return fail(res, 409, "EMAIL_CHALLENGE_NOT_ACTIVE", "진행 중인 이메일 인증이 없습니다.");
  const user = await verifyChallenge({ ...pending, code: req.body?.code });
  const shouldTrust = pending.purpose === "login" && Boolean(req.body?.trustDevice);
  const token = shouldTrust ? await createTrustedDevice(user.id, req.get("user-agent")) : null;
  await establishEmailSession(req, user);
  if (token) {
    res.cookie(trustedDeviceCookie(), token, {
      httpOnly: true,
      secure: req.secure,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });
  }
  ok(res, { authenticated: true });
}));

router.post("/auth/logout", asyncHandler(async (req, res) => {
  await revokeTrustedDevice(requestCookie(req, trustedDeviceCookie()));
  res.clearCookie(trustedDeviceCookie(), { path: "/" });
  req.session.destroy(() => ok(res, { message: "Logged out." }));
}));

router.get("/auth/member-confirm", (req, res) => {
  // 2026-08-19: Retire the enumerable legacy member-link contract until the Kakao Business chatbot flow is implemented.
  return fail(res, 410, "MEMBER_LINK_RETIRED", "Member linking is not available.");
});

router.post("/auth/member-confirm", (req, res) =>
  fail(res, 410, "MEMBER_LINK_RETIRED", "Member linking is not available."),
);

router.post("/auth/member-confirm/code", (req, res) => {
  return fail(res, 410, "MEMBER_LINK_RETIRED", "Member linking is not available.");
});

router.get(
  "/members",
  // 2026-08-19: Member contact details are management data, not an executive-level directory endpoint.
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    const result = await query("SELECT * FROM members ORDER BY name ASC");
    ok(res, { members: result.map(mapMember) });
  }),
);

router.post(
  "/members",
  requireAuthority(3),
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
  requireAuthority(3),
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
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    // 2026-08-22: Report an explicit not-found result instead of claiming every deletion succeeded.
    const [result] = await db.execute("DELETE FROM members WHERE student_id = ?", [
      req.params.id,
    ]);
    if (!result.affectedRows) return fail(res, 404, "NOT_FOUND", "Member not found.");
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
    // 2026-08-22: Apply list visibility to direct event lookups so an ID cannot bypass authority filtering.
    if (
      authorityRank(result[0].authority) >
      sessionAuthorityRank(req.session.authority)
    ) {
      return fail(res, 403, "FORBIDDEN", "This event is not accessible.");
    }
    const event = mapEvent(result[0]);
    event.canEdit =
      Number(result[0].author_id) === Number(req.session.userId) ||
      sessionAuthorityRank(req.session.authority) >= EVENT_MANAGER_AUTHORITY;
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
      sessionAuthorityRank(req.session.authority) < EVENT_MANAGER_AUTHORITY
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
      sessionAuthorityRank(req.session.authority) < EVENT_MANAGER_AUTHORITY
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
    if (authorityRank(event.authority) > sessionAuthorityRank(req.session.authority)) {
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
    if (authorityRank(event.authority) > sessionAuthorityRank(req.session.authority)) {
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

// 2026-08-22: Administrators can revoke a user's sessions and trusted-device 2FA bypass.
router.get(
  "/admin/users",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const users = await listUsersForReauthentication(req.session.userId);
    ok(res, { users });
  }),
);

router.post(
  "/admin/users/:id/force-reauthentication",
  requireAuthority(4),
  asyncHandler(async (req, res) => {
    const result = await forceUserReauthentication(
      req.params.id,
      req.session.userId,
    );
    ok(res, result);
  }),
);

// 2026-08-23: Preserve Node session authorization while Spring owns new user-table mutations.
router.patch(
  "/admin/users/:id",
  requireAuthority(6),
  asyncHandler(async (req, res) => {
    const result = await updateUser(req.params.id, req.session.userId, req.body || {});
    ok(res, result);
  }),
);

router.delete(
  "/admin/users/:id",
  requireAuthority(6),
  asyncHandler(async (req, res) => {
    const result = await deleteUser(req.params.id, req.session.userId);
    ok(res, result);
  }),
);

router.get(
  "/admin/impersonation/targets",
  requireAuthority(6),
  asyncHandler(async (req, res) => {
    const targets = await listImpersonationTargets(req.session.userId);
    ok(res, { targets });
  }),
);

router.post(
  "/admin/impersonation/start",
  requireAuthority(6),
  asyncHandler(async (req, res) => {
    const impersonation = await startUserImpersonation(
      req,
      req.body?.targetUserId,
      req.body?.reason,
    );
    ok(res, { impersonation });
  }),
);

router.post(
  "/admin/impersonation/exit",
  asyncHandler(async (req, res) => {
    const result = await stopUserImpersonation(req);
    ok(res, result);
  }),
);

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
  requireAuthority(3),
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
  requireAuthority(3),
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
  requireAuthority(3),
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

    let recruitment = null;
    if (req.body.recruitmentId) {
      const recruitmentRows = await query(
        "SELECT id, status, interview_start, interview_end FROM recruitment_instances WHERE id = ? LIMIT 1",
        [req.body.recruitmentId],
      );
      recruitment = recruitmentRows[0];
      if (!recruitment || recruitment.status !== "draft") {
        return fail(res, 409, "RECRUITMENT_DRAFT_REQUIRED", "초안 상태의 모집에서만 폼을 생성할 수 있습니다.");
      }
      if (!recruitment.interview_start || !recruitment.interview_end) {
        return fail(res, 400, "INTERVIEW_PERIOD_REQUIRED", "면접 시작·종료 일시를 먼저 저장해 주세요.");
      }
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

      const copiedForm = recruitment ? await forms.forms.get({ formId: newFormId }) : null;
      const updateRequests = [
        {
          updateFormInfo: {
            info: { title: formTitle },
            updateMask: "title",
          },
        },
      ];
      if (recruitment) {
        updateRequests.push(...buildInterviewQuestionRequests(
          copiedForm.data,
          recruitment.interview_start,
          recruitment.interview_end,
        ));
      }
      await forms.forms.batchUpdate({
        formId: newFormId,
        requestBody: {
          requests: updateRequests,
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
      const responderUrl = `https://docs.google.com/forms/d/${newFormId}/viewform`;
      // 2026-08-20: Form generation inside a recruitment draft establishes the required 1:1 association.
      if (req.body.recruitmentId) {
        const connection = await db.getConnection();
        try {
          await connection.beginTransaction();
          await connection.execute(
            `INSERT INTO formlist (id, title, form_type)
             VALUES (?, ?, '신규모집')
             ON DUPLICATE KEY UPDATE title = VALUES(title), form_type = '신규모집'`,
            [newFormId, formTitle],
          );
          const [linkResult] = await connection.execute(
            `UPDATE recruitment_instances
                SET form_id = ?, form_url = ?, title = ?
              WHERE id = ? AND status = 'draft' AND form_id IS NULL`,
            [newFormId, responderUrl, formTitle, req.body.recruitmentId],
          );
          if (linkResult.affectedRows !== 1) {
            const linkError = new Error("초안 모집에 Google Form을 연결하지 못했습니다.");
            linkError.code = "RECRUITMENT_FORM_LINK_FAILED";
            throw linkError;
          }
          await connection.commit();
        } catch (linkError) {
          await connection.rollback();
          throw linkError;
        } finally {
          connection.release();
        }
      }
      return created(res, {
        formUrl,
        responderUrl,
        formId: newFormId,
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
      if (error.code === "INVALID_INTERVIEW_PERIOD") {
        return fail(res, 400, error.code, error.message);
      }
      throw error;
    }
  }),
);

router.get(
  "/drive/oauth/status",
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    const status = await getOAuthConnectionStatus();

    // 2026-08-21: Keep this GET read-only so React StrictMode cannot overwrite a pending OAuth state.
    return ok(res, {
      connected: status.connected,
      reason: status.reason,
      authorizationUrl: null,
    });
  }),
);

router.put(
  "/drive/templates/:id",
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    const title = String(req.body.title || "").trim();
    const formUrl = String(req.body.formUrl || "").trim();
    if (!title || !extractFormIdFromURL(formUrl)) {
      return fail(res, 400, "INVALID_TEMPLATE", "템플릿 이름과 올바른 Google Form URL을 입력해 주세요.");
    }
    // 2026-08-23: Template metadata is editable while question editing remains in Google Forms.
    const [result] = await db.execute(
      "UPDATE form_templates SET title = ?, form_url = ? WHERE id = ?",
      [title, formUrl, req.params.id],
    );
    if (!result.affectedRows) return fail(res, 404, "TEMPLATE_NOT_FOUND", "수정할 템플릿을 찾지 못했습니다.");
    ok(res, { template: { id: Number(req.params.id), title, formUrl } });
  }),
);

router.post(
  "/drive/oauth/start",
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    const state = crypto.randomBytes(24).toString("hex");
    req.session.googleOAuthState = state;
    // 2026-08-21: Mint state only on an explicit click, allow time for account selection, and persist before navigation.
    req.session.googleOAuthStateExpiresAt =
      Date.now() + GOOGLE_OAUTH_STATE_TTL_MS;
    await saveRequestSession(req);
    return ok(res, {
      authorizationUrl: getOAuthAuthorizationUrl(state),
    });
  }),
);

// 2026-08-20: Recruitment campaigns have an explicit draft-to-closed lifecycle independent of Google Form creation.
router.get(
  "/recruit/instances",
  requireAuthority(3),
  asyncHandler(async (_req, res) => {
    const result = await query(
      `${recruitmentSelect}
       GROUP BY ri.id, ip.id
       ORDER BY FIELD(ri.status, 'recruiting', 'planning', 'interview', 'interview_completed', 'draft', 'closed'), ri.updated_at DESC`,
    );
    ok(res, { instances: result.map(mapRecruitment) });
  }),
);

router.post(
  "/recruit/instances",
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    const title = String(req.body.title || "새 모집").trim();
    const [result] = await db.execute(
      `INSERT INTO recruitment_instances (title, status, created_by)
       VALUES (?, 'draft', ?)`,
      [title || "새 모집", req.session.userId],
    );
    created(res, { id: result.insertId, path: `/recruit/${result.insertId}` });
  }),
);

router.get(
  "/recruit/instances/:id",
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    const result = await query(
      `${recruitmentSelect}
       WHERE ri.id = ?
       GROUP BY ri.id, ip.id`,
      [req.params.id],
    );
    if (!result[0]) return fail(res, 404, "NOT_FOUND", "모집 인스턴스를 찾지 못했습니다.");
    ok(res, { instance: mapRecruitment(result[0]) });
  }),
);

router.patch(
  "/recruit/instances/:id",
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    const existing = await query(
      `SELECT id, status, form_id, form_url
         FROM recruitment_instances
        WHERE id = ? LIMIT 1`,
      [req.params.id],
    );
    if (!existing[0]) return fail(res, 404, "NOT_FOUND", "모집 인스턴스를 찾지 못했습니다.");
    if (["interview_completed", "closed"].includes(existing[0].status)) {
      return fail(res, 409, "RECRUITMENT_CLOSED", "면접이 종료된 모집은 편집할 수 없습니다.");
    }
    const title = String(req.body.title || "").trim();
    if (!title) return fail(res, 400, "INVALID_REQUEST", "제목을 입력해 주세요.");
    const recruitStart = req.body.recruitStart || null;
    const recruitEnd = req.body.recruitEnd || null;
    const interviewStart = req.body.interviewStart || null;
    const interviewEnd = req.body.interviewEnd || null;
    for (const [label, value] of [["모집 시작", recruitStart], ["모집 종료", recruitEnd], ["면접 시작", interviewStart], ["면접 종료", interviewEnd]]) {
      if (!value) continue;
      const parsed = new Date(value);
      if (
        Number.isNaN(parsed.getTime()) ||
        parsed.getMinutes() % 10 !== 0 ||
        parsed.getSeconds() !== 0
      ) {
        return fail(res, 400, "INVALID_RECRUIT_PERIOD", `${label} 시간은 10분 단위로 입력해 주세요.`);
      }
    }
    if (recruitStart && recruitEnd && new Date(recruitStart) >= new Date(recruitEnd)) {
      return fail(res, 400, "INVALID_RECRUIT_PERIOD", "모집 종료는 시작보다 늦어야 합니다.");
    }
    if (interviewStart && interviewEnd && new Date(interviewStart) >= new Date(interviewEnd)) {
      return fail(res, 400, "INVALID_INTERVIEW_PERIOD", "면접 종료는 시작보다 늦어야 합니다.");
    }
    const posters = req.body.posters;
    if (Array.isArray(posters) && posters.length > 10) {
      return fail(res, 400, "TOO_MANY_POSTERS", "모집 포스터는 최대 10장까지 등록할 수 있습니다.");
    }
    if (Array.isArray(posters)) {
      const estimatedBytes = posters.reduce((total, poster) => {
        const base64 = String(poster?.dataUrl || "").split(",", 2)[1] || "";
        return total + Math.floor(base64.length * 3 / 4);
      }, 0);
      if (estimatedBytes > 10 * 1024 * 1024) {
        return fail(res, 400, "POSTERS_TOO_LARGE", "모집 포스터 전체 용량은 10MB 이하여야 합니다.");
      }
    }
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const canChangeGoogleForm = existing[0].status === "draft";
      let submittedFormId = existing[0].form_id;
      let storedFormUrl = existing[0].form_url;
      if (canChangeGoogleForm) {
        const submittedFormUrl = String(req.body.formUrl || "").trim();
        submittedFormId = submittedFormUrl
          ? extractFormIdFromURL(submittedFormUrl)
          : null;
        if (submittedFormUrl && !submittedFormId) {
          const formError = new Error("Google Form 링크 형식을 확인해 주세요.");
          formError.code = "INVALID_FORM_URL";
          throw formError;
        }
        storedFormUrl = submittedFormId
          ? `https://docs.google.com/forms/d/${submittedFormId}/viewform`
          : null;
      }
      if (submittedFormId) {
        await connection.execute(
          `INSERT INTO formlist (id, title, form_type)
           VALUES (?, ?, '신규모집')
           ON DUPLICATE KEY UPDATE title = VALUES(title), form_type = '신규모집'`,
          [submittedFormId, title],
        );
      }
      await connection.execute(
        `UPDATE recruitment_instances
            SET title = ?, recruit_start = ?, recruit_end = ?, interview_start = ?, interview_end = ?, form_id = ?, form_url = ?, promotion_copy = ?
          WHERE id = ?`,
        [
          title,
          recruitStart,
          recruitEnd,
          interviewStart,
          interviewEnd,
          submittedFormId,
          storedFormUrl,
          req.body.promotionCopy || null,
          req.params.id,
        ],
      );
      if (Array.isArray(posters)) {
        await connection.execute("DELETE FROM recruitment_posters WHERE recruitment_id = ?", [req.params.id]);
        for (const [index, poster] of posters.entries()) {
          const upload = decodeBase64File(
            poster.dataUrl,
            ["image/jpeg", "image/png", "image/webp"],
            8 * 1024 * 1024,
          );
          await connection.execute(
            `INSERT INTO recruitment_posters
              (recruitment_id, file_name, mime_type, file_data, sort_order)
             VALUES (?, ?, ?, ?, ?)`,
            [req.params.id, String(poster.fileName || `poster-${index + 1}`), upload.mimeType, upload.buffer, index],
          );
        }
      }
      await connection.commit();
      ok(res, { id: Number(req.params.id) });
    } catch (error) {
      await connection.rollback();
      if (["INVALID_UPLOAD", "INVALID_FORM_URL"].includes(error.code)) return fail(res, 400, error.code, error.message);
      if (error.code === "ER_DUP_ENTRY") return fail(res, 409, "FORM_ALREADY_LINKED", "해당 Google Form은 다른 모집에 연결되어 있습니다.");
      throw error;
    } finally {
      connection.release();
    }
  }),
);

router.delete(
  "/recruit/instances/:id",
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    const existing = await query(
      "SELECT id, form_id FROM recruitment_instances WHERE id = ? LIMIT 1",
      [req.params.id],
    );
    if (!existing[0]) {
      return fail(res, 404, "NOT_FOUND", "모집 인스턴스를 찾지 못했습니다.");
    }

    const formId = existing[0].form_id;
    if (formId) {
      try {
        // 2026-08-23: Move the recruitment-owned Google Form to Drive trash before removing its local records.
        const { drive } = getOAuthClients();
        await drive.files.update({
          fileId: formId,
          requestBody: { trashed: true },
          fields: "id,trashed",
        });
      } catch (error) {
        const googleStatus = Number(error?.response?.status || error?.code);
        if (googleStatus !== 404) {
          if (isOAuthReconnectRequired(error)) {
            return fail(res, 409, "GOOGLE_OAUTH_RECONNECT_REQUIRED", "Google 계정을 다시 연결한 뒤 삭제해 주세요.");
          }
          return fail(res, 409, "GOOGLE_FORM_DELETE_FAILED", "연결된 Google Form을 삭제하지 못해 모집 삭제를 중단했습니다.");
        }
      }
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      // 2026-08-23: Cascades remove posters/plans and all form questions, responses, applicants, and schedules.
      await connection.execute("DELETE FROM recruitment_instances WHERE id = ?", [req.params.id]);
      if (formId) {
        await connection.execute("DELETE FROM formlist WHERE id = ?", [formId]);
      }
      await connection.commit();
      return ok(res, {
        id: Number(req.params.id),
        googleFormMovedToTrash: Boolean(formId),
      });
    } catch (error) {
      await connection.rollback();
      if (formId) {
        try {
          // 2026-08-23: Compensate for a local transaction failure by restoring the external form.
          const { drive } = getOAuthClients();
          await drive.files.update({
            fileId: formId,
            requestBody: { trashed: false },
            fields: "id,trashed",
          });
        } catch (restoreError) {
          console.error(
            "Recruitment Google Form restore failed after database rollback.",
            { status: restoreError?.response?.status || restoreError?.code || "unknown" },
          );
        }
      }
      throw error;
    } finally {
      connection.release();
    }
  }),
);

router.get(
  "/recruit/instances/:id/posters/:posterId",
  asyncHandler(async (req, res) => {
    const posters = await query(
      `SELECT rp.file_name, rp.mime_type, rp.file_data
         FROM recruitment_posters rp
         JOIN recruitment_instances ri ON ri.id = rp.recruitment_id
        WHERE rp.id = ? AND rp.recruitment_id = ?
          AND (ri.status = 'recruiting' OR ? >= 3)
        LIMIT 1`,
      [req.params.posterId, req.params.id, sessionAuthorityRank(req.session?.authority)],
    );
    if (!posters[0]) return fail(res, 404, "NOT_FOUND", "포스터를 찾지 못했습니다.");
    res.set("Content-Type", posters[0].mime_type);
    res.set("Cache-Control", "public, max-age=300");
    return res.send(posters[0].file_data);
  }),
);

router.post(
  "/recruit/instances/:id/start",
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    const instances = await query(
      "SELECT * FROM recruitment_instances WHERE id = ? LIMIT 1",
      [req.params.id],
    );
    const instance = instances[0];
    if (!instance) return fail(res, 404, "NOT_FOUND", "모집 인스턴스를 찾지 못했습니다.");
    if (instance.status !== "draft") return fail(res, 409, "INVALID_TRANSITION", "초안만 모집을 시작할 수 있습니다.");
    if (!instance.form_id) return fail(res, 409, "FORM_REQUIRED", "Google Form을 먼저 생성하거나 연결해 주세요.");
    if (!instance.interview_start || !instance.interview_end) return fail(res, 409, "INTERVIEW_PERIOD_REQUIRED", "면접 시작·종료 일시를 먼저 저장해 주세요.");
    try {
      const { forms } = getOAuthClients();
      const formResponse = await forms.forms.get({ formId: instance.form_id });
      if (formResponse.data.publishSettings && forms.forms.setPublishSettings) {
        await forms.forms.setPublishSettings({
          formId: instance.form_id,
          requestBody: {
            publishSettings: { publishState: { isPublished: true, isAcceptingResponses: true } },
            updateMask: "publishState",
          },
        });
      }
    } catch (error) {
      if (isOAuthReconnectRequired(error)) {
        return fail(res, 409, "GOOGLE_OAUTH_RECONNECT_REQUIRED", "Google 계정을 다시 연결해 주세요.");
      }
      return fail(res, 409, "GOOGLE_FORM_NOT_FOUND", "연결한 Google Form을 확인할 수 없습니다.");
    }
    await db.execute("UPDATE recruitment_instances SET status = 'recruiting' WHERE id = ?", [req.params.id]);
    ok(res, { status: "recruiting" });
  }),
);

router.post(
  "/recruit/instances/:id/interview-plan",
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    const instances = await query(
      `SELECT ri.*, ip.id AS plan_id
         FROM recruitment_instances ri
         LEFT JOIN interview_plans ip ON ip.recruitment_id = ri.id
        WHERE ri.id = ? LIMIT 1`,
      [req.params.id],
    );
    const instance = instances[0];
    if (!instance || !instance.form_id) return fail(res, 409, "FORM_REQUIRED", "연결된 Google Form이 필요합니다.");
    if (instance.status !== "planning") return fail(res, 409, "INVALID_TRANSITION", "면접 계획 상태에서만 계획을 작성할 수 있습니다.");
    if (instance.plan_id) return ok(res, { id: instance.plan_id, path: `/recruit/interview/plans/${instance.plan_id}/edit/interviewers` });
    const [result] = await db.execute(
      `INSERT INTO interview_plans (form_id, recruitment_id, title, status, created_by, updated_by, panel_size)
       VALUES (?, ?, ?, 'draft', ?, ?, 2)`,
      [instance.form_id, instance.id, `${instance.title} 면접 계획`, req.session.userId, req.session.userId],
    );
    // 2026-08-23: Enter the linked plan directly at interviewer assignment, not the generic new-plan intro.
    created(res, { id: result.insertId, path: `/recruit/interview/plans/${result.insertId}/edit/interviewers` });
  }),
);

router.post(
  "/recruit/instances/:id/finish-recruiting",
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    const instances = await query(
      `SELECT ri.*, ip.id AS plan_id, ip.status AS plan_status
         FROM recruitment_instances ri
         LEFT JOIN interview_plans ip ON ip.recruitment_id = ri.id
        WHERE ri.id = ? LIMIT 1`,
      [req.params.id],
    );
    const instance = instances[0];
    if (!instance) return fail(res, 404, "NOT_FOUND", "모집 인스턴스를 찾지 못했습니다.");
    if (instance.status !== "recruiting") return fail(res, 409, "INVALID_TRANSITION", "모집 상태에서만 모집을 종료할 수 있습니다.");
    try {
      // 2026-08-20: Current Google Forms API publish settings close responses before UCMS enters interview state.
      const { forms } = getOAuthClients();
      const formResponse = await forms.forms.get({ formId: instance.form_id });
      if (!formResponse.data.publishSettings || !forms.forms.setPublishSettings) {
        return fail(res, 409, "FORM_CLOSE_UNSUPPORTED", "이 Google Form은 API 응답 종료를 지원하지 않습니다. 새 형식의 폼을 연결해 주세요.");
      }
      await forms.forms.setPublishSettings({
        formId: instance.form_id,
        requestBody: {
          publishSettings: { publishState: { isPublished: true, isAcceptingResponses: false } },
          updateMask: "publishState",
        },
      });
    } catch (error) {
      if (isOAuthReconnectRequired(error)) {
        return fail(res, 409, "GOOGLE_OAUTH_RECONNECT_REQUIRED", "Google 계정을 다시 연결해 주세요.");
      }
      return fail(res, 409, "GOOGLE_FORM_CLOSE_FAILED", "Google Form 응답 접수를 종료하지 못했습니다.");
    }
    // 2026-08-23: Closing intake now enters a distinct interview-planning phase.
    await db.execute(
      `UPDATE recruitment_instances
          SET status = 'planning',
              snapshot_applicant_count = (SELECT COUNT(*) FROM recruiting_members WHERE form_id = ?)
        WHERE id = ?`,
      [instance.form_id, req.params.id],
    );
    ok(res, { status: "planning" });
  }),
);

router.post(
  "/recruit/instances/:id/start-interview",
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    const instances = await query(
      `SELECT ri.*, ip.id AS plan_id, ip.status AS plan_status
         FROM recruitment_instances ri
         LEFT JOIN interview_plans ip ON ip.recruitment_id = ri.id
        WHERE ri.id = ? LIMIT 1`,
      [req.params.id],
    );
    const instance = instances[0];
    if (!instance) return fail(res, 404, "NOT_FOUND", "모집 인스턴스를 찾지 못했습니다.");
    if (instance.status !== "planning") return fail(res, 409, "INVALID_TRANSITION", "면접 계획 상태에서만 면접을 시작할 수 있습니다.");
    if (!instance.plan_id || instance.plan_status !== "active") return fail(res, 409, "CONFIRMED_PLAN_REQUIRED", "확정된 면접 계획이 필요합니다.");
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute("UPDATE recruiting_members SET rating = '불합격' WHERE form_id = ? AND rating <> '1차합격'", [instance.form_id]);
      await connection.execute(
        `UPDATE recruitment_instances
            SET status = 'interview', interview_started_at = CURRENT_TIMESTAMP,
                snapshot_first_pass_count = (SELECT COUNT(*) FROM recruiting_members WHERE form_id = ? AND rating = '1차합격')
          WHERE id = ?`,
        [instance.form_id, req.params.id],
      );
      await connection.commit();
      ok(res, { status: "interview" });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

router.post(
  "/recruit/instances/:id/finish-interview",
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    const instances = await query(
      "SELECT id, form_id, status FROM recruitment_instances WHERE id = ? LIMIT 1",
      [req.params.id],
    );
    const instance = instances[0];
    if (!instance) return fail(res, 404, "NOT_FOUND", "모집 인스턴스를 찾지 못했습니다.");
    if (instance.status !== "interview") return fail(res, 409, "INVALID_TRANSITION", "면접 상태에서만 종료할 수 있습니다.");
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        "UPDATE recruiting_members SET rating = '불합격' WHERE form_id = ? AND rating <> '최종합격'",
        [instance.form_id],
      );
      await connection.execute(
        "UPDATE interview_plans SET status = 'completed', updated_by = ? WHERE recruitment_id = ?",
        [req.session.userId, instance.id],
      );
      await connection.execute(
        `UPDATE recruitment_instances
            SET status = 'interview_completed',
                closed_at = CURRENT_TIMESTAMP,
                snapshot_final_pass_count = (SELECT COUNT(*) FROM recruiting_members WHERE form_id = ? AND rating = '최종합격')
          WHERE id = ?`,
        [instance.form_id, req.params.id],
      );
      await connection.commit();
      ok(res, { status: "interview_completed", resultVisibleDays: 3 });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }),
);

router.post(
  "/recruit/instances/:id/register-final-members",
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    // 2026-08-23: Spring atomically validates, links, and promotes final-pass applicants before closure.
    const generation = Number(req.body.generation);
    if (!Number.isInteger(generation) || generation < 1 || generation > 999) {
      return fail(res, 400, "INVALID_GENERATION", "기수는 1부터 999 사이의 정수로 입력해 주세요.");
    }
    const result = await registerFinalMembers(req.params.id, req.session.userId, generation);
    ok(res, result);
  }),
);

router.get(
  "/recruit/forms",
  requireAuthority(3),
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
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    // 2026-08-23: Refresh an empty local question cache before deriving interview dates.
    let questions = await query(
      `SELECT question_id, question
         FROM form_questions
        WHERE form_id = ?
        ORDER BY idx ASC`,
      [req.params.id],
    );
    if (questions.length === 0) {
      try {
        await Form.loadFormStructure(req.params.id);
        questions = await query(
          `SELECT question_id, question
             FROM form_questions
            WHERE form_id = ?
            ORDER BY idx ASC`,
          [req.params.id],
        );
      } catch (error) {
        if (isOAuthReconnectRequired(error)) {
          return fail(res, 409, "GOOGLE_OAUTH_RECONNECT_REQUIRED", "Google 계정을 다시 연결해 주세요.");
        }
        return fail(res, 409, "GOOGLE_FORM_SYNC_FAILED", "Google Form 질문을 동기화하지 못했습니다.");
      }
    }
    const dates = [];
    // 2026-08-23: Accept both 8/24(월) and 8월 24일 (월) question title formats.
    const datePattern = /(\d{1,2})\s*(?:\/|월\s*)(\d{1,2})\s*(?:일)?\s*(\([월화수목금토일]\))?/g;
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
          date: `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}${match[3] || ""}`,
          questionId: question.question_id,
        });
      }
    }
    if (dates.length === 0) {
      return fail(
        res,
        422,
        "INTERVIEW_DATE_QUESTIONS_NOT_FOUND",
        "지원 폼에서 '면접 가능 시간'과 날짜가 포함된 질문을 찾지 못했습니다. Google Form 질문 제목을 확인해 주세요.",
      );
    }
    ok(res, { dates });
  }),
);

router.get(
  "/recruit/responses",
  requireAuthority(3),
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

router.post("/recruit/sync", requireAuthority(3), (req, res) => {
  ok(res, {
    syncedCount: 0,
    message: "Recruit sync remains in the legacy Google Forms flow.",
  });
});

router.patch(
  "/recruit/responses/:id/rating",
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    if (!req.body.rating) {
      return fail(res, 400, "INVALID_REQUEST", "rating is required.");
    }
    if (!RECRUIT_RATINGS.has(req.body.rating)) {
      return fail(res, 400, "INVALID_RATING", "지원하지 않는 평가 상태입니다.");
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
  requireAuthority(3),
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
  requireAuthority(3),
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

router.post(
  "/recruit/responses/:id/shared-document/ticket",
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    // 2026-08-19: Scope every realtime credential to the applicant document verified by the authenticated REST API.
    const applicants = await query(
      "SELECT response_id, form_id FROM recruiting_members WHERE id = ?",
      [req.params.id],
    );
    if (!applicants[0]) {
      return fail(res, 404, "NOT_FOUND", "Recruit response not found.");
    }

    const documentId = `response-${applicants[0].response_id}`;
    const formId = String(applicants[0].form_id);
    const credential = createShareDbTicket({
      userId: req.session.userId,
      authority: sessionAuthorityRank(req.session.authority),
      documentId,
      formId,
    });
    ok(res, { ...credential, documentId, formId });
  }),
);

router.put(
  "/recruit/responses/:id/shared-document",
  requireAuthority(3),
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
  requireAuthority(3),
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
        recruitmentId: plan.recruitment_id ? Number(plan.recruitment_id) : null,
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
  requireAuthority(3),
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
                  interviewee.response_id,
                  isl.location
             FROM interview_schedules s
             LEFT JOIN members interviewer
               ON interviewer.student_id = s.interviewer_id
             LEFT JOIN recruiting_members interviewee
               ON interviewee.student_id = s.interviewee_id
              AND interviewee.form_id = ?
            LEFT JOIN interview_slot_locations isl
              ON isl.plan_id = s.plan_id
             AND isl.interview_date = s.interview_date
             AND isl.time_slot = s.time_slot
            WHERE s.plan_id = ?
            ORDER BY s.interview_date, s.time_slot, s.interviewee_id`,
          [plan.form_id, plan.id],
        );
        return {
          plan: {
            id: plan.id,
            recruitmentId: plan.recruitment_id ? Number(plan.recruitment_id) : null,
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
  requireAuthority(3),
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
      let planId = Number(req.body.planId || 0);
      if (planId) {
        // 2026-08-23: Editing a draft or confirmed plan reuses its linked record and invalidates the old schedule.
        const [drafts] = await connection.execute(
          `SELECT id FROM interview_plans
            WHERE id = ? AND form_id = ? AND status IN ('draft', 'active')
            FOR UPDATE`,
          [planId, req.body.formId],
        );
        if (!drafts[0]) {
          const draftError = new Error("편집할 수 있는 면접 계획 초안을 찾지 못했습니다.");
          draftError.code = "INTERVIEW_DRAFT_NOT_FOUND";
          throw draftError;
        }
        await connection.execute(
          `UPDATE interview_plans
              SET title = ?, status = 'draft', updated_by = ?, panel_size = ?
            WHERE id = ?`,
          [req.body.title, req.session.userId, Math.max(1, Number(req.body.panelSize || 2)), planId],
        );
        await connection.execute("DELETE FROM interview_schedules WHERE plan_id = ?", [planId]);
        await connection.execute("DELETE FROM interviewer_time_slots WHERE plan_id = ?", [planId]);
        await connection.execute("DELETE FROM interview_interviewers WHERE plan_id = ?", [planId]);
        await connection.execute("DELETE FROM interview_dates WHERE plan_id = ?", [planId]);
        await connection.execute("DELETE FROM interview_slot_locations WHERE plan_id = ?", [planId]);
      } else {
        const [linkedRecruitments] = await connection.execute(
          "SELECT id FROM recruitment_instances WHERE form_id = ? AND status IN ('draft', 'recruiting', 'planning', 'interview') ORDER BY id DESC LIMIT 1",
          [req.body.formId],
        );
        const [result] = await connection.execute(
          `INSERT INTO interview_plans
           (form_id, recruitment_id, title, status, created_by, updated_by, panel_size)
           VALUES (?, ?, ?, 'draft', ?, ?, ?)`,
          [
            req.body.formId,
            linkedRecruitments[0]?.id || null,
            req.body.title,
            req.session.userId,
            req.session.userId,
            Math.max(1, Number(req.body.panelSize || 2)),
          ],
        );
        planId = result.insertId;
      }
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
      // 2026-08-20: A venue belongs to a plan/date/time slot and is shared by every scheduled participant in it.
      for (const slot of req.body.slotLocations || []) {
        if (!slot.date || !slot.timeSlot || !String(slot.location || "").trim()) continue;
        await connection.execute(
          `INSERT INTO interview_slot_locations (plan_id, interview_date, time_slot, location)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE location = VALUES(location)`,
          [planId, slot.date, slot.timeSlot, String(slot.location).trim()],
        );
      }
      await connection.commit();
      created(res, { id: planId, path: `/recruit/interview/plans/${planId}` });
    } catch (error) {
      await connection.rollback();
      if (error.code === "INTERVIEW_DRAFT_NOT_FOUND") {
        return fail(res, 409, error.code, error.message);
      }
      if (error.code === "ER_DUP_ENTRY") {
        return fail(res, 409, "INTERVIEW_PLAN_ALREADY_LINKED", "해당 모집에는 이미 면접 계획이 있습니다.");
      }
      throw error;
    } finally {
      connection.release();
    }
  }),
);

router.get(
  "/interview/interviewers",
  requireAuthority(3),
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
  requireAuthority(3),
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
              interviewee.name AS applicant_name,
              isl.location
         FROM interview_schedules s
         LEFT JOIN members interviewer ON interviewer.student_id = s.interviewer_id
         LEFT JOIN recruiting_members interviewee
           ON interviewee.student_id = s.interviewee_id
          AND interviewee.form_id = ?
        LEFT JOIN interview_slot_locations isl
          ON isl.plan_id = s.plan_id
         AND isl.interview_date = s.interview_date
         AND isl.time_slot = s.time_slot
        WHERE s.plan_id = ?
        ORDER BY s.interview_date, s.time_slot`,
      [plan.form_id, req.params.id],
    );
    const slotLocations = await query(
      `SELECT interview_date, time_slot, location
         FROM interview_slot_locations
        WHERE plan_id = ?
        ORDER BY interview_date, time_slot`,
      [req.params.id],
    );
    ok(res, {
      plan: {
        id: plan.id,
        recruitmentId: plan.recruitment_id ? Number(plan.recruitment_id) : null,
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
      slotLocations: slotLocations.map((slot) => ({
        date: slot.interview_date,
        timeSlot: slot.time_slot,
        location: slot.location,
      })),
    });
  }),
);

router.post(
  "/interview/plans/:id/status",
  requireAuthority(3),
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
    const plans = await query(
      `SELECT ip.id, ip.status, ip.recruitment_id, ri.status AS recruitment_status
         FROM interview_plans ip
         LEFT JOIN recruitment_instances ri ON ri.id = ip.recruitment_id
        WHERE ip.id = ? LIMIT 1`,
      [req.params.id],
    );
    if (!plans[0]) return fail(res, 404, "NOT_FOUND", "면접 계획을 찾지 못했습니다.");
    if (
      plans[0].recruitment_id &&
      (req.body.status === "completed" || plans[0].recruitment_status === "interview")
    ) {
      // 2026-08-21: Linked interview completion must atomically close the recruitment and reject non-final applicants.
      return fail(res, 409, "RECRUITMENT_CLOSE_REQUIRED", "모집 상세의 면접 종료 버튼을 사용해 주세요.");
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
  requireAuthority(3),
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
  requireAuthority(3),
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
  requireAuthority(3),
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
        canEdit: sessionAuthorityRank(req.session.authority) >= 3,
        canDelete: sessionAuthorityRank(req.session.authority) >= 3,
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
  requireAuthority(3),
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
  requireAuthority(3),
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
  requireAuthority(3),
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
  requireAuthority(3),
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
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    // 2026-07-23: Settlement deletion mirrors the management action visible in the EJS overview.
    await db.execute("DELETE FROM settlements WHERE id = ?", [req.params.id]);
    ok(res, { id: Number(req.params.id), message: "Settlement deleted." });
  }),
);

router.get(
  "/pos/instances",
  asyncHandler(async (req, res) => {
    await Pos.closeExpiredInstances();
    ok(res, {
      instances: (await Pos.findAllInstances()).map(mapPosInstance),
      canCreate: sessionAuthorityRank(req.session.authority) >= 3,
    });
  }),
);

router.post(
  "/pos/instances",
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    let poster = null;
    try {
      poster = decodeBase64File(req.body.posterDataUrl, ["application/pdf"], 10 * 1024 * 1024);
    } catch (error) {
      return fail(res, 400, error.code || "INVALID_UPLOAD", error.message);
    }
    const autoCloseAt = req.body.autoCloseAt ? new Date(req.body.autoCloseAt) : null;
    if (autoCloseAt && Number.isNaN(autoCloseAt.getTime())) {
      return fail(res, 400, "INVALID_CLOSE_TIME", "자동 판매 종료 시간을 확인해 주세요.");
    }
    if (poster && poster.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return fail(res, 400, "INVALID_PDF", "올바른 PDF 파일을 업로드해 주세요.");
    }
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
      poster_file_name: poster ? String(req.body.posterFileName || "poster.pdf") : null,
      poster_pdf: poster?.buffer || null,
      promotion_copy: String(req.body.promotionCopy || "").trim() || null,
      auto_close_at: autoCloseAt,
    });
    created(res, { id, path: `/pos/instances/${id}` });
  }),
);

// 2026-08-20: Navigation and dashboard share one active POS promotion contract.
router.get(
  "/pos/active",
  asyncHandler(async (_req, res) => {
    const promotion = await Pos.getActivePromotion();
    ok(res, {
      instance: promotion
        ? {
            ...mapPosInstance(promotion),
            initialStock: promotion.initial_stock,
            soldQuantity: promotion.sold_quantity,
            saleRate: promotion.sale_rate,
          }
        : null,
    });
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
      canManage: sessionAuthorityRank(req.session.authority) >= 3,
    });
  }),
);

router.get(
  "/pos/instances/:id/poster",
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT poster_file_name, poster_mime_type, poster_pdf
         FROM pos_instances
        WHERE id = ? AND (status = 'active' OR ? >= 3)
        LIMIT 1`,
      [req.params.id, sessionAuthorityRank(req.session?.authority)],
    );
    if (!result[0]?.poster_pdf) return fail(res, 404, "NOT_FOUND", "POS 포스터를 찾지 못했습니다.");
    res.set("Content-Type", result[0].poster_mime_type || "application/pdf");
    res.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(result[0].poster_file_name || "poster.pdf")}`);
    res.set("Cache-Control", "public, max-age=300");
    return res.send(result[0].poster_pdf);
  }),
);

router.patch(
  "/pos/instances/:id/status",
  requireAuthority(3),
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
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    // 2026-08-23: Spring rechecks authority and blocks edits while an instance is actively selling.
    const result = await updatePosInstance(req.params.id, req.session.userId, req.body || {});
    ok(res, result);
  }),
);

router.delete(
  "/pos/instances/:id",
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    await db.execute("DELETE FROM pos_instances WHERE id = ?", [req.params.id]);
    ok(res, { message: "POS instance deleted." });
  }),
);

router.post(
  "/pos/instances/:id/open",
  requireAuthority(3),
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
  requireAuthority(3),
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
      canManage: sessionAuthorityRank(req.session.authority) >= 3,
    });
  }),
);

router.delete(
  "/pos/records/:recordId",
  requireAuthority(3),
  asyncHandler(async (req, res) => {
    await db.execute("DELETE FROM pos_receipts WHERE id = ?", [
      req.params.recordId,
    ]);
    ok(res, { message: "POS record deleted." });
  }),
);

router.post(
  "/pos/instances/:id/records/clear",
  requireAuthority(3),
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
    // 2026-08-20: Anonymous lookup requires three matching applicant attributes and is limited to the published result window.
    const rateLimit = consumeLookupAttempt(`public-result:${req.ip}`);
    setLookupRateLimitHeaders(res, rateLimit);
    if (!rateLimit.allowed) {
      return fail(res, 429, "RATE_LIMITED", "조회 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
    }
    const studentId = normalizeStudentId(req.body.studentId);
    const submittedName = normalizeName(req.body.name);
    const submittedPhone = normalizePhone(req.body.phone);
    if (!studentId || !submittedName || submittedPhone.length < 10) {
      return fail(res, 400, "INVALID_REQUEST", "학번, 이름, 지원서에 작성한 전화번호를 모두 입력해 주세요.");
    }
    const result = await query(
      `SELECT rm.*, fl.title AS form_title,
              ri.status AS recruitment_status,
              ri.closed_at,
              ip.id AS plan_id
         FROM recruiting_members rm
         LEFT JOIN formlist fl ON fl.id = rm.form_id
         JOIN recruitment_instances ri ON ri.form_id = rm.form_id
         LEFT JOIN interview_plans ip ON ip.form_id = rm.form_id
        WHERE rm.student_id = ?
          AND (ri.status IN ('interview', 'interview_completed')
               OR (ri.status = 'closed' AND ri.closed_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 3 DAY)))
        ORDER BY rm.synced_at DESC`,
      [studentId],
    );
    const verified = result.filter(
      (row) => normalizeName(row.name) === submittedName && normalizePhone(row.phone) === submittedPhone,
    );
    const results = await Promise.all(verified.map(async (row) => {
      const schedules = row.plan_id
        ? await query(
            `SELECT s.interview_date, s.time_slot, isl.location, ip.title AS plan_title
               FROM interview_schedules s
               JOIN interview_plans ip ON ip.id = s.plan_id
               LEFT JOIN interview_slot_locations isl
                 ON isl.plan_id = s.plan_id
                AND isl.interview_date = s.interview_date
                AND isl.time_slot = s.time_slot
              WHERE s.plan_id = ? AND s.interviewee_id = ?
              ORDER BY s.interview_date, s.time_slot LIMIT 1`,
            [row.plan_id, row.student_id],
          )
        : [];
      const schedule = schedules[0];
      const rating = row.recruitment_status === "interview" && row.rating === "최종합격"
        ? "1차합격"
        : row.rating;
      return {
        formTitle: row.form_title,
        name: row.name,
        major: row.major,
        rating,
        phase: row.recruitment_status,
        interviewSchedule: rating === "1차합격" && schedule
          ? {
              planTitle: schedule.plan_title,
              interviewDate: schedule.interview_date,
              timeSlot: schedule.time_slot,
              location: schedule.location,
            }
          : null,
      };
    }));
    ok(res, {
      results,
    });
  }),
);

router.post(
  "/public/recruit-responses/search",
  asyncHandler(async (req, res) => {
    // 2026-08-22: Use the verified UCMS account's name, phone, and student ID; never trust lookup identity from the request body.
    if (!req.session?.userId) {
      return fail(res, 401, "UNAUTHORIZED", "로그인이 필요합니다.");
    }
    const rateLimit = consumeLookupAttempt(`${req.ip}:${req.session.userId}`);
    setLookupRateLimitHeaders(res, rateLimit);
    if (!rateLimit.allowed) {
      return fail(
        res,
        429,
        "RATE_LIMITED",
        "조회 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
      );
    }
    const currentUser = await getCurrentUser(req.session.userId);
    const studentId = normalizeStudentId(
      currentUser?.student_id || currentUser?.user_student_id,
    );
    const identity = createVerifiedAccountIdentity(
      currentUser?.member_name || currentUser?.user_name,
      currentUser?.phone || currentUser?.phone_number,
    );
    if (!studentId || !identity) {
      return fail(
        res,
        422,
        "ACCOUNT_IDENTITY_REQUIRED",
        "계정의 이름, 전화번호, 학번 정보가 필요합니다. 내 정보를 확인해 주세요.",
      );
    }
    const result = await findOwnApplications(studentId, identity);
    if (result.length === 0) {
      return fail(
        res,
        404,
        "NOT_FOUND",
        "현재 계정 정보와 일치하는 지원서를 찾을 수 없습니다.",
      );
    }
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
    ok(res, { responses: apiResults });
  }),
);

router.use((err, req, res, next) => {
  if (err.code === "NOT_SALESMAN") {
    return fail(res, 403, "FORBIDDEN", err.message);
  }
  // 2026-08-22: Preserve typed API errors while keeping internal database/Google API details out of responses.
  console.error(
    `${req.method} ${req.originalUrl} API error: ${err?.code || err?.status || "UNKNOWN"} ${err?.message || ""}`,
  );
  const status = Number.isInteger(Number(err?.status)) ? Number(err.status) : 500;
  const safeStatus = status >= 400 && status <= 599 ? status : 500;
  const code = safeStatus < 500 && /^[A-Z0-9_]+$/.test(String(err?.code || ""))
    ? err.code
    : "INTERNAL_SERVER_ERROR";
  return fail(
    res,
    safeStatus,
    code,
    safeStatus < 500 ? err.message : "Internal server error.",
  );
});

module.exports = router;
