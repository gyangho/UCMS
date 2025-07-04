const express = require("express");
const router = express.Router();
require("dotenv").config();

const REST_KEY = process.env.KAKAO_REST_KEY;

//예시 사용자 로그인
router.get("/kakao", (req, res) => {
  // 실제로는 Kakao 로그인 후 redirect에서 처리
  req.session.user = {
    name: "홍길동",
    email: "hong@kakao.com",
  };
  res.redirect("/dashboard");
});

module.exports = router;
