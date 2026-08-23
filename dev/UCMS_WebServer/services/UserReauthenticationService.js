const db = require("../models/db");

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

// 2026-08-22: Expose only the account state needed to force email 2FA on the next login.
async function listUsersForReauthentication(currentUserId) {
  const [users] = await db.execute(
    `SELECT u.id,
            u.name AS user_name,
            u.status,
            u.account_type,
            u.system_key,
            u.system_authority,
            u.account_email,
            u.phone_number,
            u.password_hash IS NOT NULL AS password_configured,
            COUNT(t.id) AS trusted_device_count,
            m.student_id,
            m.name AS member_name,
            m.authority
       FROM users u
       LEFT JOIN members m ON m.user_id = u.id
       LEFT JOIN trusted_login_devices t
         ON t.user_id = u.id
        AND t.revoked_at IS NULL
        AND t.expires_at > NOW()
      GROUP BY u.id, u.name, u.status, u.account_type, u.system_key,
               u.system_authority, u.account_email, u.password_hash,
               u.phone_number,
               m.student_id, m.name, m.authority
      ORDER BY COALESCE(m.name, u.name), u.id`,
  );

  return users.map((user) => {
    const memberLinked = Boolean(user.student_id);
    const isCurrentUser = Number(user.id) === Number(currentUserId);
    return {
      id: Number(user.id),
      name: user.member_name || user.user_name,
      studentId: user.student_id || null,
      authority: user.authority || user.system_authority || "일반",
      status: user.status,
      accountType: user.account_type,
      systemKey: user.system_key || null,
      email: user.account_email || null,
      phoneNumber: user.phone_number || null,
      passwordConfigured: Boolean(user.password_configured),
      trustedDeviceCount: Number(user.trusted_device_count || 0),
      memberLinked,
      isCurrentUser,
      canForceReauthentication:
        user.account_type === "human" &&
        !isCurrentUser &&
        user.status === "active" &&
        Boolean(user.password_configured),
    };
  });
}

// 2026-08-22: Revoke trusted devices and sessions without clearing verified identity or the password.
async function forceUserReauthentication(targetUserIdValue, requestedByUserIdValue) {
  const targetUserId = parseUserId(targetUserIdValue);
  const requestedByUserId = parseUserId(requestedByUserIdValue);
  if (!targetUserId || !requestedByUserId) {
    throw serviceError("INVALID_USER_ID", "A valid user ID is required.", 400);
  }
  if (targetUserId === requestedByUserId) {
    throw serviceError(
      "SELF_REAUTHENTICATION_FORBIDDEN",
      "You cannot force reauthentication for your own account.",
      409,
    );
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [targets] = await connection.execute(
      `SELECT u.id, u.status, u.account_type, u.password_hash,
              COALESCE(m.student_id, u.student_id) AS student_id,
              COALESCE(m.name, u.name) AS name
         FROM users u
         LEFT JOIN members m ON m.user_id = u.id
        WHERE u.id = ?
        FOR UPDATE`,
      [targetUserId],
    );
    const target = targets[0];
    if (!target) {
      throw serviceError("USER_NOT_FOUND", "The user was not found.", 404);
    }
    if (target.account_type !== "human") {
      throw serviceError(
        "SYSTEM_ACCOUNT_REAUTHENTICATION_FORBIDDEN",
        "A system account cannot be sent through email reauthentication.",
        409,
      );
    }
    if (target.status !== "active" || !target.password_hash) {
      throw serviceError(
        "REAUTHENTICATION_ALREADY_REQUIRED",
        "The user does not have an active password login.",
        409,
      );
    }

    const [requesters] = await connection.execute(
      "SELECT name FROM users WHERE id = ? FOR UPDATE",
      [requestedByUserId],
    );
    if (!requesters[0]) {
      throw serviceError("REQUESTER_NOT_FOUND", "The administrator was not found.", 409);
    }

    const [trustedDeviceResult] = await connection.execute(
      `UPDATE trusted_login_devices
          SET revoked_at = NOW()
        WHERE user_id = ?
          AND revoked_at IS NULL`,
      [targetUserId],
    );

    const [sessionResult] = await connection.execute(
      `DELETE FROM sessions
        WHERE JSON_VALUE(
                data,
                '$.userId' RETURNING UNSIGNED NULL ON EMPTY NULL ON ERROR
              ) = ?`,
      [targetUserId],
    );

    await connection.execute(
      `INSERT INTO user_reauthentication_audits
         (target_user_id, target_student_id, target_name,
          requested_by_user_id, requested_by_name, cleared_session_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        targetUserId,
        target.student_id || "unlinked",
        target.name,
        requestedByUserId,
        requesters[0].name,
        sessionResult.affectedRows,
      ],
    );

    await connection.commit();
    return {
      userId: targetUserId,
      status: "active",
      clearedSessionCount: sessionResult.affectedRows,
      revokedTrustedDeviceCount: trustedDeviceResult.affectedRows,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  forceUserReauthentication,
  listUsersForReauthentication,
};
