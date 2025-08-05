const express = require("express");
const router = express.Router();
const path = require("path");

const db = require("../db");
const { forms, drive, extractFormIdFromURL } = require("../extern_apis/googleapis");

let questionMap = {};

router.get("/", async (req, res, next) => {
  try {
    res.json({ success: true });
  } catch (err) {
    console.error(err);
  }
});

router.post("/sync", async (req, res, next) => {
  try {
    const formId = req.body.formId;
    syncResponses(formId);
  } catch (err) {
    return res.next(err);
  }
});

router.get("/responses", async (req, res, next) => {
  const {
    page = 1,
    limit = 10,
    search = "",
    column = "",
    currentFormId = "",
  } = req.query;
  const offset = (page - 1) * limit;

  let whereClause = search && column ? `WHERE ${column} LIKE ?` : "";
  let searchParam = `%${search}%`;
  if (column === "rating") {
    whereClause = `WHERE rating = ?`;
    searchParam = search;
  }
  const countQuery = `SELECT COUNT(*) AS count FROM recruiting_members ${whereClause}`;
  const dataQuery = `SELECT * FROM recruiting_members ${whereClause} ORDER BY id LIMIT ? OFFSET ?`;

  try {
    const [countRows] = await db.query(countQuery, search && column ? [searchParam] : []);

    const total = countRows[0].count;

    const [recruitingMembers] = await db.query(
      dataQuery,
      search && column
        ? [searchParam, Number(limit), Number(offset)]
        : [Number(limit), Number(offset)]
    );

    // currentFormId가 있으면 해당 폼의 제목을 DB에서 가져오기
    let currentForm = {
      title: "",
      formId: "",
    };

    if (currentFormId) {
      try {
        const [formInfo] = await db.execute(
          "SELECT title, id FROM formlist WHERE id = ?",
          [currentFormId]
        );

        if (formInfo.length > 0) {
          currentForm = {
            title: formInfo[0].title,
            formId: formInfo[0].id,
          };
        }
      } catch (err) {
        console.error("폼 정보 가져오기 실패:", err);
      }
    }

    res.render("recruit/recruit_response", {
      recruitingMembers,
      currentPage: Number(page),
      totalPages: Math.ceil(total / limit),
      limit: Number(limit),
      search,
      column,
      currentForm,
    });
  } catch (err) {
    err.code = "불러오기 실패";
    return next(err);
  }
});

router.get("/formlist", async (req, res, next) => {
  const formListquery = `
    SELECT title, id FROM formlist
    WHERE form_type = '신규모집'
  `;
  try {
    const [formList] = await db.execute(formListquery);
    return res.render("recruit/formlist", { forms: formList });
  } catch (err) {
    return next(err);
  }
});

router.post("/formlist", async (req, res, next) => {
  const url = req.body?.newURL || "";

  let formID;
  if (url !== "") {
    formID = extractFormIdFromURL(url);
    if (formID) {
      const sql = `INSERT INTO formlist (title, id) VALUES (?, ?)`;
      await db.execute(sql, [formID, formID]);
      console.log("[LOG]\tADD FORM ID: ", formID);
    } else {
      console.error("URL에서 폼 ID를 추출할 수 없습니다:", url);
      return res.status(400).send("잘못된 구글 폼 URL입니다.");
    }
  } else {
    formID = req.body?.URLSelect || "";
    if (!formID) {
      console.error("선택된 폼이 없습니다");
      return res.status(400).send("폼을 선택해주세요.");
    }
  }

  return res.send(
    `<script> 
      window.sessionStorage.setItem('currentFormID', '${formID}');
      window.location.href = '/recruit/responses?currentFormId=${formID}';
    </script>`
  );
});

// 평가 업데이트 API
router.post("/update-rating", async (req, res, next) => {
  try {
    const { response_id, rating } = req.body;

    if (!response_id || !rating) {
      return res.status(400).json({ error: "필수 파라미터가 누락되었습니다." });
    }

    // 유효한 rating 값인지 확인
    const validRatings = ["대기", "불합격", "느별", "느괜", "느좋", "합격"];
    if (!validRatings.includes(rating)) {
      return res.status(400).json({ error: "유효하지 않은 평가 값입니다." });
    }

    const updateSql = `
      UPDATE recruiting_members 
      SET rating = ? 
      WHERE response_id = ?
    `;

    await db.execute(updateSql, [rating, response_id]);

    console.log(`평가 업데이트: response_id=${response_id}, rating=${rating}`);
    res.json({ success: true, message: "평가가 업데이트되었습니다." });
  } catch (err) {
    console.error("평가 업데이트 실패:", err);
    res.status(500).json({ error: "평가 업데이트에 실패했습니다." });
  }
});

// 응답 상세 페이지
router.get("/detail/:responseId", async (req, res, next) => {
  try {
    const { responseId } = req.params;

    // 지원자 정보 가져오기
    const [memberInfo] = await db.execute(
      "SELECT * FROM recruiting_members WHERE response_id = ?",
      [responseId]
    );

    // 응답 데이터 가져오기
    const [responses] = await db.execute(
      `SELECT fq.question, fr.answer 
       FROM form_responses fr 
       JOIN form_questions fq ON fr.form_id = fq.form_id AND fr.question_id = fq.question_id 
       WHERE fr.response_id = ? 
       ORDER BY fq.question_id`,
      [responseId]
    );

    res.render("recruit/detail", {
      responseId,
      memberInfo: memberInfo[0] || null,
      responses: responses || [],
    });
  } catch (err) {
    console.error("상세 페이지 로드 실패:", err);
    res.status(500).send("상세 페이지를 불러올 수 없습니다.");
  }
});

