const crypto = require("crypto");
const { promisify } = require("util");
const db = require("../models/db");
const { sendMail } = require("./SpringMailService");

const scrypt = promisify(crypto.scrypt);
const CODE_TTL_MINUTES = 5;
const TRUSTED_DEVICE_DAYS = 30;
const MAX_CODE_ATTEMPTS = 5;
const MAX_EMAIL_REQUESTS = 5;

// 2026-08-22: Development can temporarily bypass mailbox verification while production stays secure by default.
function isEmailVerificationEnabled() {
  const configured = String(process.env.EMAIL_VERIFICATION_ENABLED || "")
    .trim()
    .toLowerCase();
  if (configured === "true") return true;
  if (configured === "false") return false;
  return process.env.NODE_ENV !== "dev";
}

function authError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function normalizeEmail(value) {
  const email = String(value || "")
    .trim()
    .toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 11 ? digits : "";
}

async function hashPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 10 ||
    password.length > 128
  ) {
    throw authError(
      "WEAK_PASSWORD",
      "비밀번호는 10자 이상 128자 이하로 입력해 주세요.",
    );
  }
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function verifyPassword(password, encoded) {
  const [algorithm, n, r, p, saltValue, hashValue] = String(
    encoded || "",
  ).split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64url");
  const actual = await scrypt(
    String(password || ""),
    Buffer.from(saltValue, "base64url"),
    expected.length,
    { N: Number(n), r: Number(r), p: Number(p) },
  );
  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
}

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function codeDigest(userId, purpose, code) {
  const secret = process.env.EMAIL_CODE_SECRET || process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw authError(
      "EMAIL_AUTH_NOT_CONFIGURED",
      "이메일 인증 비밀키가 설정되지 않았습니다.",
      503,
    );
  }
  return crypto
    .createHmac("sha256", secret)
    .update(`${userId}:${purpose}:${code}`)
    .digest("hex");
}

async function sendCode(email, code, purpose) {
  // 2026-08-23: Spring owns SMTP delivery; Node retains the existing authentication transition only.
  await sendMail({
    to: email,
    subject:
      purpose === "register"
        ? "[UCMS] 회원가입 이메일 인증"
        : "[UCMS] 로그인 2차 인증",
    // 2026-08-23: Keep each verification instruction on its own line for readable branded email.
    text: `인증번호는 아래와 같습니다.\n\n${code}\n\n${CODE_TTL_MINUTES}분 내로 입력해 주세요.\n\n본인이 요청하지 않았다면 이 메일을 무시해 주세요.`,
  });
}

