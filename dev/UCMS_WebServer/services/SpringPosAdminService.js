function posAdminError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

// 2026-08-23: Existing Node sessions delegate new POS edits to the Spring mutation boundary.
async function updateInstance(instanceId, actorUserId, body) {
  const baseUrl = String(process.env.SPRING_MAIL_BASE_URL || "").replace(/\/$/, "");
  const internalToken = process.env.UCMS_INTERNAL_MAIL_TOKEN;
  if (!baseUrl || !internalToken) throw posAdminError("SPRING_POS_NOT_CONFIGURED", "POS 수정 서비스를 사용할 수 없습니다.", 503);
  let response;
  try {
    response = await fetch(`${baseUrl}/api/v2/internal/admin/pos/instances/${instanceId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-UCMS-Internal-Token": internalToken,
        "X-UCMS-Actor-User-Id": String(actorUserId),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (_error) {
    throw posAdminError("SPRING_POS_UNAVAILABLE", "POS 수정 서비스에 연결할 수 없습니다.", 503);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw posAdminError(payload.code || "POS_UPDATE_FAILED", payload.message || "POS 인스턴스를 수정하지 못했습니다.", response.status);
  return payload;
}

module.exports = { updateInstance };
