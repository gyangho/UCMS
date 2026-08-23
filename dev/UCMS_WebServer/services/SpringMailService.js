function mailError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

// 2026-08-23: Keep Node as a compatibility adapter while Spring owns new SMTP delivery behavior.
async function sendMail({ to, subject, text }) {
  const baseUrl = String(process.env.SPRING_MAIL_BASE_URL || "").replace(/\/$/, "");
  const internalToken = process.env.UCMS_INTERNAL_MAIL_TOKEN;
  if (!baseUrl || !internalToken) {
    throw mailError(
      "SPRING_MAIL_NOT_CONFIGURED",
      "메일 발송 서비스가 설정되지 않았습니다.",
      503,
    );
  }

  let response;
  try {
    response = await fetch(`${baseUrl}/api/v2/internal/mail/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-UCMS-Internal-Token": internalToken,
      },
      body: JSON.stringify({ to, subject, content: text }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (_error) {
    throw mailError(
      "SPRING_MAIL_UNAVAILABLE",
      "메일 발송 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      503,
    );
  }

  if (!response.ok) {
    throw mailError(
      "SPRING_MAIL_SEND_FAILED",
      "인증 메일을 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      502,
    );
  }
}

module.exports = { sendMail };