async function createChallenge(user, purpose, pendingRegistration = null) {
  const [recent] = await db.execute(
    `SELECT COUNT(*) AS count FROM email_auth_challenges
      WHERE user_id = ? AND purpose = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)`,
    [user.id, purpose],
  );
  if (Number(recent[0]?.count || 0) >= MAX_EMAIL_REQUESTS) {
    throw authError(
      "EMAIL_RATE_LIMITED",
      "인증 메일 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      429,
    );
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const [result] = await db.execute(
    `INSERT INTO email_auth_challenges
       (user_id, purpose, code_hash, pending_account_email, pending_password_hash, pending_name,
        pending_phone_number, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [
      user.id,
      purpose,
      codeDigest(user.id, purpose, code),
      pendingRegistration?.email || null,
      pendingRegistration?.passwordHash || null,
      pendingRegistration?.name || null,
      pendingRegistration?.phone || null,
      CODE_TTL_MINUTES,
    ],
  );
  try {
    await sendCode(user.delivery_email || user.account_email, code, purpose);
  } catch (error) {
    await db.execute("DELETE FROM email_auth_challenges WHERE id = ?", [
      result.insertId,
    ]);
    throw error;
  }
  return Number(result.insertId);
}

// 2026-08-22: Keep submitted identity and password data pending until mailbox ownership is proven.
async function startRegistration(body) {
  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone);
  const name = String(body.name || "").trim();
  if (!email || !phone || name.length < 2 || name.length > 50) {
    throw authError(
      "INVALID_REGISTRATION",
      "이메일, 이름, 전화번호를 모두 올바르게 입력해 주세요.",
    );
  }

  const passwordHash = await hashPassword(body.password);
  const [existingByEmail] = await db.execute(
    `SELECT u.id, u.account_email, u.password_hash, u.status, u.account_type,
            COALESCE(m.name, u.name) AS identity_name,
            COALESCE(m.phone, u.phone_number) AS identity_phone
       FROM users u
       LEFT JOIN members m ON m.user_id = u.id
      WHERE u.account_email = ? LIMIT 1`,
    [email],
  );
  let existing = existingByEmail[0];
  let unlinkedMemberStudentId = null;

  // 2026-08-23: Migrated members have no email, so claim their stable users.id by the unique member name + phone pair.
  if (!existing) {
    const [legacyCandidates] = await db.execute(
      `SELECT u.id, u.account_email, u.password_hash, u.status, u.account_type,
              m.name AS identity_name, m.phone AS identity_phone
         FROM members m
         JOIN users u ON u.id = m.user_id
        WHERE m.name = ?
          AND u.account_type = 'human'
          AND u.password_hash IS NULL
          AND u.status IN ('pending_relink', 'pending_email')
          AND (u.account_email IS NULL OR u.account_email = ?)`,
      [name, email],
    );
    const matchingLegacyAccounts = legacyCandidates.filter(
      (candidate) => normalizePhone(candidate.identity_phone) === phone,
    );
    if (matchingLegacyAccounts.length > 1) {
      throw authError(
        "REGISTRATION_IDENTITY_AMBIGUOUS",
        "동일한 회원 정보가 여러 건 존재합니다. 관리자에게 문의해 주세요.",
        409,
      );
    }
    existing = matchingLegacyAccounts[0];

    // 2026-08-24: A member imported without a users row must be claimable by the same unique name + phone pair.
    if (!existing) {
      const [unlinkedMembers] = await db.execute(
        `SELECT student_id, name, phone
           FROM members
          WHERE user_id IS NULL AND name = ?`,
        [name],
      );
      const matchingUnlinkedMembers = unlinkedMembers.filter(
        (member) => normalizePhone(member.phone) === phone,
      );
      if (matchingUnlinkedMembers.length > 1) {
        throw authError(
          "REGISTRATION_IDENTITY_AMBIGUOUS",
          "Multiple unlinked members match the submitted name and phone number.",
          409,
        );
      }
      unlinkedMemberStudentId = matchingUnlinkedMembers[0]?.student_id || null;
    }
  }

  if (
    existing &&
    (existing.account_type !== "human" || existing.password_hash)
  ) {
    throw authError(
      "EMAIL_ALREADY_REGISTERED",
      "이미 가입된 이메일입니다.",
      409,
    );
  }

  // 2026-08-23: An email or legacy-member match may claim its stable user ID only with the same name and phone.
  if (existing) {
    const pendingAccountWithoutPhone =
      existing.status === "pending_email" &&
      !normalizePhone(existing.identity_phone);
    const identityMatches =
      String(existing.identity_name || "").trim() === name &&
      (normalizePhone(existing.identity_phone) === phone ||
        pendingAccountWithoutPhone);
    if (!identityMatches) {
      throw authError(
        "REGISTRATION_IDENTITY_CONFLICT",
        "입력한 계정 정보가 기존 정보와 일치하지 않습니다.",
        409,
      );
    }
  }

  const [phoneOwners] = await db.execute(
    "SELECT id FROM users WHERE phone_number = ? LIMIT 1",
    [phone],
  );
  if (phoneOwners[0] && Number(phoneOwners[0].id) !== Number(existing?.id)) {
    throw authError(
      "PHONE_ALREADY_REGISTERED",
      "이미 다른 계정에서 사용 중인 전화번호입니다.",
      409,
    );
  }

  let userId = Number(existing?.id || 0);
  let createdPendingUser = false;
  if (!userId) {
    const [result] = await db.execute(
      `INSERT INTO users (kakao_id, account_email, name, status, account_type)
       VALUES (NULL, ?, ?, 'pending_email', 'human')`,
      [email, name],
    );
    userId = Number(result.insertId);
    createdPendingUser = true;
    if (unlinkedMemberStudentId) {
      const [linkResult] = await db.execute(
        "UPDATE members SET user_id = ? WHERE student_id = ? AND user_id IS NULL",
        [userId, unlinkedMemberStudentId],
      );
      if (linkResult.affectedRows !== 1) {
        await db.execute("DELETE FROM users WHERE id = ?", [userId]);
        throw authError(
          "REGISTRATION_IDENTITY_CONFLICT",
          "The member was linked by another account. Please try again.",
          409,
        );
      }
    }
  }

  if (!isEmailVerificationEnabled()) {
    await db.execute(
      `UPDATE users
          SET account_email = ?, password_hash = ?, name = ?, phone_number = ?,
              status = 'active', email_verified_at = NULL
        WHERE id = ?`,
      [email, passwordHash, name, phone, userId],
    );
    const [users] = await db.execute(
      `SELECT u.id, COALESCE(m.authority + 0, u.system_authority + 0, 1) AS session_authority
         FROM users u LEFT JOIN members m ON m.user_id = u.id WHERE u.id = ? LIMIT 1`,
      [userId],
    );
    return { activated: true, email, user: users[0] };
  }

  let challengeId;
  try {
    challengeId = await createChallenge(
      {
        id: userId,
        account_email: existing?.account_email || email,
        delivery_email: email,
      },
      "register",
      { email, passwordHash, name, phone },
    );
  } catch (error) {
    // 2026-08-23: A failed SMTP call must not leave a new email reserved by an unusable pending account.
    if (createdPendingUser)
      await db.execute("DELETE FROM users WHERE id = ?", [userId]);
    throw error;
  }
  return { challengeId, userId, email };
}

async function startLogin(emailValue, password, trustedToken) {
  const email = normalizeEmail(emailValue);
  const [rows] = await db.execute(
    `SELECT u.id, u.account_email, u.password_hash, u.status,
            COALESCE(m.authority + 0, u.system_authority + 0, 1) AS session_authority
       FROM users u LEFT JOIN members m ON m.user_id = u.id
      WHERE u.account_email = ? AND u.account_type = 'human' LIMIT 1`,
    [email],
  );
  const user = rows[0];
  if (
    !user ||
    user.status !== "active" ||
    !user.password_hash ||
    !(await verifyPassword(password, user.password_hash))
  ) {
    throw authError(
      "INVALID_CREDENTIALS",
      "이메일 주소나 비밀번호가 일치하지 않습니다.",
      401,
    );
  }

  if (!isEmailVerificationEnabled()) {
    return { authenticated: true, trusted: false, user };
  }

  if (trustedToken) {
    const [devices] = await db.execute(
      `SELECT id FROM trusted_login_devices
        WHERE user_id = ? AND token_hash = ? AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1`,
      [user.id, digest(trustedToken)],
    );
    if (devices[0]) {
      await db.execute(
        "UPDATE trusted_login_devices SET last_used_at = NOW() WHERE id = ?",
        [devices[0].id],
      );
      return { trusted: true, user };
    }
  }
  const challengeId = await createChallenge(user, "login");
  return { trusted: false, challengeId, user };
}

async function verifyChallenge({ challengeId, userId, purpose, code }) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT * FROM email_auth_challenges
        WHERE id = ? AND user_id = ? AND purpose = ? AND consumed_at IS NULL
        LIMIT 1 FOR UPDATE`,
      [challengeId, userId, purpose],
    );
    const challenge = rows[0];
    if (!challenge || new Date(challenge.expires_at) <= new Date()) {
      throw authError("EMAIL_CODE_EXPIRED", "인증번호가 만료되었습니다.", 410);
    }
    if (Number(challenge.attempts) >= MAX_CODE_ATTEMPTS) {
      throw authError(
        "EMAIL_CODE_LOCKED",
        "인증번호 입력 횟수를 초과했습니다.",
        429,
      );
    }

    const expected = Buffer.from(challenge.code_hash, "hex");
    const actual = Buffer.from(
      codeDigest(userId, purpose, String(code || "")),
      "hex",
    );
    if (
      expected.length !== actual.length ||
      !crypto.timingSafeEqual(expected, actual)
    ) {
      await connection.execute(
        "UPDATE email_auth_challenges SET attempts = attempts + 1 WHERE id = ?",
        [challenge.id],
      );
      await connection.commit();
      throw authError("INVALID_EMAIL_CODE", "인증번호가 올바르지 않습니다.");
    }

    if (purpose === "register") {
      if (
        !challenge.pending_account_email ||
        !challenge.pending_password_hash ||
        !challenge.pending_name ||
        !challenge.pending_phone_number
      ) {
        throw authError(
          "INVALID_REGISTRATION_CHALLENGE",
          "가입 정보가 유효하지 않습니다. 회원가입을 다시 진행해 주세요.",
          409,
        );
      }
      await connection.execute(
        `UPDATE users
            SET account_email = ?, password_hash = ?, name = ?, phone_number = ?,
                status = 'active', email_verified_at = NOW()
          WHERE id = ?`,
        [
          challenge.pending_account_email,
          challenge.pending_password_hash,
          challenge.pending_name,
          challenge.pending_phone_number,
          userId,
        ],
      );
    }

    await connection.execute(
      "UPDATE email_auth_challenges SET consumed_at = NOW() WHERE id = ?",
      [challenge.id],
    );
    const [users] = await connection.execute(
      `SELECT u.id, COALESCE(m.authority + 0, u.system_authority + 0, 1) AS session_authority
         FROM users u LEFT JOIN members m ON m.user_id = u.id WHERE u.id = ? LIMIT 1`,
      [userId],
    );
    if (!users[0])
      throw authError("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.", 404);
    await connection.commit();
    return users[0];
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function createTrustedDevice(userId, label) {
  const token = crypto.randomBytes(32).toString("base64url");
  await db.execute(
    `INSERT INTO trusted_login_devices (user_id, token_hash, device_label, expires_at)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
    [
      userId,
      digest(token),
      String(label || "브라우저").slice(0, 120),
      TRUSTED_DEVICE_DAYS,
    ],
  );
  return token;
}

async function revokeTrustedDevice(token) {
  if (token) {
    await db.execute(
      "UPDATE trusted_login_devices SET revoked_at = NOW() WHERE token_hash = ?",
      [digest(token)],
    );
  }
}

module.exports = {
  createTrustedDevice,
  isEmailVerificationEnabled,
  revokeTrustedDevice,
  startLogin,
  startRegistration,
  verifyChallenge,
};
