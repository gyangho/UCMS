const express = require("express");
const router = express.Router();
const db = require("../models/db");
const fs = require("fs");
const path = require("path");

const InterviewPlan = require("../models/InterviewPlan");
const InterviewSchedule = require("../models/InterviewSchedule");
const Form = require("../models/Form");

router.get("/", async (req, res, next) => {});

// 모집 결과 조회 페이지
router.get("/recruit_result", (req, res) => {
  const interviewPlaces = readInterviewPlaceCSV();
  res.render("recruit_result", { interviewPlaces });
});

// 응답 조회 페이지
router.get("/recruit/response", (req, res) => {
  res.render("recruit_response");
});

// 학번으로 응답 내역 조회 API
router.post("/recruit/response/search", async (req, res) => {
  try {
    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({ error: "학번을 입력해주세요." });
    }

    // 1. form_responses에서 해당 학번의 응답 찾기
    const responseQuery = `
      SELECT fr.*, fl.title as form_title
      FROM form_responses fr
      LEFT JOIN formlist fl ON fr.form_id = fl.id
      WHERE fr.answer = ?
    `;

    const [responses] = await db.execute(responseQuery, [
      `${studentId}`,
    ]);

    if (responses.length === 0) {
      return res
        .status(404)
        .json({ error: "해당 학번의 응답을 찾을 수 없습니다." });
    }

    // 2. 각 응답에 대해 상세 내용 조회
    const results = [];

    for (const response of responses) {
      // 해당 폼의 모든 응답을 id 순으로 조회
      const detailQuery = `
        SELECT * FROM form_responses WHERE form_id = ? AND response_id = ? 
        order by question_id asc
      `;

      const [details] = await db.execute(detailQuery, [
        response.form_id,
        response.response_id,
      ]);

      const questions = await Form.getQuestionsByFormId(
        response.form_id
      );

      results.push({
        form_id: response.form_id,
        form_title: responses[0].form_title,
        response_id: response.response_id,
        responses: questions.map((question) => {
          const answer = details.find(
            (detail) => detail.question_id === question.question_id
          );
          return {
            question: question.question,
            answer: answer.answer,
          };
        }),
      });
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error("응답 조회 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
});

// 학번으로 모집 결과 조회 API
router.post("/recruit_result/search", async (req, res) => {
  try {
    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({ error: "학번을 입력해주세요." });
    }

    // 1. recruiting_members 테이블에서 해당 학번의 데이터 조회
    const memberQuery = `
      SELECT rm.*, fl.title as form_title 
      FROM recruiting_members rm
      LEFT JOIN formlist fl ON rm.form_id = fl.id
      WHERE rm.student_id = ?
      ORDER BY rm.synced_at DESC
    `;

    const [members] = await db.execute(memberQuery, [studentId]);

    if (members.length === 0) {
      return res
        .status(404)
        .json({ error: "해당 학번의 지원 정보를 찾을 수 없습니다." });
    }

    // 2. 각 지원에 대해 rating 정보와 면접 일정 조회
    const results = [];

    for (const member of members) {
      let rating =
        member.rating === "1차합격"
          ? "1차합격"
          : member.rating === "불합격"
          ? "불합격"
          : "평가중";

      let interviewSchedule = null;

      // 1차합격인 경우 면접 일정 조회
      if (member.rating === "1차합격") {
        // 활성화된 면접 계획 조회
        const activePlans =
          await InterviewPlan.getActiveInterviewPlans();

        for (const plan of activePlans) {
          if (plan.form_id === member.form_id) {
            // 해당 plan_id의 면접 스케줄에서 해당 학번의 시간 조회
            const schedules =
              await InterviewSchedule.getInterviewSchedule(plan.id);
            const userSchedule = schedules.find(
              (s) => s.interviewee_id === studentId
            );

            if (userSchedule) {
              interviewSchedule = {
                plan_id: plan.id,
                plan_title: plan.title,
                interview_date: userSchedule.interview_date,
                time_slot: userSchedule.time_slot,
              };
              break;
            }
          }
        }
      } else if (
        member.rating === "최종합격" ||
        member.rating === "1차불합격"
      ) {
        const completedPlans =
          await InterviewPlan.getCompletedInterviewPlans();

        if (completedPlans.length > 0) {
          rating =
            member.rating === "최종합격" ? "최종합격" : "불합격";
        }
      }

      results.push({
        form_title: member.form_title,
        name: member.name,
        major: member.major,
        rating: rating,
        interview_schedule: interviewSchedule,
      });
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error("모집 결과 조회 오류:", error);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
});

// CSV 파일에서 면접 장소 정보 읽기
function readInterviewPlaceCSV() {
  try {
    const csvPath = path.join(__dirname, "../interview_place.csv");
    const csvContent = fs.readFileSync(csvPath, "utf8");
    const lines = csvContent.trim().split("\n");

    // 헤더 제거하고 데이터만 파싱
    const places = lines.slice(1).map((line) => {
      const [date, time, place] = line.split(",");

      // 날짜를 더 간결하게 표시 (예: 9/1(월) -> 9/1)
      const shortDate = date.replace(/\([^)]+\)/g, "");

      // 시간을 더 간결하게 표시 (예: 12:00~15:00 -> 12:00-15:00)
      const shortTime = time.replace(/~/g, "-");

      return {
        date: shortDate,
        time: shortTime,
        place: place.trim(),
      };
    });

    return places;
  } catch (error) {
    console.error("면접 장소 CSV 파일 읽기 오류:", error);
    return [];
  }
}

module.exports = router;
