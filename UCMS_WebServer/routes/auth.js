const express = require("express");
const router = express.Router();
const AuthController = require("../controllers/authController");

// 카카오 로그인 콜백
router.get("/kakao", AuthController.kakaoLogin);

// 로그아웃
router.get("/logout", AuthController.logout);

module.exports = router;
