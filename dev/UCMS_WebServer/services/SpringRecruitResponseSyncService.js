function responseSyncError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

// 2026-08-23: Keep Node at the authenticated-session boundary while Spring owns Google Forms synchronization.
async function syncRecruitResponses(recruitmentId, actorUserId) {
  const baseUrl = String(process.env.SPRING_MAIL_BASE_URL || "").replace(/\/$/, "");
  const internalToken = process.env.UCMS_INTERNAL_MAIL_TOKEN;
  if (!baseUrl || !internalToken) {
    throw responseSyncError("SPRING_RECRUIT_NOT_CONFIGURED", "지원자 응답 동기화 서비스를 사용할 수 없습니다.", 503);
  }
  let response;
  try {
    response = await fetch(`${baseUrl}/api/v2/internal/admin/recruitments/${recruitmentId}/responses/sync`, {
      method: "POST",
      headers: {
        "X-UCMS-Internal-Token": internalToken,
        "X-UCMS-Actor-User-Id": String(actorUserId),
      },
      signal: AbortSignal.timeout(60_000),
    });
  } catch (_error) {
    throw responseSyncError("SPRING_RECRUIT_UNAVAILABLE", "지원자 응답 동기화 서비스에 연결할 수 없습니다.", 503);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw responseSyncError(payload.code || "RESPONSE_SYNC_FAILED", payload.message || "지원자 응답을 동기화하지 못했습니다.", response.status);
  }
  return payload;
}

module.exports = { syncRecruitResponses };
