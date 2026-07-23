const express = require("express");
const router = express.Router();
const AuthController = require("../controllers/authController");
const path = require("path");
const { saveOAuthTokens } = require("../extern_apis/googleapis");

// 로그인 페이지
router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/views/login.html"));
});

// 카카오 로그인 콜백
router.get("/authorize", AuthController.authorize);

router.get("/redirect", AuthController.redirect);

// 2026-07-23: 만료된 Google OAuth 연결을 React 화면에서 다시 승인한 뒤 안전하게 복귀시킵니다.
router.get("/oauth2callback", async (req, res) => {
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  const expectedState = String(req.session?.googleOAuthState || "");

  if (!code || !state || !expectedState || state !== expectedState) {
    return res.status(400).send("Google 인증 요청이 유효하지 않습니다.");
  }

  delete req.session.googleOAuthState;
  try {
    await saveOAuthTokens(code);
    // 2026-07-23: Google 계정 연결 관리는 관리자 화면에서만 제공하므로 인증 후 해당 화면으로 복귀합니다.
    return res.redirect("/admin?google=connected");
  } catch (error) {
    console.error(
      `[Google OAuth] callback failed: ${error?.code || "UNKNOWN"} ${error?.message || ""}`,
    );
    return res.redirect("/admin?google=failed");
  }
});

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
