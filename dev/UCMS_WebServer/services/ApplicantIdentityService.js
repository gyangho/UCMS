const crypto = require("crypto");

const LOOKUP_WINDOW_MS = 15 * 60 * 1000;
const LOOKUP_LIMIT = 10;
const lookupAttempts = new Map();

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLocaleLowerCase("ko-KR");
}

function normalizePhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0082")) digits = digits.slice(2);
  if (digits.startsWith("82")) {
    const nationalNumber = digits.slice(2);
    digits = nationalNumber.startsWith("0")
      ? nationalNumber
      : `0${nationalNumber}`;
  }
  return digits;
}

function normalizeStudentId(value) {
  const studentId = String(value ?? "").trim();
  return /^\d{4,20}$/.test(studentId) ? studentId : null;
}

function fingerprint(value) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for applicant identity verification.");
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function consumeLookupAttempt(keyMaterial) {
  const now = Date.now();
  if (lookupAttempts.size > 5000) {
    for (const [key, value] of lookupAttempts) {
      if (value.resetAt <= now) lookupAttempts.delete(key);
    }
  }

  const key = fingerprint(String(keyMaterial || "unknown"));
  const current = lookupAttempts.get(key);
  const bucket =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + LOOKUP_WINDOW_MS }
      : current;
  if (bucket.count >= LOOKUP_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  bucket.count += 1;
  lookupAttempts.set(key, bucket);
  return {
    allowed: true,
    remaining: LOOKUP_LIMIT - bucket.count,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

function setLookupRateLimitHeaders(res, rateLimit) {
  res.set("X-RateLimit-Limit", String(LOOKUP_LIMIT));
  res.set("X-RateLimit-Remaining", String(rateLimit.remaining));
  if (!rateLimit.allowed) {
    res.set("Retry-After", String(rateLimit.retryAfterSeconds));
  }
}

function createVerifiedAccountIdentity(name, phone) {
  const normalizedName = normalizeName(name);
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedName || normalizedPhone.length < 10) return null;
  return {
    source: "verified-account",
    nameHash: fingerprint(normalizedName),
    phoneHash: fingerprint(normalizedPhone),
  };
}

function safeHashEquals(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return (
    leftBuffer.length === rightBuffer.length &&
    leftBuffer.length > 0 &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function applicationMatchesIdentity(application, identity) {
  if (!identity || identity.source !== "verified-account") return false;
  const nameHash = fingerprint(normalizeName(application.name));
  const phoneHash = fingerprint(normalizePhone(application.phone));
  return (
    safeHashEquals(nameHash, identity.nameHash) &&
    safeHashEquals(phoneHash, identity.phoneHash)
  );
}

async function findOwnApplications(studentId, identity) {
  const db = require("../models/db");
  const [applications] = await db.execute(
    `SELECT rm.*, fl.title AS form_title
       FROM recruiting_members rm
       LEFT JOIN formlist fl ON fl.id = rm.form_id
      WHERE rm.student_id = ?
      ORDER BY rm.synced_at DESC`,
    [studentId],
  );
  return applications.filter((application) =>
    applicationMatchesIdentity(application, identity),
  );
}

// 2026-08-22: Bind applicant lookup to the verified UCMS account identity without copying PII into the session.
module.exports = {
  consumeLookupAttempt,
  createVerifiedAccountIdentity,
  findOwnApplications,
  normalizeName,
  normalizePhone,
  normalizeStudentId,
  setLookupRateLimitHeaders,
};
