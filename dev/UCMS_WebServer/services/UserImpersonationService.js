const crypto = require("crypto");
const db = require("../models/db");

const SYSTEM_TEST_ADMIN_KEY = "ui-test-admin";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const READ_ONLY_ALLOWED_MUTATIONS = new Set([
  "/api/admin/impersonation/exit",
  "/api/auth/logout",
  "/auth/logout",
]);
const IMPERSONATION_BLOCKED_SECURITY_MUTATIONS = [
  /^\/api\/admin\/users\/\d+\/force-reauthentication$/,
  /^\/api\/drive\/oauth\/start$/,
  /^\/api\/user\/me$/,
];

function serviceError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function parseUserId(value) {
  const userId = Number(value);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

function normalizeReason(value) {
  const reason = String(value || "").trim();
  if (reason.length < 3 || reason.length > 255) {
    throw serviceError(
      "INVALID_IMPERSONATION_REASON",
      "An impersonation reason between 3 and 255 characters is required.",
      400,
    );
  }
  return reason;
}

function sessionFingerprint(sessionId) {
  return crypto.createHash("sha256").update(String(sessionId)).digest("hex");
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => (error ? reject(error) : resolve()));
  });
}

async function getSessionIdentity(connection, userId, lock = false) {
  const [users] = await connection.execute(
    `SELECT u.id,
            u.name,
            u.status,
            u.account_type,
            u.system_key,
            COALESCE(m.student_id, NULL) AS student_id,
            COALESCE(m.name, u.name) AS display_name,
            COALESCE(m.authority, u.system_authority, '일반') AS authority_label,
            COALESCE(m.authority + 0, u.system_authority + 0, 1) AS session_authority
       FROM users u
       LEFT JOIN members m ON m.user_id = u.id
      WHERE u.id = ?${lock ? " FOR UPDATE" : ""}`,
    [userId],
  );
  return users[0] || null;
}

// 2026-08-22: List only identities that an authenticated human admin may enter for auditable UI verification.
async function listImpersonationTargets(currentUserId) {
  const requesterId = parseUserId(currentUserId);
  if (!requesterId) {
    throw serviceError("INVALID_USER_ID", "A valid user ID is required.", 400);
  }

  const requester = await getSessionIdentity(db, requesterId);
  if (
    !requester ||
    requester.account_type !== "human" ||
    requester.authority_label !== "admin"
  ) {
    throw serviceError(
      "IMPERSONATION_ADMIN_REQUIRED",
      "Only a human administrator can start impersonation.",
      403,
    );
  }

  const [targets] = await db.execute(
    `SELECT u.id,
            u.status,
            u.account_type,
            u.system_key,
            COALESCE(m.student_id, NULL) AS student_id,
            COALESCE(m.name, u.name) AS display_name,
            COALESCE(m.authority, u.system_authority, '일반') AS authority_label
       FROM users u
       LEFT JOIN members m ON m.user_id = u.id
      WHERE u.id <> ?
        AND u.status <> 'disabled'
      ORDER BY (u.system_key = ?) DESC,
               FIELD(COALESCE(m.authority, u.system_authority, '일반'),
                     'admin', '회장', '부회장', '임원진', '부원', '일반', '미인증'),
               COALESCE(m.name, u.name),
               u.id`,
    [requesterId, SYSTEM_TEST_ADMIN_KEY],
  );

  return targets.map((target) => ({
    id: Number(target.id),
    name: target.display_name,
    studentId: target.student_id || null,
    authority: target.authority_label,
    status: target.status,
    accountType: target.account_type,
    systemKey: target.system_key || null,
    readOnly: target.account_type !== "system",
  }));
}

async function restoreActorSession(req, actor) {
  await regenerateSession(req);
  req.session.userId = Number(actor.id);
  req.session.authority = Number(actor.session_authority);
  await saveSession(req);
}

