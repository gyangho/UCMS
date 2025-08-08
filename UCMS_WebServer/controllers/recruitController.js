const Recruit = require("../models/Recruit");

class RecruitController {
  static async getFormList(req, res) {
    try {
      const forms = await Recruit.getFormList();
      res.json(forms);
    } catch (error) {
      console.error("Get form list error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getForm(req, res) {
    try {
      const { id } = req.params;
      const form = await Recruit.getFormById(id);

      if (!form) {
        return res.status(404).json({ error: "Form not found" });
      }

      res.json(form);
    } catch (error) {
      console.error("Get form error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async createForm(req, res) {
    try {
      const formData = {
        ...req.body,
        created_by: req.session.user.id,
      };

      const formId = await Recruit.createForm(formData);
      const form = await Recruit.getFormById(formId);

      res.status(201).json(form);
    } catch (error) {
      console.error("Create form error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async updateForm(req, res) {
    try {
      const { id } = req.params;
      const formData = req.body;

      await Recruit.updateForm(id, formData);
      const form = await Recruit.getFormById(id);

      res.json(form);
    } catch (error) {
      console.error("Update form error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async deleteForm(req, res) {
    try {
      const { id } = req.params;
      await Recruit.deleteForm(id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete form error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getResponses(req, res) {
    try {
      const { formId } = req.params;
      const responses = await Recruit.getResponses(formId);
      res.json(responses);
    } catch (error) {
      console.error("Get responses error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async updateResponseRating(req, res) {
    try {
      const { id } = req.params;
      const { rating } = req.body;

      await Recruit.updateResponseRating(id, rating);
      res.json({ message: "Rating updated successfully" });
    } catch (error) {
      console.error("Update response rating error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getInterviewPlans(req, res) {
    try {
      const plans = await Recruit.getInterviewPlans();
      res.json(plans);
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
        return res.status(404).json({ error: "Interview plan not found" });
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
        ...req.body,
        created_by: req.session.user.id,
      };

      const planId = await Recruit.createInterviewPlan(planData);
      const plan = await Recruit.getInterviewPlanById(planId);

      res.status(201).json(plan);
    } catch (error) {
      console.error("Create interview plan error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async updateInterviewPlan(req, res) {
    try {
      const { id } = req.params;
      const planData = req.body;

      await Recruit.updateInterviewPlan(id, planData);
      const plan = await Recruit.getInterviewPlanById(id);

      res.json(plan);
    } catch (error) {
      console.error("Update interview plan error:", error);
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
      res.status(201).json({ message: "Interview date added successfully" });
    } catch (error) {
      console.error("Add interview date error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getInterviewers(req, res) {
    try {
      const { planId } = req.params;
      const interviewers = await Recruit.getInterviewers(planId);
      res.json(interviewers);
    } catch (error) {
      console.error("Get interviewers error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async addInterviewer(req, res) {
    try {
      const { planId } = req.params;
      const interviewerData = {
        ...req.body,
        plan_id: planId,
      };

      const interviewerId = await Recruit.addInterviewer(interviewerData);
      res.status(201).json({ message: "Interviewer added successfully" });
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

  // 페이지 렌더링 메서드들
  static async renderFormList(req, res) {
    try {
      res.render("recruit/formlist");
    } catch (error) {
      console.error("Render form list error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderRecruitResponse(req, res) {
    try {
      res.render("recruit/recruit_response");
    } catch (error) {
      console.error("Render recruit response error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderInterviewPlans(req, res) {
    try {
      res.render("recruit/interview_plans");
    } catch (error) {
      console.error("Render interview plans error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderInterviewPlan(req, res) {
    try {
      res.render("recruit/interview_plan");
    } catch (error) {
      console.error("Render interview plan error:", error);
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

  static async renderInterviewSelectForm(req, res) {
    try {
      res.render("recruit/interview_selectform");
    } catch (error) {
      console.error("Render interview select form error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderInterviewTimeInfo(req, res) {
    try {
      res.render("recruit/interview_timeinfo");
    } catch (error) {
      console.error("Render interview time info error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderInterviewInterviewerAdd(req, res) {
    try {
      res.render("recruit/interview_interviewer_add");
    } catch (error) {
      console.error("Render interview interviewer add error:", error);
      res.status(500).send("Internal server error");
    }
  }

  static async renderDetail(req, res) {
    try {
      res.render("recruit/detail");
    } catch (error) {
      console.error("Render detail error:", error);
      res.status(500).send("Internal server error");
    }
  }
}

module.exports = RecruitController;
