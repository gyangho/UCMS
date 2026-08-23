function adminError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

// 2026-08-23: Node validates its existing admin session and delegates new user mutations to Spring.
async function requestUserMutation({ method, userId, actorUserId, body }) {
  const baseUrl = String(process.env.SPRING_MAIL_BASE_URL || "").replace(/\/$/, "");
  const internalToken = process.env.UCMS_INTERNAL_MAIL_TOKEN;
  if (!baseUrl || !internalToken) {
    throw adminError("SPRING_ADMIN_NOT_CONFIGURED", "사용자 관리 서비스를 사용할 수 없습니다.", 503);
  }

  let response;
  try {
    response = await fetch(`${baseUrl}/api/v2/internal/admin/users/${userId}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-UCMS-Internal-Token": internalToken,
        "X-UCMS-Actor-User-Id": String(actorUserId),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (_error) {
    throw adminError("SPRING_ADMIN_UNAVAILABLE", "사용자 관리 서비스에 연결할 수 없습니다.", 503);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw adminError(
      payload.code || "USER_ADMIN_FAILED",
      payload.message || "사용자 정보를 변경하지 못했습니다.",
      response.status,
    );
  }
  return payload;
}

function updateUser(userId, actorUserId, body) {
  return requestUserMutation({ method: "PATCH", userId, actorUserId, body });
}

function deleteUser(userId, actorUserId) {
  return requestUserMutation({ method: "DELETE", userId, actorUserId });
}

module.exports = { deleteUser, updateUser };