async function syncResponses(formId) {
  // 폼 구조 최신화
  const questionMap = await loadFormStructure(formId);

  // form_questions에서 특정 질문들의 question_id 가져오기
  const questionIds = await getQuestionIds(formId);
  console.log("찾은 질문 ID들:", questionIds);

  // 응답 읽기
  const resp = await forms.forms.responses.list({ formId });
  const responses = resp.data.responses || [];

  // 각 응답을 처리
  for (const r of responses) {
    const row = { responseId: r.responseId, formId, answers: {} };

    // form_responses 테이블에 저장
    Object.entries(r.answers || {}).forEach(async ([qid, answer]) => {
      // 텍스트 응답 처리 (다른 타입은 필요에 따라 추가)
      if (answer.textAnswers && answer.textAnswers.answers.length) {
        row.answers[qid] = answer.textAnswers.answers.map((a) => a.value).join("; ");
      }

      const formResponseSql = `
        INSERT INTO form_responses 
          (response_id, form_id, question_id, answer)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE answer = VALUES(answer)
      `;
      await db.execute(formResponseSql, [
        row.responseId,
        row.formId,
        qid,
        row.answers[qid],
      ]);
    });

    // recruiting_members 테이블에 저장
    const memberData = {
      response_id: row.responseId,
      student_id: row.answers[questionIds.student_id] || null,
      name: row.answers[questionIds.name] || null,
      major: row.answers[questionIds.major] || null,
      phone: row.answers[questionIds.phone] || null,
      gender: row.answers[questionIds.gender] || null,
    };

    const recruitingMemberSql = `
      INSERT INTO recruiting_members 
        (response_id, student_id, name, major, phone, gender)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        student_id = VALUES(student_id),
        name = VALUES(name),
        major = VALUES(major),
        phone = VALUES(phone),
        gender = VALUES(gender)
    `;

    await db.execute(recruitingMemberSql, [
      memberData.response_id,
      memberData.student_id,
      memberData.name,
      memberData.major,
      memberData.phone,
      memberData.gender,
    ]);

    console.log("저장된 멤버 데이터:", memberData);
  }
}

// 특정 질문들의 question_id를 가져오는 함수
async function getQuestionIds(formId) {
  const questionIds = {
    student_id: null,
    name: null,
    major: null,
    phone: null,
    gender: null,
  };

  try {
    // form_questions에서 특정 키워드가 포함된 질문들을 찾기
    const [studentIdRows] = await db.execute(
      "SELECT question_id FROM form_questions WHERE form_id = ? AND question LIKE '%학번%'",
      [formId]
    );
    if (studentIdRows.length > 0) {
      questionIds.student_id = studentIdRows[0].question_id;
    }

    const [nameRows] = await db.execute(
      "SELECT question_id FROM form_questions WHERE form_id = ? AND question LIKE '%이름%'",
      [formId]
    );
    if (nameRows.length > 0) {
      questionIds.name = nameRows[0].question_id;
    }

    const [majorRows] = await db.execute(
      "SELECT question_id FROM form_questions WHERE form_id = ? AND question LIKE '%학과%' OR question LIKE '%부%'",
      [formId]
    );
    if (majorRows.length > 0) {
      questionIds.major = majorRows[0].question_id;
    }

    const [phoneRows] = await db.execute(
      "SELECT question_id FROM form_questions WHERE form_id = ? AND question LIKE '%전화번호%' OR question LIKE '%연락처%' OR question LIKE '%핸드폰%'",
      [formId]
    );
    if (phoneRows.length > 0) {
      questionIds.phone = phoneRows[0].question_id;
    }

    const [genderRows] = await db.execute(
      "SELECT question_id FROM form_questions WHERE form_id = ? AND question LIKE '%성별%'",
      [formId]
    );
    if (genderRows.length > 0) {
      questionIds.gender = genderRows[0].question_id;
    }

    console.log("찾은 질문 ID들:", questionIds);
    return questionIds;
  } catch (err) {
    console.error("질문 ID 가져오기 실패:", err);
    return questionIds;
  }
}

// ── 폼 구조 가져오기 (질문 ID ↔ 질문 제목 매핑) ──
async function loadFormStructure(formId) {
  const form_questions_sql = `INSERT INTO form_questions (form_id, question_id, question) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE question = VALUES(question)`;
  const title_sql = `UPDATE formlist SET title = ? WHERE id = ?`;
  questionMap = {};
  const res = await forms.forms.get({ formId });
  console.log(res.data.info.title);
  const items = res.data.items || [];
  try {
    await db.execute(title_sql, [res.data.info.title, formId]);
    items.forEach((item) => {
      if (item.questionItem) {
        questionMap[item.questionItem.question.questionId] = item.title;
      }
    });

    for (const [questionId, question] of Object.entries(questionMap)) {
      await db.execute(form_questions_sql, [formId, questionId, question]);
    }
    return questionMap;
  } catch (err) {
    throw (new Error("폼 구조 가져오기 실패").code = "FormStructureLoadError");
  }
}

module.exports = router;
