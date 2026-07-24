const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const Recruit = require("../models/Recruit");
const IntervieweeTimeSlots = require("../models/IntervieweeTimeSlots");

const execFileAsync = promisify(execFile);

class InterviewSchedulerError extends Error {
  constructor(message, code = "SCHEDULER_FAILED", status = 422) {
    super(message);
    this.name = "InterviewSchedulerError";
    this.code = code;
    this.status = status;
  }
}

// 2026-07-23: Rebuild applicant availability, run OR-Tools, and atomically replace the saved schedule.
async function generateInterviewSchedule(planId, requestedPanelSize) {
  const plan = await Recruit.getInterviewPlanById(planId);
  if (!plan) {
    throw new InterviewSchedulerError(
      "면접 계획을 찾을 수 없습니다.",
      "PLAN_NOT_FOUND",
      404,
    );
  }

  const parsedPanelSize = Number(
    requestedPanelSize || plan.panel_size || 2,
  );
  if (!Number.isInteger(parsedPanelSize) || parsedPanelSize < 1) {
    throw new InterviewSchedulerError(
      "최소 면접관 수는 1 이상의 정수여야 합니다.",
      "INVALID_PANEL_SIZE",
    );
  }
  const panelSize = parsedPanelSize;
  await rebuildIntervieweeTimeSlots(plan);
  await Recruit.updateInterviewPlanPanelSize(planId, panelSize);

  const interviewerTimeSlots = await Recruit.getInterviewerTimeSlots(planId);
  const intervieweeTimeSlots =
    await IntervieweeTimeSlots.getIntervieweeTimeSlots(planId);
  const interviewDates = (await Recruit.getInterviewDates(planId)).map((item) =>
    normalizeInterviewDate(item.interview_date),
  );
  const interviewerCount = new Set(
    interviewerTimeSlots.map((item) => String(item.interviewer_id)),
  ).size;

  if (interviewerTimeSlots.length === 0) {
    throw new InterviewSchedulerError(
      "선택된 면접관의 가능 시간이 없습니다.",
      "NO_INTERVIEWER_SLOTS",
    );
  }
  if (intervieweeTimeSlots.length === 0) {
    throw new InterviewSchedulerError(
      "1차 합격자의 면접 가능 시간이 없습니다. 지원 폼 응답을 확인해주세요.",
      "NO_INTERVIEWEE_SLOTS",
    );
  }
  if (panelSize > interviewerCount) {
    throw new InterviewSchedulerError(
      `최소 면접관 수(${panelSize}명)가 가능 시간을 등록한 면접관 수(${interviewerCount}명)보다 많습니다.`,
      "INVALID_PANEL_SIZE",
    );
  }

  const input = {
    interviewDates,
    interviewerSlots: interviewerTimeSlots.map((item) => ({
      interviewerId: Number(item.interviewer_id),
      interviewDate: normalizeInterviewDate(item.interview_date),
      timeSlot: item.time_slot,
    })),
    intervieweeSlots: intervieweeTimeSlots.map((item) => ({
      intervieweeId: Number(item.interviewee_id),
      interviewDate: normalizeInterviewDate(item.interview_date),
      timeSlot: item.time_slot,
    })),
    panelSize,
  };

  const schedulerPath = path.join(__dirname, "../InterviewScheduler");
  const executablePath = path.join(schedulerPath, "main.py");
  const inputDirectory = path.join(schedulerPath, "inputs");
  const outputDirectory = path.join(schedulerPath, "outputs");
  const inputFilePath = path.join(inputDirectory, `input_${planId}.json`);
  const outputFilePath = path.join(outputDirectory, `output_${planId}.json`);

  fs.mkdirSync(inputDirectory, { recursive: true });
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(inputFilePath, JSON.stringify(input, null, 2));
  if (fs.existsSync(outputFilePath)) {
    fs.unlinkSync(outputFilePath);
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      "python3",
      [executablePath, String(planId)],
      { cwd: schedulerPath },
    );
    if (stdout) console.log("[Scheduler stdout]:", stdout);
    if (stderr) console.error("[Scheduler stderr]:", stderr);
  } catch (error) {
    throw new InterviewSchedulerError(
      `면접 스케줄러 실행에 실패했습니다: ${error.message}`,
    );
  }

  if (!fs.existsSync(outputFilePath)) {
    throw new InterviewSchedulerError(
      "면접 스케줄 결과 파일이 생성되지 않았습니다.",
    );
  }

  const output = JSON.parse(fs.readFileSync(outputFilePath, "utf8"));
  if (output.status !== "SUCCESS") {
    throw new InterviewSchedulerError(
      output.message || "조건을 만족하는 면접 스케줄을 찾지 못했습니다.",
      "NO_SOLUTION",
    );
  }

  await Recruit.replaceInterviewSchedule(planId, output.schedule || []);
  return {
    output,
    scheduleCount: (output.schedule || []).length,
    panelSize,
  };
}

async function rebuildIntervieweeTimeSlots(plan) {
  const qualifiedMembers = await Recruit.getQualifiedMembers(plan.form_id);
  const interviewDates = await Recruit.getInterviewDatesWithQuestions(plan.id);

  if (qualifiedMembers.length === 0) {
    throw new InterviewSchedulerError(
      "1차 합격 상태인 지원자가 없습니다.",
      "NO_QUALIFIED_APPLICANTS",
    );
  }
  if (interviewDates.length === 0) {
    throw new InterviewSchedulerError(
      "면접 날짜가 설정되지 않았습니다.",
      "NO_INTERVIEW_DATES",
    );
  }

  const slots = [];
  for (const member of qualifiedMembers) {
    for (const date of interviewDates) {
      const response = await Recruit.getFormResponse(
        plan.form_id,
        date.question_id,
        member.response_id,
      );
      if (!response?.answer || response.answer === "가능 시간대 없음") {
        continue;
      }
      for (const timeSlot of String(response.answer).split(";")) {
        const normalizedSlot = timeSlot.trim();
        if (normalizedSlot) {
          slots.push({
            studentId: member.student_id,
            interviewDate: date.interview_date,
            timeSlot: normalizedSlot,
          });
        }
      }
    }
  }

  await IntervieweeTimeSlots.replaceIntervieweeTimeSlots(plan.id, slots);
}

function normalizeInterviewDate(value) {
  return String(value || "").slice(0, 5);
}

module.exports = {
  InterviewSchedulerError,
  generateInterviewSchedule,
};
