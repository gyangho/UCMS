const express = require("express");
const router = express.Router();
const AuthController = require("../controllers/authController");

router.get("/", (req, res) => {});

// 카카오 로그인 콜백
router.get("/authorize", AuthController.authorize);

router.get("/redirect", AuthController.redirect);

// 로그아웃
router.get("/logout", AuthController.logout);

// 카카오톡 인증 관련
router.post("/regenerate-code", AuthController.regenerateCode);
router.get("/checkAuthCompleted", AuthController.checkAuthCompleted);
router.get("/cancelAuth", AuthController.cancelAuth);

// 멤버 확인 관련
router.get("/member-confirm", AuthController.showMemberConfirm);
router.post("/confirm-member", AuthController.confirmMember);

module.exports = router;
