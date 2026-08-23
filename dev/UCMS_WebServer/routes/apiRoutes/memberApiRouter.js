const express = require("express");
const router = express.Router();
const MemberController = require("../../controllers/memberController");
const { requireAuthority } = require("./apiResponse");

// 2026-08-19: Close the legacy singular /api/member mutation bypass.
// 2026-08-21: Member management starts at the normalized executive rank.
router.use(requireAuthority(3));

router.post("/edit/:id", MemberController.editMember);

// 회원 삭제
router.post("/delete/:id", MemberController.deleteMember);

module.exports = router;
