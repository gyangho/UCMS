const express = require("express");
const router = express.Router();
const path = require("path");
const { google } = require("googleapis");

const db = require("../db");

// ── 1. Google API 인증 (Service Account) ──
const KEYFILEPATH = path.join(__dirname, "../keys/ucms-466410-293c3c8d9c97.json");
// 읽기 전용 응답 스코프
const SCOPES = [
  "https://www.googleapis.com/auth/forms.responses.readonly",
  "https://www.googleapis.com/auth/forms.body.readonly",
];
// JWT 클라이언트 생성
const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILEPATH,
  scopes: SCOPES,
});
const forms = google.forms({ version: "v1", auth });

let questionMap = {};

router.get("/", async (req, res, next) => {
  //   res.sendFile(path.join(__dirname, "../public/views/recruit.html"));

  let formId = "1DPy4uKgSYTF6dfMhN1NqDi-nBIfvEi6Y_gI_RcHFNh4";
  try {
    await syncResponses(formId);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "동기화 실패", details: err.message });
  }
});

router.post("/sync-form", async (req, res) => {
  try {
    const { formId } = req.body;
  } catch (err) {
    if (err === TypeError) return res.status(400).json({ error: "formId가 필요합니다." });
  }
});

router.get("/responses", async (req, res, next) => {
  const { page = 1, limit = 10, search = "", column = "" } = req.query;
  const offset = (page - 1) * limit;

  const whereClause = search && column ? `WHERE ${column} LIKE ?` : "";
  const searchParam = `%${search}%`;

  const countQuery = `SELECT COUNT(*) AS count FROM recruit_responses ${whereClause}`;
  const dataQuery = `SELECT answers_json FROM recruit_responses ${whereClause} ORDER BY id LIMIT ? OFFSET ?`;
  try {
    const [countRows] = await db.query(countQuery, search && column ? [searchParam] : []);
    console.log(countRows);

    const total = countRows[0].count;

    const [members] = await db.query(
      dataQuery,
      search && column
        ? [searchParam, Number(limit), Number(offset)]
        : [Number(limit), Number(offset)]
    );

    res.render("recruit_response", {
      members,
      currentPage: Number(page),
      totalPages: Math.ceil(total / limit),
      limit: Number(limit),
      search,
      column,
    });
  } catch (err) {
    err.code = "부원 목록 불러오기 실패";
    return next(err);
  }
});

async function syncResponses(formId) {
  // 1) 폼 구조 최신화
  await loadFormStructure(formId);

  // 2) 응답 읽기
  const resp = await forms.forms.responses.list({ formId });
  const responses = resp.data.responses || [];

  // 3) 각 응답을 JSON으로 변환하여 저장
  for (const r of responses) {
    const row = { responseId: r.responseId, formId, answers: {} };
    Object.entries(r.answers || {}).forEach(([qid, answer]) => {
      const question = questionMap[qid] || qid;
      // 텍스트 응답 처리 (다른 타입은 필요에 따라 추가)
      if (answer.textAnswers && answer.textAnswers.answers.length) {
        row.answers[question] = answer.textAnswers.answers.map((a) => a.value).join("; ");
      }
    });

    // 4) 중복 방지를 위해 INSERT ... ON DUPLICATE KEY UPDATE
    const sql = `
      INSERT INTO recruit_responses 
        (response_id, form_id, answers_json)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE answers_json = VALUES(answers_json)
    `;
    await db.query(sql, [row.responseId, row.formId, JSON.stringify(row.answers)]);
  }
}

// ── 폼 구조 가져오기 (질문 ID ↔ 질문 제목 매핑) ──
async function loadFormStructure(formId) {
  const res = await forms.forms.get({ formId });
  const items = res.data.items || [];
  questionMap = {};
  items.forEach((item) => {
    if (item.questionItem && item.questionItem.question) {
      questionMap[item.questionItem.question.questionId] =
        item.questionItem.question.title;
    }
  });
}

module.exports = router;