// 2026-08-22: Regenerate the session on identity changes and retain the human admin as the immutable actor.
async function startUserImpersonation(req, targetUserIdValue, reasonValue) {
  if (req.session?.impersonation) {
    throw serviceError(
      "NESTED_IMPERSONATION_FORBIDDEN",
      "End the current impersonation before starting another one.",
      409,
    );
  }

  const actorUserId = parseUserId(req.session?.userId);
  const targetUserId = parseUserId(targetUserIdValue);
  const reason = normalizeReason(reasonValue);
  if (!actorUserId || !targetUserId) {
    throw serviceError("INVALID_USER_ID", "A valid user ID is required.", 400);
  }
  if (actorUserId === targetUserId) {
    throw serviceError(
      "SELF_IMPERSONATION_FORBIDDEN",
      "You cannot impersonate your current account.",
      409,
    );
  }

  const connection = await db.getConnection();
  let actor = null;
  let sessionChanged = false;
  try {
    await connection.beginTransaction();
    actor = await getSessionIdentity(connection, actorUserId, true);
    const target = await getSessionIdentity(connection, targetUserId, true);

    if (
      !actor ||
      actor.account_type !== "human" ||
      actor.authority_label !== "admin"
    ) {
      throw serviceError(
        "IMPERSONATION_ADMIN_REQUIRED",
        "Only a human administrator can start impersonation.",
        403,
      );
    }
    if (!target) {
      throw serviceError("USER_NOT_FOUND", "The target user was not found.", 404);
    }
    if (target.status === "disabled") {
      throw serviceError(
        "IMPERSONATION_TARGET_DISABLED",
        "A disabled user cannot be impersonated.",
        409,
      );
    }

    const allowMutations = target.account_type === "system";
    await regenerateSession(req);
    sessionChanged = true;
    req.session.userId = Number(target.id);
    req.session.authority = Number(target.session_authority);
    req.session.impersonation = {
      actorUserId: Number(actor.id),
      actorName: actor.display_name,
      actorAuthority: Number(actor.session_authority),
      targetUserId: Number(target.id),
      targetName: target.display_name,
      targetSystemKey: target.system_key || null,
      allowMutations,
      reason,
      startedAt: new Date().toISOString(),
    };
    await saveSession(req);

    await connection.execute(
      `INSERT INTO user_impersonation_audits
         (actor_user_id, actor_name, target_user_id, target_name, action,
          reason, read_only, session_fingerprint)
       VALUES (?, ?, ?, ?, 'started', ?, ?, ?)`,
      [
        actor.id,
        actor.display_name,
        target.id,
        target.display_name,
        reason,
        allowMutations ? 0 : 1,
        sessionFingerprint(req.sessionID),
      ],
    );
    await connection.commit();

    return {
      active: true,
      actorName: actor.display_name,
      targetUserId: Number(target.id),
      targetName: target.display_name,
      readOnly: !allowMutations,
      systemTestAccount: target.system_key === SYSTEM_TEST_ADMIN_KEY,
    };
  } catch (error) {
    await connection.rollback();
    if (sessionChanged && actor) {
      try {
      await restoreActorSession(req, actor);
      } catch (restoreError) {
        await destroySession(req).catch(() => {});
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function stopUserImpersonation(req) {
  const impersonation = req.session?.impersonation;
  const actorUserId = parseUserId(impersonation?.actorUserId);
  const targetUserId = parseUserId(impersonation?.targetUserId);
  if (!actorUserId || !targetUserId) {
    throw serviceError(
      "IMPERSONATION_NOT_ACTIVE",
      "There is no active impersonation session.",
      409,
    );
  }

  const connection = await db.getConnection();
  try {
    const actor = await getSessionIdentity(connection, actorUserId);
    if (!actor) {
      await destroySession(req);
      throw serviceError(
        "IMPERSONATION_ACTOR_MISSING",
        "The original administrator no longer exists. The session was closed.",
        401,
      );
    }

    await restoreActorSession(req, actor);
    await connection.execute(
      `INSERT INTO user_impersonation_audits
         (actor_user_id, actor_name, target_user_id, target_name, action,
          reason, read_only, session_fingerprint)
       VALUES (?, ?, ?, ?, 'ended', ?, ?, ?)`,
      [
        actor.id,
        actor.display_name,
        targetUserId,
        impersonation.targetName,
        impersonation.reason,
        impersonation.allowMutations ? 0 : 1,
        sessionFingerprint(req.sessionID),
      ],
    );

    return {
      active: false,
      userId: Number(actor.id),
      userName: actor.display_name,
    };
  } finally {
    connection.release();
  }
}

function isImpersonationMutationBlocked(method, requestPath, impersonation) {
  if (!impersonation) return false;
  if (SAFE_METHODS.has(String(method).toUpperCase())) return false;
  if (READ_ONLY_ALLOWED_MUTATIONS.has(requestPath)) return false;
  if (
    IMPERSONATION_BLOCKED_SECURITY_MUTATIONS.some((pattern) =>
      pattern.test(requestPath),
    )
  ) {
    return true;
  }
  return !impersonation.allowMutations;
}

module.exports = {
  SYSTEM_TEST_ADMIN_KEY,
  isImpersonationMutationBlocked,
  listImpersonationTargets,
  startUserImpersonation,
  stopUserImpersonation,
};
