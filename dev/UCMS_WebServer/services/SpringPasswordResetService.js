function passwordResetError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

// 2026-08-23: Node exposes the public compatibility route while Spring owns reset generation, storage, and mail.
async function requestTemporaryPassword(email) {
  const baseUrl = String(process.env.SPRING_MAIL_BASE_URL || "").replace(/\/$/, "");
  const internalToken = process.env.UCMS_INTERNAL_MAIL_TOKEN;
  if (!baseUrl || !internalToken) {
    throw passwordResetError("PASSWORD_RESET_NOT_CONFIGURED", "비밀번호 찾기 서비스를 사용할 수 없습니다.", 503);
  }

  let response;
  try {
    response = await fetch(`${baseUrl}/api/v2/internal/auth/temporary-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-UCMS-Internal-Token": internalToken,
      },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (_error) {
    throw passwordResetError("PASSWORD_RESET_UNAVAILABLE", "비밀번호 찾기 서비스에 연결할 수 없습니다.", 503);
  }

  if (!response.ok && response.status !== 400) {
    throw passwordResetError("PASSWORD_RESET_FAILED", "임시 비밀번호 메일을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", 502);
  }
}

module.exports = { requestTemporaryPassword };
