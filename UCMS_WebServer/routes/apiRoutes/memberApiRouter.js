const express = require("express");
const router = express.Router();
const MemberController = require("../../controllers/memberController");

router.post("/edit/:id", MemberController.editMember);

// 회원 삭제
router.post("/delete/:id", MemberController.deleteMember);

module.exports = router;
