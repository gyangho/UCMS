const express = require("express");
const router = express.Router();
const MemberController = require("../controllers/memberController");

// 회원 관리 페이지 렌더링
router.get("/manage", MemberController.renderMemberManage);

// 회원 목록 조회
router.get("/", MemberController.getMembers);

// 특정 회원 조회
router.get("/:id", MemberController.getMember);

// 회원 생성
router.post("/", MemberController.createMember);

// 회원 수정
router.put("/:id", MemberController.updateMember);

// 회원 삭제
router.delete("/:id", MemberController.deleteMember);

// 회원 일괄 생성
router.post("/bulk", MemberController.bulkCreateMembers);

module.exports = router;
