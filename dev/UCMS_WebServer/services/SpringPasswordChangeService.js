function passwordChangeError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

// 2026-08-23: Preserve the Node browser session boundary while Spring owns password mutation.
async function changePassword(userId, body) {
  const baseUrl = String(process.env.SPRING_MAIL_BASE_URL || "").replace(/\/$/, "");
  const internalToken = process.env.UCMS_INTERNAL_MAIL_TOKEN;
  if (!baseUrl || !internalToken) {
    throw passwordChangeError("PASSWORD_CHANGE_NOT_CONFIGURED", "비밀번호 변경 서비스를 사용할 수 없습니다.", 503);
  }

  let response;
  try {
    response = await fetch(`${baseUrl}/api/v2/internal/auth/password/change`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-UCMS-Internal-Token": internalToken,
        "X-UCMS-User-Id": String(userId),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (_error) {
    throw passwordChangeError("PASSWORD_CHANGE_UNAVAILABLE", "비밀번호 변경 서비스에 연결할 수 없습니다.", 503);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw passwordChangeError(
      payload.code || "PASSWORD_CHANGE_FAILED",
      payload.message || "비밀번호를 변경하지 못했습니다.",
      response.status,
    );
  }
  return payload;
}

module.exports = { changePassword };
