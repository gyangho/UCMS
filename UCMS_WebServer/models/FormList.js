const db = require("./db");
const googleApis = require("../extern_apis/googleapis");

class FormList {
  //면접 폼 목록 조회
  static async getFormList() {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM formlist ORDER BY created_at DESC"
      );
      return rows;
    } catch (error) {
      throw error;
    }
  }

  //면접 폼 조회
  static async getFormById(id) {
    try {
      const [rows] = await db.execute(
        "SELECT * FROM formlist WHERE id = ?",
        [id]
      );
      return rows[0];
    } catch (error) {
      throw error;
    }
  }

  //폼 추가
  static async createForm(formData) {
    try {
      const [result] = await db.execute(
        "INSERT INTO formlist (title, form_url, created_by) VALUES (?, ?, ?)",
        [formData.title, formData.form_url, formData.created_by]
      );
      return result.insertId;
    } catch (error) {
      throw error;
    }
  }

  //면접 폼 수정
  static async updateForm(id, formData) {
    try {
      await db.execute(
        "UPDATE formlist SET title = ?, form_url = ? WHERE id = ?",
        [formData.title, formData.form_url, id]
      );
    } catch (error) {
      throw error;
    }
  }

  //구글 폼 추가
  static async addForm(url) {
    let formID = googleApis.extractFormIdFromURL(url);
    if (formID) {
      const sql = `INSERT INTO formlist (title, id) VALUES (?, ?)`;
      await db.execute(sql, [formID, formID]);
      console.log("[LOG]\tADD FORM ID: ", formID);
    } else {
      console.error("URL에서 폼 ID를 추출할 수 없습니다:", url);
      throw new Error("잘못된 구글 폼 URL입니다.");
    }
    await this.syncResponses(formID);
    return formID;
  }

  //구글 폼 동기화
  static async syncResponses(formId) {
    // 폼 구조 최신화
    const questionMap = await this.loadFormStructure(formId);

    // form_questions에서 특정 질문들의 question_id 가져오기
    const questionIds = await this.getQuestionIds(formId);
    console.log("찾은 질문 ID들:", questionIds);

    // 응답 읽기
    const resp = await googleApis.saForms.forms.responses.list({
      formId,
    });
    const responses = resp.data.responses || [];

    // 각 응답을 처리
    for (const r of responses) {
      const row = { responseId: r.responseId, formId, answers: {} };

      // form_responses 테이블에 저장
      Object.entries(r.answers || {}).forEach(
        async ([qid, answer]) => {
          // 텍스트 응답 처리 (다른 타입은 필요에 따라 추가)
          if (
            answer.textAnswers &&
            answer.textAnswers.answers.length
          ) {
            row.answers[qid] = answer.textAnswers.answers
              .map((a) => a.value)
              .join("; ");
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
        }
      );

      // recruiting_members 테이블에 저장
      const memberData = {
        form_id: formId,
        response_id: row.responseId,
        student_id: row.answers[questionIds.student_id] || null,
        name: row.answers[questionIds.name] || null,
        major: row.answers[questionIds.major] || null,
        phone: row.answers[questionIds.phone] || null,
        gender: row.answers[questionIds.gender] || null,
      };

      const recruitingMemberSql = `
      INSERT INTO recruiting_members 
        (form_id, response_id, student_id, name, major, phone, gender)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        student_id = VALUES(student_id),
        name = VALUES(name),
        major = VALUES(major),
        phone = VALUES(phone),
        gender = VALUES(gender)
    `;

      await db.execute(recruitingMemberSql, [
        memberData.form_id,
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
  static async getQuestionIds(formId) {
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
  static async loadFormStructure(formId) {
    const form_questions_sql = `INSERT INTO form_questions (form_id, question_id, question) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE question = VALUES(question)`;
    const title_sql = `UPDATE formlist SET title = ? WHERE id = ?`;
    const questionMap = {};
    const res = await googleApis.saForms.forms.get({ formId });
    console.log(res.data.info.title);
    const items = res.data.items || [];
    try {
      await db.execute(title_sql, [res.data.info.title, formId]);
      items.forEach((item) => {
        if (item.questionItem) {
          questionMap[item.questionItem.question.questionId] =
            item.title;
        }
      });

      for (const [questionId, question] of Object.entries(
        questionMap
      )) {
        await db.execute(form_questions_sql, [
          formId,
          questionId,
          question,
        ]);
      }
      return questionMap;
    } catch (err) {
      throw (new Error("폼 구조 가져오기 실패").code =
        "FormStructureLoadError");
    }
  }
}

module.exports = FormList;
