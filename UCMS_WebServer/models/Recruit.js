const InterviewPlan = require("./InterviewPlan");
const InterviewDate = require("./InterviewDate");
const InterviewInterviewer = require("./InterviewInterviewer");
const RecruitingMembers = require("./RecruitingMembers");
const InterviewerTimeSlots = require("./InterviewerTimeSlots");

class Recruit {
  // InterviewPlan 메서드들
  static getInterviewPlans = InterviewPlan.getInterviewPlans;
  static getInterviewPlanById = InterviewPlan.getInterviewPlanById;
  static createInterviewPlan = InterviewPlan.createInterviewPlan;
  static updateInterviewPlan = InterviewPlan.updateInterviewPlan;
  static deleteInterviewPlan = InterviewPlan.deleteInterviewPlan;

  // InterviewDate 메서드들
  static getInterviewDates = InterviewDate.getInterviewDates;
  static createInterviewDates = InterviewDate.createInterviewDates;
  static deleteInterviewDates = InterviewDate.deleteInterviewDates;

  // InterviewInterviewer 메서드들
  static getInterviewers = InterviewInterviewer.getInterviewers;
  static addInterviewer = InterviewInterviewer.addInterviewer;
  static removeInterviewer = InterviewInterviewer.removeInterviewer;

  // InterviewerTimeSlots 메서드들
  static createInterviewerTimeSlots =
    InterviewerTimeSlots.createInterviewerTimeSlots;
  static getInterviewerTimeSlots =
    InterviewerTimeSlots.getInterviewerTimeSlots;
  static deleteInterviewerTimeSlots =
    InterviewerTimeSlots.deleteInterviewerTimeSlots;

  // RecruitingMembers 메서드들
  static getRecruitingMembers =
    RecruitingMembers.getRecruitingMembers;
  static countRecruitingMembers =
    RecruitingMembers.countRecruitingMembers;
  static getMemberInfo = RecruitingMembers.getMemberInfo;
  static updateRecruitRating = RecruitingMembers.updateRecruitRating;
}

module.exports = Recruit;
