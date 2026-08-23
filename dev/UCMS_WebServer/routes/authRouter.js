const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { saveOAuthTokens } = require("../extern_apis/googleapis");
const { revokeTrustedDevice } = require("../services/EmailAuthenticationService");

router.get("/", (req, res) => res.redirect("/login"));

// 2026-08-22: Kakao login is retired; UCMS email/password login owns the public authentication entry.
router.get("/authorize", (req, res) => res.redirect("/login"));
router.get("/redirect", (req, res) => res.status(410).send("카카오 로그인은 더 이상 사용하지 않습니다."));

// 2026-07-23: 만료된 Google OAuth 연결을 React 화면에서 다시 승인한 뒤 안전하게 복귀시킵니다.
router.get("/oauth2callback", async (req, res) => {
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  const expectedState = String(req.session?.googleOAuthState || "");
  const stateExpiresAt = Number(req.session?.googleOAuthStateExpiresAt || 0);

  // 2026-08-19: Apply expiry and timing-safe comparison to the Google OAuth callback state as well.
  if (
    !code ||
    !state ||
    !expectedState ||
    stateExpiresAt < Date.now() ||
    !safeTextEquals(state, expectedState)
  ) {
    // 2026-08-21: Clear unusable state and return an actionable retry message instead of a dead-end callback page.
    delete req.session.googleOAuthState;
    delete req.session.googleOAuthStateExpiresAt;
    console.warn("[Google OAuth] callback state missing, expired, or mismatched.");
    return req.session?.userId
      ? res.redirect("/admin?google=invalid")
      : res.status(400).send("Google 인증 요청이 만료되었습니다. 관리자 화면에서 다시 연결해주세요.");
  }

  delete req.session.googleOAuthState;
  delete req.session.googleOAuthStateExpiresAt;
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

// 2026-08-19: Session-changing authentication actions use POST so SameSite/Origin CSRF checks can protect them.
router.post("/logout", async (req, res, next) => {
  try {
    // 2026-08-22: Legacy form logout follows the same trusted-device revocation boundary as the React API.
    const cookieName = process.env.NODE_ENV === "dev" ? "UCMS_TRUSTED_DEVICE_DEV" : "UCMS_TRUSTED_DEVICE_PROD";
    await revokeTrustedDevice(readCookie(req, cookieName));
    res.clearCookie(cookieName, { path: "/" });
    req.session.destroy((error) => error ? next(error) : res.redirect("/"));
  } catch (error) {
    next(error);
  }
});

// 2026-08-19: Legacy KakaoTalk room-code and nickname-based member-link routes stay unmounted until a verified Business chatbot API replaces them.

module.exports = router;

function safeTextEquals(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return (
    leftBuffer.length === rightBuffer.length &&
    leftBuffer.length > 0 &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function readCookie(req, name) {
  const item = String(req.headers.cookie || "")
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}
