const express = require("express");
const router = express.Router();
const db = require("../db");
const holiday = require("../extern_apis/holidays");

router.get("/", async (req, res, next) => {
  const authority = req.session.authority;
  const query = `SELECT id, title, start, end, color, ismultiple from events
  where authority < ? AND author_kakao_id != 0 ORDER BY start`;

  try {
    const [events] = await db.query(query, [authority]);
    res.render("event/event_manage", { myEvents: events });
  } catch (err) {
    next(err);
  }
});

router.get("/add", (req, res) => {
  res.render("event/event_form", {
    error: null,
    data: {},
    sessionAuthority: req.session.authority,
  });
});

router.post("/submit", async (req, res, next) => {
  try {
    console.log(req.body);
    const {
      title,
      description,
      start,
      end,
      isrecruiting,
      recruit_start,
      recruit_end,
      color,
      authority,
    } = req.body;

    const author_kakao_id = req.session.kakao_id;
    const updater_id = req.session.kakao_id;

    const isRecruitingBool = isrecruiting === "on" ? 1 : 0;
    let isMultipleBool = false;

    if (new Date(start).toDateString() !== new Date(end).toDateString()) {
      isMultipleBool = true;
    }
    let sql = "";
    if (req.query.id) {
      console.log("[UPDATE]\n" + JSON.stringify(req.body) + "[UPDATE]");
      sql = `
      UPDATE events
      SET
        title            = ?,
        description      = ?,
        start          = ?,
        end            = ?,
        isrecruiting     = ?,
        recruit_start    = ?,
        recruit_end      = ?,
        author_kakao_id  = ?,
        updater_id       = ?,
        color            = ?,
        ismultiple       = ?,
        authority        = ?
      WHERE id = ?
      `;

      await db.query(sql, [
        title,
        description || null,
        start,
        end,
        isRecruitingBool,
        recruit_start || null,
        recruit_end || null,
        author_kakao_id,
        updater_id,
        color || "#43ff7bff",
        isMultipleBool,
        authority,
        req.query.id,
      ]);
    } else {
      console.log("[INSERT]\n" + JSON.stringify(req.body) + "[INSERT]");
      sql = `
      UPDATE events SET 
      (
      title= ?, description=?, start=?, end=?, 
      isrecruiting, recruit_start, recruit_end, 
      author_kakao_id, updater_id, color, ismultiple, authority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
      await db.query(sql, [
        title,
        description || null,
        start,
        end,
        isRecruitingBool,
        recruit_start || null,
        recruit_end || null,
        author_kakao_id,
        updater_id,
        color || "#43ff7bff",
        isMultipleBool,
        authority,
      ]);
    }
    res.status(200);
    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    res.render("event_form", { error: "서버 오류가 발생했습니다.", data: req.body });
  }
});

router.get("/delete", async (req, res, next) => {
  const currentEventId = req.query.id;

  const sql = `
  DELETE FROM events
  WHERE id = ?
  `;

  try {
    const [deleteResult] = await db.execute(sql, [currentEventId]);

    res.status(200);
    res.send();
  } catch (err) {
    return next(err);
  }
});

router.get("/myevents", async (req, res, next) => {
  try {
    const today = new Date();
    const [myEvents] = await db.query(
      `
      SELECT e.id, e.title, e.start, e.end, e.color, e.authority, e.ismultiple 
      FROM events e 
      JOIN event_participants p ON e.id = p.event_id 
      WHERE p.kakao_id = ? 
      ORDER BY e.start ASC`,
      [req.session.kakao_id]
    );
    // 자바스크립트 Date 객체로 변환
    myEvents.forEach((ev) => {
      ev.start = new Date(ev.start);
      ev.end = new Date(ev.end);
    });

    const [recruitingEvents] = await db.query(
      `
      SELECT id, title, start, end, color, authority, ismultiple
      FROM events 
      WHERE isrecruiting = true AND recruit_start <= ? AND recruit_end >= ?
      `,
      [today, today]
    );
    // 자바스크립트 Date 객체로 변환
    recruitingEvents.forEach((ev) => {
      ev.start = new Date(ev.start);
      ev.end = new Date(ev.end);
    });

    return res.render("event/myevents", { myEvents, recruitingEvents });
  } catch (err) {
    return next(err);
  }
});

router.get("/holidays", async (req, res, next) => {
  console.log("[LOG]\t" + new Date().toISOString() + "  " + "공휴일 api 호출 중...");
  const holidays = await holiday.getHolidays(new Date().getFullYear());
  const count = holidays.length;
  console.log("[LOG]\t" + new Date().toISOString() + "  " + "공휴일 api 호출 완료");
  const deleteSql = `
  DELETE FROM events
  WHERE description ="공휴일" AND author_kakao_id = 0
  `;
  const insertSql = `
    INSERT INTO events
      (title, description, start, end,
       author_kakao_id, updater_id, color,
       ismultiple, authority,
       isRecruiting, recruit_start, recruit_end)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  try {
    const deleteRes = await db.execute(deleteSql);
    console.log(
      "[LOG]\t" +
        new Date().toISOString() +
        "  " +
        deleteRes[0].affectedRows +
        "개의 공휴일 삭제 완료"
    );

    for (const h of holidays) {
      // 날짜 문자열 변환
      const s = h.locdate.toString();
      const year = s.slice(0, 4),
        month = s.slice(4, 6),
        day = s.slice(6, 8);
      const start = `${year}-${month}-${day} 00:00:00`;
      const end = `${year}-${month}-${day} 23:59:59`;
      const description = "공휴일";

      const insertParams = [
        h.dateName,
        description,
        start,
        end,
        0,
        0,
        "#ffcccc",
        0,
        "일반",
        false,
        null,
        null,
      ];
      await db.execute(insertSql, insertParams);
    }
    console.log(
      "[LOG]\t" + new Date().toISOString() + "  " + count + "개의 공휴일 추가 완료"
    );
    return res.send(`
    <script>
      alert("공휴일 갱신이 완료되었습니다.");
      window.location.href = "/"; 
    </script>
  `);
  } catch (err) {
    next(err);
  }
});

router.get("/info", async (req, res, next) => {
  const id = req.query.id;
  const eventQuery = `
  SELECT *, CAST(authority AS UNSIGNED) AS authority FROM events
  WHERE id = ?
  `;
  const [eventQueryResult] = await db.query(eventQuery, [id]);
  const currentEvent = eventQueryResult[0];
  currentEvent.start = toInputDate(currentEvent.start);
  currentEvent.end = toInputDate(currentEvent.end);
  if (currentEvent.isRecruiting) {
    currentEvent.recruit_start = toInputDate(currentEvent.recruit_start);
    currentEvent.recruit_end = toInputDate(currentEvent.recruit_end);
  }

  const participantsQuery = `
  SELECT name, kakao_id FROM users
  WHERE kakao_id IN (
    SELECT kakao_id FROM event_participants
    WHERE event_id = ?)
  `;
  const participantsQueryResult = await db.query(participantsQuery, [id]);
  const [participants] = participantsQueryResult;

  console.log(JSON.stringify(currentEvent));

  res.render("event/info", {
    error: null,
    currentEvent,
    data: {},
    sessionAuthority: req.session.authority || "",
    currentKakaoId: req.session.kakao_id,
    participants,
  });
});

router.get("/participate", async (req, res, next) => {
  const currentEventId = req.query.id;
  const currentUserKakaoID = req.session.kakao_id;
  const participateQuery = `
  INSERT  
  INTO event_participants (event_id, kakao_id)
  VALUES(?,?)`;
  try {
    const participateQueryResult = await db.execute(participateQuery, [
      currentEventId,
      currentUserKakaoID,
    ]);

    res.status(200);
    res.send();
  } catch (err) {
    next(err);
  }
});

router.get("/cancel", async (req, res, next) => {
  const currentEventId = req.query.id;
  const currentUserKakaoID = req.session.kakao_id;
  const cancelQuery = `
  DELETE FROM event_participants
  WHERE event_id = ? AND kakao_id = ?
  `;
  try {
    const cancelQueryResult = await db.execute(cancelQuery, [
      currentEventId,
      currentUserKakaoID,
    ]);
    res.status(200);
    res.send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;

function formatKoreanDate(date) {
  const pad = (n) => n.toString().padStart(2, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());

  let hour = date.getHours();
  const min = pad(date.getMinutes());

  // 오전/오후
  const ampm = hour < 12 ? "오전" : "오후";

  // 12시간제로 변환 (0 → 12)
  hour = hour % 12;
  if (hour === 0) hour = 12;
  const hour12 = pad(hour);

  return `${year}-${month}-${day} ${ampm} ${hour12}:${min}`;
}

function toInputDate(dt) {
  if (!dt) return "";
  return dt.toISOString().slice(0, 16);
}
