const Settlement = require("../models/Settlement");
const SettlementParticipant = require("../models/SettlementParticipant");
const Event = require("../models/Event");
const Member = require("../models/Member");

class FinanceController {
  // 정산 생성 페이지
  static async getCreatePage(req, res) {
    try {
      const events = await Event.findAllForSettlement();
      const members = await Member.findAllMembers();

      res.render("finance/create", {
        events: events,
        members: members,
      });
    } catch (error) {
      console.error("정산 생성 페이지 오류:", error);
      res.status(500).json({ error: "서버 오류가 발생했습니다." });
    }
  }

  // 정산 생성 처리
  static async createSettlement(req, res) {
    try {
      const {
        name,
        total_amount,
        deadline,
        is_dutch_pay,
        participants,
        event_id,
      } = req.body;

      // 사용자 ID로 멤버 정보 찾기
      const member = await Member.findByUserId(req.session.userId);
      if (!member) {
        return res
          .status(404)
          .json({ error: "멤버 정보를 찾을 수 없습니다." });
      }
      const created_by = member.student_id;

      // 정산 생성
      const settlementId = await Settlement.create({
        name,
        total_amount: parseInt(total_amount),
        deadline,
        is_dutch_pay: is_dutch_pay === "true",
        created_by,
      });

      // 참여자 추가
      if (participants && participants.length > 0) {
        for (const participant of participants) {
          await Settlement.addParticipant(
            settlementId,
            participant.member_id,
            parseInt(participant.amount)
          );
        }
      }

      res.json({ success: true, settlementId });
    } catch (error) {
      console.error("정산 생성 오류:", error);
      res
        .status(500)
        .json({ error: "정산 생성 중 오류가 발생했습니다." });
    }
  }

  // 이벤트 참여자 조회
  static async getEventParticipants(req, res) {
    try {
      const { eventId } = req.params;
      const participants = await Settlement.getEventParticipants(
        eventId
      );
      res.json(participants);
    } catch (error) {
      console.error("이벤트 참여자 조회 오류:", error);
      res
        .status(500)
        .json({ error: "참여자 조회 중 오류가 발생했습니다." });
    }
  }

  // 정산 관리 페이지
  static async getManagePage(req, res) {
    try {
      const activeSettlements = await Settlement.findActive();
      const completedSettlements = await Settlement.findCompleted();

      // 각 정산의 참여자 정보 추가
      for (let settlement of activeSettlements) {
        settlement.participants = await Settlement.getParticipants(
          settlement.id
        );
      }

      for (let settlement of completedSettlements) {
        settlement.participants = await Settlement.getParticipants(
          settlement.id
        );
      }

      res.render("finance/manage", {
        activeSettlements,
        completedSettlements,
      });
    } catch (error) {
      console.error("정산 관리 페이지 오류:", error);
      res.status(500).json({ error: "서버 오류가 발생했습니다." });
    }
  }

  // 정산 상세 정보 조회
  static async getSettlementDetails(req, res) {
    try {
      const { id } = req.params;
      const settlement = await Settlement.findById(id);
      const participants = await Settlement.getParticipants(id);

      res.json({
        settlement,
        participants,
      });
    } catch (error) {
      console.error("정산 상세 조회 오류:", error);
      res
        .status(500)
        .json({ error: "정산 정보 조회 중 오류가 발생했습니다." });
    }
  }

  // 정산 상태 업데이트
  static async updateSettlementStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      await Settlement.update(id, { status });
      res.json({ success: true });
    } catch (error) {
      console.error("정산 상태 업데이트 오류:", error);
      res.status(500).json({
        error: "정산 상태 업데이트 중 오류가 발생했습니다.",
      });
    }
  }

  // 정산 참여자 추가
  static async addParticipant(req, res) {
    try {
      const { settlementId } = req.params;
      const { member_id, amount } = req.body;

      await Settlement.addParticipant(
        settlementId,
        member_id,
        parseInt(amount)
      );
      res.json({ success: true });
    } catch (error) {
      console.error("참여자 추가 오류:", error);
      res
        .status(500)
        .json({ error: "참여자 추가 중 오류가 발생했습니다." });
    }
  }

  // 정산 참여자 제거
  static async removeParticipant(req, res) {
    try {
      const { settlementId, memberId } = req.params;

      await Settlement.removeParticipant(settlementId, memberId);
      res.json({ success: true });
    } catch (error) {
      console.error("참여자 제거 오류:", error);
      res
        .status(500)
        .json({ error: "참여자 제거 중 오류가 발생했습니다." });
    }
  }

  // 정산 참여자 금액 업데이트
  static async updateParticipantAmount(req, res) {
    try {
      const { settlementId, memberId } = req.params;
      const { amount } = req.body;

      await Settlement.updateParticipantAmount(
        settlementId,
        memberId,
        parseInt(amount)
      );
      res.json({ success: true });
    } catch (error) {
      console.error("참여자 금액 업데이트 오류:", error);
      res.status(500).json({
        error: "참여자 금액 업데이트 중 오류가 발생했습니다.",
      });
    }
  }

  // 정산 참여자 결제 상태 업데이트
  static async updateParticipantStatus(req, res) {
    try {
      const { settlementId, memberId } = req.params;
      const { status } = req.body;

      await Settlement.updateParticipantStatus(
        settlementId,
        memberId,
        status
      );
      res.json({ success: true });
    } catch (error) {
      console.error("참여자 상태 업데이트 오류:", error);
      res.status(500).json({
        error: "참여자 상태 업데이트 중 오류가 발생했습니다.",
      });
    }
  }

  // 사용자의 정산 목록 조회 (대시보드용)
  static async getUserSettlements(req, res) {
    try {
      // 사용자 ID로 멤버 정보 찾기
      const member = await Member.findByUserId(req.session.userId);
      if (!member) {
        return res
          .status(404)
          .json({ error: "멤버 정보를 찾을 수 없습니다." });
      }

      const settlements = await Settlement.findByMemberId(
        member.student_id
      );
      res.json(settlements);
    } catch (error) {
      console.error("사용자 정산 조회 오류:", error);
      res
        .status(500)
        .json({ error: "정산 조회 중 오류가 발생했습니다." });
    }
  }

  // 정산 삭제
  static async deleteSettlement(req, res) {
    try {
      const { id } = req.params;
      await Settlement.delete(id);
      res.json({ success: true });
    } catch (error) {
      console.error("정산 삭제 오류:", error);
      res
        .status(500)
        .json({ error: "정산 삭제 중 오류가 발생했습니다." });
    }
  }
}

module.exports = FinanceController;
