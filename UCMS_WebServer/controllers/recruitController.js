const Recruit = require("../models/Recruit");
const Form = require("../models/Form");
const Member = require("../models/Member");
const User = require("../models/User");
const { off } = require("../models/db");

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

      console.log(planData);

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
      res.status(204).send();
    } catch (error) {
      console.error("Delete interview plan error:", error);
      res.status(500).json({ error: "Internal server error" });
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

  static async addInterviewer(req, res) {
    try {
      const planId = req.body.planId;
      const interviewers = req.body.interviewers;

      for (const interviewerId of interviewers) {
        await Recruit.addInterviewer(planId, interviewerId);
      }

      res.status(201).json({
        success: true,
        redirect: "/recruit/interview/plan/timeinfo",
      });
    } catch (error) {
      console.error("Add interviewer error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async removeInterviewer(req, res) {
    try {
      const { planId, interviewerId } = req.params;
      await Recruit.removeInterviewer(planId, interviewerId);
      res.status(204).send();
    } catch (error) {
      console.error("Remove interviewer error:", error);
      res.status(500).json({ error: "Internal server error" });
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

    const recruitingMembers = await Recruit.getRecruitingMembers(
      page,
      limit,
      search,
      column,
      formId
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
      res.render("recruit/interview_plan_detail");
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
      console.log(members);
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
