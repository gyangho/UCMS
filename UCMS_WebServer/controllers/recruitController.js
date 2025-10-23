const Recruit = require("../models/Recruit");
const Form = require("../models/Form");
const Member = require("../models/Member");
const User = require("../models/User");
const IntervieweeTimeSlots = require("../models/IntervieweeTimeSlots");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const {
  execCommand,
  execInDirectory,
} = require("../extern_apis/exec");

class RecruitController {
  static async getFormList(req, res) {
    try {
      const forms = await Form.getFormList();
      res.json(forms);
    } catch (error) {
      console.error("Get form list error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async syncResponses(req, res) {
    try {
      const formId = req.body.formId;
      const form = await Form.syncResponses(formId);
      res.redirect(`/recruit/responses?formId=${formId}`);
    } catch (error) {
      console.error("Sync responses error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getForm(req, res) {
    try {
      const { id } = req.params;
      const form = await Form.getFormById(id);

      if (!form) {
        return res.status(404).json({ error: "Form not found" });
      }

      res.json(form);
    } catch (error) {
      console.error("Get form error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async addForm(req, res) {
    const url = req.body?.newURL || "";

    let formID;
    if (url !== "") {
      formID = await Form.addForm(url);
    } else {
      formID = req.body?.URLSelect || "";
      if (!formID) {
        console.error("선택된 폼이 없습니다");
        return res.status(400).send(
          `<script>alert("폼을 선택해주세요."); 
            window.location.href = '/recruit/responses';</script>`
        );
      }
    }

    return res.send(
      `<script> 
      window.sessionStorage.setItem('currentFormID', '${formID}');
      window.location.href = '/recruit/responses?formId=${formID}';
    </script>`
    );
  }

  static async updateForm(req, res) {
    try {
      const { id } = req.params;
      const formData = req.body;

      await Form.updateForm(id, formData);
      const form = await Form.getFormById(id);

      res.json(form);
    } catch (error) {
      console.error("Update form error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async deleteForm(req, res) {
    try {
      const { id } = req.params;
      await Form.deleteForm(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete form error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getResponses(req, res) {
    try {
      const { formId } = req.params;
      const responses = await Form.getResponses(formId);
      res.json(responses);
    } catch (error) {
      console.error("Get responses error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async updateRecruitRating(req, res) {
    try {
      const { response_id, rating, form_id } = req.body;

      await Recruit.updateRecruitRating(response_id, rating, form_id);
      res.json({ message: "Rating updated successfully" });
    } catch (error) {
      console.error("Update recruit rating error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async downloadExcel(req, res) {
    try {
      const { formId } = req.query;
      const { search, column, sortBy } = req.query;

      // 모든 데이터를 가져오기 위해 큰 limit 설정
      const recruitingMembers = await Recruit.getRecruitingMembers(
        1,
        10000, // 충분히 큰 수
        search || "",
        column || "",
        formId,
        sortBy || "id"
      );

      // Excel 워크북 생성
      const workbook = XLSX.utils.book_new();

      // 데이터 배열 생성
      const excelData = recruitingMembers.map((member) => ({
        학번: member.student_id,
        이름: member.name,
        "학과(부)": member.major,
        전화번호: member.phone,
        성별: member.gender,
        평가: member.rating,
      }));

      // 워크시트 생성
      const worksheet = XLSX.utils.json_to_sheet(excelData);

      // 컬럼 너비 설정
      const columnWidths = [
        { wch: 10 }, // 학번
        { wch: 8 }, // 이름
        { wch: 15 }, // 학과(부)
        { wch: 15 }, // 전화번호
        { wch: 8 }, // 성별
        { wch: 12 }, // 평가
      ];
      worksheet["!cols"] = columnWidths;

      // 워크시트를 워크북에 추가
      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "신입부원 응답자 목록"
      );

      // 파일명 생성 (현재 날짜 포함)
      const currentDate = new Date().toISOString().split("T")[0];
      const fileName = `신입부원_응답자_목록_${currentDate}.xlsx`;

      // Excel 파일 생성
      const excelBuffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      });

      // 응답 헤더 설정
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(fileName)}"`
      );
      res.setHeader("Content-Length", excelBuffer.length);

      // 파일 전송
      res.send(excelBuffer);
    } catch (error) {
      console.error("Download Excel error:", error);
      res
        .status(500)
        .json({ error: "Excel 다운로드 중 오류가 발생했습니다." });
    }
  }

  static async getInterviewPlans(req, res) {
    try {
      const plans = await Recruit.getInterviewPlans();
      for (let i = 0; i < plans.length; i++) {
        plans[i].created_by = (
          await User.findById(plans[i].created_by)
        ).name;
        plans[i].updated_by = (
          await User.findById(plans[i].updated_by)
        ).name;
        const form = await Form.getFormById(plans[i].form_id);
        plans[i].form_title = form.title;
      }
      res.json({ success: true, plans });
    } catch (error) {
      console.error("Get interview plans error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getInterviewPlan(req, res) {
    try {
      const { id } = req.params;
      const plan = await Recruit.getInterviewPlanById(id);

      if (!plan) {
        return res
          .status(404)
          .json({ error: "Interview plan not found" });
      }

      res.json(plan);
    } catch (error) {
      console.error("Get interview plan error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async createInterviewPlan(req, res) {
    try {
      const planData = {
        planId: req.body.planId,
        formId: req.body.formId,
        interviewDates: JSON.parse(req.body.interviewDates),
        questionIds: JSON.parse(req.body.questionIds),
        title: req.body.title,
        created_by: req.session.userId,
      };

      if (planData.planId) {
        await Recruit.updateInterviewPlan(planData.planId, planData);
      } else {
        planData.planId = await Recruit.createInterviewPlan(planData);
      }

      await Recruit.deleteInterviewDates(planData.planId);
      await Recruit.createInterviewDates(planData);

      res.status(201).json({
        success: true,
        planId: planData.planId,
        redirect: "/recruit/interview/plan/interviewer/add",
      });
    } catch (error) {
      console.error("Create interview plan error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async deleteInterviewPlan(req, res) {
    try {
      const { id } = req.params;
      await Recruit.deleteInterviewPlan(id);
      res.json({
        success: true,
        message: "면접 계획이 성공적으로 삭제되었습니다.",
      });
    } catch (error) {
      console.error("Delete interview plan error:", error);
      res
        .status(500)
        .json({ success: false, error: "Internal server error" });
    }
  }

  static async generateTimetable(req, res) {
    try {
      const { planId, timeInfo } = req.body;

      // 1. 면접관 시간대 정보 삭제
      await Recruit.deleteInterviewerTimeSlots(planId);

      // 2. 면접관 시간대 정보 생성
      Object.keys(timeInfo).forEach(async (interviewerId) => {
        Object.keys(timeInfo[interviewerId]).forEach(
          async (interviewDate) => {
            Object.keys(
              timeInfo[interviewerId][interviewDate]
            ).forEach(async (timeSlot) => {
              if (
                timeInfo[interviewerId][interviewDate][timeSlot] ===
                false
              ) {
                return;
              }
              await Recruit.createInterviewerTimeSlots(
                planId,
                interviewerId,
                interviewDate,
                timeSlot,
                timeInfo[interviewerId][interviewDate][timeSlot]
              );
            });
          }
        );
      });
      //피면접자 시간대 생성 시작=======================================================

      // 0. 현재 plan_id에 해당하는 form_id를 interview_plans 테이블에서 가져온다
      const plan = await Recruit.getInterviewPlanById(planId);
      if (!plan) {
        return res.status(404).json({
          success: false,
          error: "면접 계획을 찾을 수 없습니다.",
        });
      }

      const formId = plan.form_id;

      // 1. recruiting_members 테이블에서 현재의 구글 폼 id에 해당하는 행 중에, rating이 '1차합격'인 인원의 response_id와 student_id들을 가져온다
      const qualifiedMembers = await Recruit.getQualifiedMembers(
        formId
      );

      // 2. interview_dates 테이블에서 현재 plan_id에 해당하는 { 면접날짜: question_id, ... } 을 가져온다
      const interviewDates =
        await Recruit.getInterviewDatesWithQuestions(planId);

      // 3. form_responses 테이블에서 응답을 가져와서 timeslot을 만들어서 json으로 출력
      const timetable = {};

      for (const member of qualifiedMembers) {
        timetable[member.student_id] = {};

        for (const dateInfo of interviewDates) {
          const questionId = dateInfo.question_id;
          const interviewDate = dateInfo.interview_date;

          // form_responses에서 응답 찾기
          const response = await Recruit.getFormResponse(
            formId,
            questionId,
            member.response_id
          );

          if (response && response.answer !== "가능 시간대 없음") {
            timetable[member.student_id][interviewDate] =
              response.answer;
          } else {
            // 응답이 '가능 시간대 없음'이면 비워놓음
            timetable[member.student_id][interviewDate] = "";
          }
        }
      }
      await IntervieweeTimeSlots.deleteIntervieweeTimeSlots(planId);

      Object.keys(timetable).forEach(async (studentId) => {
        Object.keys(timetable[studentId]).forEach(
          async (interviewDate) => {
            if (timetable[studentId][interviewDate] === "") {
              return;
            }
            for (let timeSlot of timetable[studentId][
              interviewDate
            ].split(";")) {
              timeSlot = timeSlot.trim();
              if (timeSlot === "") {
                continue;
              }
              await IntervieweeTimeSlots.createIntervieweeTimeSlots(
                planId,
                studentId,
                interviewDate,
                timeSlot
              );
            }
          }
        );
      });

      res.json({
        success: true,
        redirect: `/recruit/interview/plans/${planId}`,
      });
    } catch (error) {
      console.error("interviewee time slots error:", error);
      res
        .status(500)
        .json({ success: false, error: "Internal server error" });
    }
  }

  static async getInterviewDates(req, res) {
    try {
      const { planId } = req.params;
      const dates = await Recruit.getInterviewDates(planId);
      res.json(dates);
    } catch (error) {
      console.error("Get interview dates error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async addInterviewDate(req, res) {
    try {
      const { planId } = req.params;
      const dateData = {
        ...req.body,
        plan_id: planId,
      };

      const dateId = await Recruit.addInterviewDate(dateData);
      res
        .status(201)
        .json({ message: "Interview date added successfully" });
    } catch (error) {
      console.error("Add interview date error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async duplicateInterviewer(req, res) {
    try {
      const planId = req.body.planId;
      const interviewers = req.body.interviewers;

      await Recruit.deleteInterviewers(planId);

      for (const interviewerId of interviewers) {
        await Recruit.addInterviewer(planId, interviewerId);
      }

      res.status(201).json({
        success: true,
        redirect: "/recruit/interview/plan/interviewer/timeinfo",
      });
    } catch (error) {
      console.error("Add interviewer error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async createInterviewerTimeInfo(req, res) {
    try {
      const planId = req.body.planId;
      const timeInfo = req.body.timeInfo;

      res.status(201).json({
        success: true,
        redirect: "/recruit/interview/plan/timetable",
      });
    } catch (error) {
      console.error("Create interview time info error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async generateInterviewSchedule(req, res) {
    try {
      const data = req.body;

      const { planId, minInterviewers } = data;
    } catch (error) {
      console.error("Generate interview schedule error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // 면접 스케줄러 실행 함수 (직접 JSON 파싱 방식)
  static async runInterviewScheduler(req, res) {
    try {
      const { planId, minInterviewers } = req.body;

      await Recruit.updateInterviewPlanPanelSize(
        planId,
        minInterviewers
      );

      const interviewTimeSlots =
        await Recruit.getInterviewerTimeSlots(planId);

      const intervieweeTimeSlots =
        await IntervieweeTimeSlots.getIntervieweeTimeSlots(planId);

      const input = {
        interviewDates: [],
        interviewerSlots: [],
        intervieweeSlots: [],
        panelSize: parseInt(minInterviewers),
      };

      let interviewDates = await Recruit.getInterviewDates(planId);
      interviewDates = interviewDates.map(
        (date) => date.interview_date
      );

      interviewDates = interviewDates.map((date) => {
        return date.slice(0, 5);
      });

      input.interviewDates = interviewDates;

      for (const interviewer of interviewTimeSlots) {
        interviewer.interview_date = interviewer.interview_date.slice(
          0,
          5
        );

        input.interviewerSlots.push({
          interviewerId: parseInt(interviewer.interviewer_id),
          interviewDate: interviewer.interview_date,
          timeSlot: interviewer.time_slot,
        });
      }

      for (const interviewee of intervieweeTimeSlots) {
        interviewee.interview_date = interviewee.interview_date.slice(
          0,
          5
        );

        input.intervieweeSlots.push({
          intervieweeId: parseInt(interviewee.interviewee_id),
          interviewDate: interviewee.interview_date,
          timeSlot: interviewee.time_slot,
        });
      }

      fs.writeFileSync(
        path.join(
          __dirname,
          `../../InterviewScheduler/inputs/input_${planId}.json`
        ),
        JSON.stringify(input, null, 2)
      );

      // 면접 스케줄러 실행 (직접 JSON 파싱)
      const schedulerPath = path.join(
        __dirname,
        "../../InterviewScheduler"
      );

      // Windows 환경을 위한 실행 파일 경로 수정
      const executablePath = path.join(
        schedulerPath,
        "interview_scheduler_glpk.exe"
      );
      const inputFilePath = path.join(
        schedulerPath,
        "inputs",
        `input_${planId}.json`
      );

      // 실행 파일 존재 확인
      if (!fs.existsSync(executablePath)) {
        throw new Error(`Executable not found: ${executablePath}`);
      }

      // 입력 파일 존재 확인
      if (!fs.existsSync(inputFilePath)) {
        throw new Error(`Input file not found: ${inputFilePath}`);
      }

      // Windows 환경에서는 절대 경로로 실행
      console.log(
        "Executing command:",
        `"${executablePath}" "${inputFilePath}"`
      );
      console.log("Working directory:", schedulerPath);

      // stderr를 파일로 리다이렉트하여 버퍼 오버플로우 방지
      const stderrLogPath = path.join(
        schedulerPath,
        "outputs",
        `stderr_${planId}.log`
      );

      // stdout도 파일로 저장하여 전체 로그 보존
      const stdoutLogPath = path.join(
        schedulerPath,
        "outputs",
        `stdout_${planId}.log`
      );

      // stderr와 stdout을 모두 파일로 리다이렉트
      const commandWithRedirect = `"${executablePath}" "${inputFilePath}" >"${stdoutLogPath}" 2>"${stderrLogPath}"`;

      const result = await execInDirectory(
        commandWithRedirect,
        schedulerPath,
        {
          timeout: 600000, // 600초 타임아웃
          shell: "cmd.exe", // Windows cmd 사용
          ignoreStderr: true, // stderr 출력 억제
          maxBuffer: 1024 * 1024 * 50, // 50MB 버퍼 (디버그 출력 대응)
        }
      );

      if (!result.success) {
        throw new Error(
          `Scheduler execution failed: ${result.error}`
        );
      }

      // 파일에서 JSON 파싱 (디버그 메시지 제거)
      try {
        // stdout 로그 파일에서 JSON 부분만 추출
        let cleanOutput = fs.readFileSync(stdoutLogPath, "utf8");

        // 첫 번째 '{'부터 시작하는 JSON 부분 찾기
        const jsonStart = cleanOutput.indexOf("{");
        if (jsonStart !== -1) {
          cleanOutput = cleanOutput.substring(jsonStart);
        }

        // 마지막 '}'부터 끝까지 찾기
        const jsonEnd = cleanOutput.lastIndexOf("}");
        if (jsonEnd !== -1) {
          cleanOutput = cleanOutput.substring(0, jsonEnd + 1);
        }

        const outputData = JSON.parse(cleanOutput);

        console.log("Scheduler output:", outputData);

        // 성공 응답 전송
        res.json({
          success: true,
          message: "Interview scheduling completed successfully",
          data: outputData,
        });

        // 로그 파일들이 있다면 내용 출력 (디버깅용)
        if (fs.existsSync(stdoutLogPath)) {
          const stdoutContent = fs.readFileSync(
            stdoutLogPath,
            "utf8"
          );
          console.log(
            "Scheduler stdout log (first 1000 chars):",
            stdoutContent.substring(0, 1000)
          );
        }

        if (fs.existsSync(stderrLogPath)) {
          const stderrContent = fs.readFileSync(
            stderrLogPath,
            "utf8"
          );
          console.log(
            "Scheduler stderr log (first 1000 chars):",
            stderrContent.substring(0, 1000)
          );
        }

        // 기존 면접 스케줄 삭제 (중복 방지)
        await Recruit.deleteInterviewSchedule(planId);

        // 결과를 데이터베이스에 저장
        for (const schedule of outputData.schedule || []) {
          await Recruit.createInterviewSchedule(planId, schedule);
        }
      } catch (parseError) {
        console.error("JSON parsing error:", parseError);
        console.error("Raw stdout:", result.stdout);

        // JSON 파싱 실패 시 파일에서 읽기 (fallback)
        const outputPath = path.join(
          schedulerPath,
          "outputs/out.json"
        );
        if (fs.existsSync(outputPath)) {
          const outputData = JSON.parse(
            fs.readFileSync(outputPath, "utf8")
          );
          res.json({
            success: true,
            message:
              "Interview scheduling completed successfully (fallback to file)",
            data: outputData,
          });
        } else {
          throw new Error(
            "Failed to parse output and no fallback file found"
          );
        }
      }
    } catch (error) {
      console.error("Interview scheduler error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // 면접 스케줄러 상태 확인 함수
  static async getSchedulerStatus(req, res) {
    try {
      const { planId } = req.params;
      const outputPath = path.join(
        __dirname,
        "../../InterviewScheduler/outputs/out.json"
      );

      if (fs.existsSync(outputPath)) {
        const outputData = JSON.parse(
          fs.readFileSync(outputPath, "utf8")
        );
        res.json({
          success: true,
          data: outputData,
        });
      } else {
        res.json({
          success: false,
          message: "No scheduling result found",
        });
      }
    } catch (error) {
      console.error("Get scheduler status error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // 면접 스케줄 조회 함수
  static async getInterviewSchedule(req, res) {
    try {
      const { planId } = req.params;
      const schedule = await Recruit.getInterviewSchedule(planId);

      res.json({
        success: true,
        data: schedule,
      });
    } catch (error) {
      console.error("Get interview schedule error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // 면접 계획 확정 함수
  static async confirmInterviewPlan(req, res) {
    try {
      const { planId } = req.params;

      // 면접 스케줄이 있는지 확인
      const schedule = await Recruit.getInterviewSchedule(planId);

      if (!schedule || schedule.length === 0) {
        return res.status(400).json({
          success: false,
          error: "면접 스케줄을 먼저 생성해주세요.",
        });
      }

      // 면접 계획 상태를 active로 변경
      await Recruit.updateInterviewPlanStatus(planId, "active");

      res.json({
        success: true,
        message: "면접 계획이 성공적으로 확정되었습니다.",
      });
    } catch (error) {
      console.error("Confirm interview plan error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // 면접 계획 확정 취소 함수
  static async cancelInterviewPlan(req, res) {
    try {
      const { planId } = req.params;

      // 면접 계획 상태를 draft로 변경
      await Recruit.updateInterviewPlanStatus(planId, "draft");

      res.json({
        success: true,
        message: "면접 계획 확정이 취소되었습니다.",
      });
    } catch (error) {
      console.error("Cancel interview plan error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // 면접 종료 함수
  static async completeInterviewPlan(req, res) {
    try {
      const { planId } = req.params;

      // 면접 계획 상태를 completed로 변경
      await Recruit.updateInterviewPlanStatus(planId, "completed");

      res.json({
        success: true,
        message: "면접이 종료되었습니다.",
      });
    } catch (error) {
      console.error("Complete interview plan error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // 활성화된 면접 스케줄 조회 함수
  static async getActiveInterviewSchedules(req, res) {
    try {
      // status가 'active'인 면접 계획들을 조회
      const activePlans = await Recruit.getActiveInterviewPlans();

      // 각 활성 계획의 스케줄 정보 조회
      const activeSchedules = [];
      for (const plan of activePlans) {
        const schedule = await Recruit.getInterviewSchedule(plan.id);
        if (schedule && schedule.length > 0) {
          activeSchedules.push({
            plan: plan,
            schedule: schedule,
          });
        }
      }

      res.render("recruit/active_interview_schedules", {
        activeSchedules,
      });
    } catch (error) {
      console.error("Get active interview schedules error:", error);
      res.status(500).send("Internal server error");
    }
  }

  // 페이지 렌더링 메서드들 ============================================================

  static async renderFormList(req, res) {
    try {
      res.render("recruit/formlist", {
        forms: await Form.getFormList(),
      });
    } catch (error) {
      console.error("Render form list error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderRecruitMemberList(req, res) {
    const formId = req.query.formId || "";
    const search = req.query.search || "";
    const column = req.query.column || "";
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    const sortBy = req.query.sortBy || "id";

    const recruitingMembers = await Recruit.getRecruitingMembers(
      page,
      limit,
      search,
      column,
      formId,
      sortBy
    );

    const total = await Recruit.countRecruitingMembers(
      search,
      column,
      formId
    );
    const totalPages = Math.ceil(total / (limit || 10));
    const currentPage = page;

    let currentForm = await Form.getFormById(formId);

    if (!currentForm) {
      currentForm = {
        id: "",
        title: "선택된 폼 없음",
      };
    }

    try {
      res.render("recruit/recruit_response", {
        search,
        column,
        recruitingMembers,
        total,
        totalPages,
        currentPage,
        currentForm,
        limit,
        sortBy,
      });
    } catch (error) {
      console.error("Render recruit response error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderResponseDetail(req, res) {
    try {
      const answers = await Form.getResponsesByResponseId(
        req.query.responseId,
        req.query.formId
      );

      const questions = await Form.getQuestionsByFormId(
        req.query.formId
      );

      const responses = questions.map((question) => {
        const answer = answers.find(
          (answer) => answer.question_id === question.question_id
        );
        return {
          question: question.question,
          answer: answer.answer,
        };
      });

      res.render("recruit/detail", {
        memberInfo: await Recruit.getMemberInfo(req.query.responseId),
        responses,
        responseId: req.query.responseId,
        formId: req.query.formId,
        user: req.session.userId,
      });
    } catch (error) {
      console.error("Render detail error:", error);
      res.status(500).send("Internal server error");
    }
  }

  //면접 계획 목록 렌더링 메서드
  static async renderInterviewPlans(req, res) {
    try {
      res.render("recruit/interview_plans");
    } catch (error) {
      console.error("Render interview plans error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderInterviewPlanDetail(req, res) {
    try {
      const { id } = req.params;

      // 면접 계획 정보 조회
      const plan = await Recruit.getInterviewPlanById(id);
      if (!plan) {
        return res.status(404).send("면접 계획을 찾을 수 없습니다.");
      }

      // 면접 계획 생성자/수정자 정보 조회
      const createdBy = await User.findById(plan.created_by);
      const updatedBy = await User.findById(plan.updated_by);

      // 폼 정보 조회
      const form = await Form.getFormById(plan.form_id);

      // 면접 날짜 및 질문 정보 조회
      const interviewDates = await Recruit.getInterviewDates(id);

      // 면접관 정보 조회
      const interviewers = await Recruit.getInterviewers(id);

      // 면접관별 시간대 정보 조회
      const interviewerTimeSlots =
        await Recruit.getInterviewerTimeSlots(id);

      // 피면접자 정보 조회
      const intervieweeIdsResult =
        await IntervieweeTimeSlots.getIntervieweeIds(id);

      const intervieweeIds = intervieweeIdsResult.map(
        (item) => item.interviewee_id
      );

      const interviewees = await Recruit.getRecruitingMembersByIds(
        intervieweeIds
      );

      // 면접 스케줄 정보 조회 (그룹화된 형태)
      const interviewSchedule =
        await Recruit.getGroupedInterviewSchedule(id);

      res.render("recruit/interview_plan_detail", {
        plan: {
          ...plan,
          created_by_name: createdBy?.name || "알 수 없음",
          updated_by_name: updatedBy?.name || "알 수 없음",
          form_title: form?.title || "폼 정보 없음",
        },
        interviewDates,
        interviewers,
        interviewerTimeSlots,
        interviewees,
        interviewSchedule,
      });
    } catch (error) {
      console.error("Render interview plan detail error:", error);
      res.status(500).send("Internal server error");
    }
  }

  //면접 계획 관련 렌더링 메서드들
  static async renderInterviewPlan(req, res) {
    try {
      res.render("recruit/interview_plan");
    } catch (error) {
      console.error("Render interview plan error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderInterviewSelectForm(req, res) {
    try {
      let selected_plan_form_id;
      let selected_plan_title;

      if (req.query.planId) {
        selected_plan_form_id = (
          await Recruit.getInterviewPlanById(req.query.planId)
        ).form_id;
        selected_plan_title = (
          await Recruit.getInterviewPlanById(req.query.planId)
        ).title;
      } else {
        selected_plan_form_id = "";
        selected_plan_title = "";
      }
      res.render("recruit/interview_selectform", {
        forms: await Form.getFormList(),
        selected_plan_form_id,
        selected_plan_title,
      });
    } catch (error) {
      console.error("Render interview select form error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderInterviewInterviewerAdd(req, res) {
    try {
      const members = await Member.getMembersByAuthority(4);
      for (let i = 0; i < members.length; i++) {
        if (!members[i].user_id) {
          continue;
        }
        const user = await User.findById(members[i].user_id);
        members[i].thumbnail_image = user.thumbnail_image;
      }
      res.render("recruit/interview_interviewer_add", {
        members,
        interviewers: await Recruit.getInterviewers(req.query.planId),
      });
    } catch (error) {
      console.error("Render interview interviewer add error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderInterviewTimeInfo(req, res) {
    const planId = req.query.planId;
    const formId = (await Recruit.getInterviewPlanById(planId))
      .form_id;

    const rawInterviewDates = await Recruit.getInterviewDates(planId);
    const interviewDates = rawInterviewDates.map(
      (date) => date.interview_date
    );

    const interviewers = await Recruit.getInterviewers(planId);
    const interviewerTimeSlots =
      await Recruit.getInterviewerTimeSlots(planId);

    try {
      res.render("recruit/interview_timeinfo", {
        planId,
        formId,
        interviewDates,
        interviewers,
        interviewerTimeSlots,
      });
    } catch (error) {
      console.error("Render interview time info error:", error);
      res.status(500).send("Internal server error");
    }
  }
}

module.exports = RecruitController;
