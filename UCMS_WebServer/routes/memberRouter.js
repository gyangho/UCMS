const express = require("express");
const router = express.Router();
const MemberController = require("../controllers/memberController");

// 회원 관리 페이지 렌더링 (루트 경로)
router.get("/", MemberController.renderMemberManage);
router.get("/manage", MemberController.renderMemberManage);

// 회원 목록 조회
router.get("/list", MemberController.getMembers);

// 특정 회원 조회
router.get("/:id", MemberController.getMember);

// 회원 수정
router.put("/:id", MemberController.updateMember);

// 회원 일괄 생성
router.post("/add", MemberController.addMember);

module.exports = router;
