const db = require("../models/db");

const TEST_STUDENT_ID = "9999982201";
const TEST_EMAIL = "email-auth-smoke@example.invalid";
const TEST_PASSWORD = "Smoke-Email-Password-2026!";
const DEV_TEST_EMAIL = "dev-auth-bypass@example.invalid";
const FAILED_MAIL_EMAIL = "failed-mail-cleanup@example.invalid";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createMailCapture() {
  const messages = [];
  let shouldFail = false;
  return {
    async send(message) {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("Synthetic SMTP failure");
      }
      messages.push(message);
      return { id: `smoke-message-${messages.length}` };
    },
    failNext() {
      shouldFail = true;
    },
    nextCode(index) {
      const match = String(messages[index]?.text || "").match(/인증번호는\s*(\d{6})/) || String(messages[index]?.text || "").match(/(\d{6})/);
      assert(match, "The captured SMTP message did not contain a six-digit code.");
      return match[1];
    },
  };
}

// 2026-08-22: Exercise legacy-member claim, delayed mutation, email 2FA, and trusted-device revocation.
async function smokeEmailAuthentication() {
  const mail = createMailCapture();
  process.env.SESSION_SECRET = "email-auth-smoke-session-secret-that-is-longer-than-32";
  process.env.EMAIL_CODE_SECRET = "email-auth-smoke-code-secret-that-is-longer-than-32";
  process.env.EMAIL_VERIFICATION_ENABLED = "true";

  // 2026-08-23: Stub the Spring mail adapter while exercising the complete authentication lifecycle.
  const mailModulePath = require.resolve("../services/SpringMailService");
  require.cache[mailModulePath] = {
    id: mailModulePath,
    filename: mailModulePath,
    loaded: true,
    exports: { sendMail: mail.send },
  };
  const auth = require("../services/EmailAuthenticationService");
  let userId = null;
  let devUserId = null;
  try {
    const [userResult] = await db.execute(
      `INSERT INTO users (kakao_id, account_email, name, status, account_type, student_id, major)
       VALUES (NULL, NULL, '이메일인증테스트', 'pending_relink', 'human', ?, '테스트전공')`,
      [TEST_STUDENT_ID],
    );
    userId = Number(userResult.insertId);
    await db.execute(
      `INSERT INTO members (student_id, name, major, phone, gender, generation, authority, user_id)
       VALUES (?, '이메일인증테스트', '테스트전공', '010-8220-0001', '남자', 1, '일반', ?)`,
      [TEST_STUDENT_ID, userId],
    );

    const registration = await auth.startRegistration({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: "이메일인증테스트",
      phone: "010-8220-0001",
    });
    assert(registration.userId === userId, "Registration did not claim the matching legacy member user.");
    const [beforeVerify] = await db.execute(
      "SELECT account_email, password_hash, status FROM users WHERE id = ?",
      [userId],
    );
    assert(!beforeVerify[0].account_email && !beforeVerify[0].password_hash, "Registration mutated credentials before email verification.");

    const registerCode = mail.nextCode(0);
    await auth.verifyChallenge({ ...registration, purpose: "register", code: registerCode });
    const [verified] = await db.execute(
      "SELECT account_email, password_hash, status, email_verified_at FROM users WHERE id = ?",
      [userId],
    );
    assert(verified[0].account_email === TEST_EMAIL && verified[0].password_hash && verified[0].status === "active" && verified[0].email_verified_at, "Registration verification did not activate the account.");

    await auth.startLogin(TEST_EMAIL, "definitely-wrong-password", null)
      .then(() => { throw new Error("Wrong password was accepted."); })
      .catch((error) => assert(error.code === "INVALID_CREDENTIALS", "Wrong password returned an unexpected error."));

    const login = await auth.startLogin(TEST_EMAIL, TEST_PASSWORD, null);
    assert(!login.trusted && login.challengeId, "First login did not require email 2FA.");
    const loginCode = mail.nextCode(1);
    await auth.verifyChallenge({ challengeId: login.challengeId, userId, purpose: "login", code: loginCode });

    const token = await auth.createTrustedDevice(userId, "smoke browser");
    const trustedLogin = await auth.startLogin(TEST_EMAIL, TEST_PASSWORD, token);
    assert(trustedLogin.trusted, "Valid trusted device did not bypass repeat email 2FA.");
    await auth.revokeTrustedDevice(token);
    const afterRevoke = await auth.startLogin(TEST_EMAIL, TEST_PASSWORD, token);
    assert(!afterRevoke.trusted && afterRevoke.challengeId, "Revoked trusted device still bypassed email 2FA.");

    // 2026-08-23: Failed SMTP delivery must release a newly submitted email for a clean retry.
    mail.failNext();
    await auth.startRegistration({
      email: FAILED_MAIL_EMAIL,
      password: TEST_PASSWORD,
      name: "메일실패정리",
      phone: "010-8220-0003",
    }).then(() => { throw new Error("Synthetic SMTP failure was accepted."); })
      .catch((error) => assert(error.message === "Synthetic SMTP failure", "SMTP failure returned an unexpected error."));
    const [failedMailUsers] = await db.execute("SELECT COUNT(*) AS count FROM users WHERE account_email = ?", [FAILED_MAIL_EMAIL]);
    assert(Number(failedMailUsers[0].count) === 0, "Failed SMTP delivery left a pending user behind.");

    // 2026-08-22: Dev bypass must activate registration and password login without creating a mail challenge.
    process.env.EMAIL_VERIFICATION_ENABLED = "false";
    const devRegistration = await auth.startRegistration({
      email: DEV_TEST_EMAIL,
      password: TEST_PASSWORD,
      name: "개발로그인테스트",
      phone: "010-8220-0002",
    });
    devUserId = Number(devRegistration.user?.id || 0);
    assert(devRegistration.activated && devUserId, "Dev registration did not activate immediately.");
    const [devUsers] = await db.execute(
      "SELECT status, email_verified_at FROM users WHERE id = ?",
      [devUserId],
    );
    assert(devUsers[0]?.status === "active" && !devUsers[0]?.email_verified_at, "Dev registration stored an incorrect verification state.");
    const devLogin = await auth.startLogin(DEV_TEST_EMAIL, TEST_PASSWORD, null);
    assert(devLogin.authenticated && !devLogin.challengeId, "Dev password login unexpectedly required email 2FA.");
    console.log("Email authentication smoke test passed.");
  } finally {
    if (devUserId) {
      await db.execute("DELETE FROM users WHERE id = ?", [devUserId]);
    }
    if (userId) {
      await db.execute("DELETE FROM members WHERE user_id = ?", [userId]);
      await db.execute("DELETE FROM users WHERE id = ?", [userId]);
    }
    await db.end();
  }
}

smokeEmailAuthentication().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
