const InterviewPlan = require("./InterviewPlan");
const InterviewDate = require("./InterviewDate");
const InterviewInterviewer = require("./InterviewInterviewer");
const RecruitingMembers = require("./RecruitingMembers");
const InterviewerTimeSlots = require("./InterviewerTimeSlots");
const FormResponse = require("./FormResponse");
const IntervieweeTimeSlots = require("./IntervieweeTimeSlots");
const InterviewSchedule = require("./InterviewSchedule");

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
  static deleteInterviewers = InterviewInterviewer.deleteInterviewers;

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

  // 타임테이블 생성을 위한 메서드들
  static getQualifiedMembers = RecruitingMembers.getQualifiedMembers;
  static getRecruitingMembersByIds =
    RecruitingMembers.getRecruitingMembersByIds;
  static getInterviewDatesWithQuestions =
    InterviewDate.getInterviewDatesWithQuestions;
  static getFormResponse = FormResponse.getFormResponse;
  static updateInterviewPlanPanelSize =
    InterviewPlan.updateInterviewPlanPanelSize;

  // 면접 스케줄러 관련 메서드들
  static createInterviewSchedule =
    InterviewSchedule.createInterviewSchedule;
  static getInterviewSchedule =
    InterviewSchedule.getInterviewSchedule;
  static getGroupedInterviewSchedule =
    InterviewSchedule.getGroupedInterviewSchedule;
  static deleteInterviewSchedule =
    InterviewSchedule.deleteInterviewSchedule;

  // 면접 계획 상태 업데이트
  static updateInterviewPlanStatus =
    InterviewPlan.updateInterviewPlanStatus;
  static getActiveInterviewPlans =
    InterviewPlan.getActiveInterviewPlans;

  // IntervieweeTimeSlots 메서드들
  static createIntervieweeTimeSlots =
    IntervieweeTimeSlots.createIntervieweeTimeSlots;
  static getIntervieweeTimeSlots =
    IntervieweeTimeSlots.getIntervieweeTimeSlots;
  static deleteIntervieweeTimeSlots =
    IntervieweeTimeSlots.deleteIntervieweeTimeSlots;
}

module.exports = Recruit;
