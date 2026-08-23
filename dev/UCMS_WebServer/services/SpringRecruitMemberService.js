function recruitMemberError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

// 2026-08-23: Delegate the new final-member mutation to Spring while retaining the existing Node session boundary.
async function registerFinalMembers(recruitmentId, actorUserId, generation) {
  const baseUrl = String(process.env.SPRING_MAIL_BASE_URL || "").replace(/\/$/, "");
  const internalToken = process.env.UCMS_INTERNAL_MAIL_TOKEN;
  if (!baseUrl || !internalToken) {
    throw recruitMemberError("SPRING_RECRUIT_NOT_CONFIGURED", "회원 등록 서비스를 사용할 수 없습니다.", 503);
  }
  let response;
  try {
    response = await fetch(`${baseUrl}/api/v2/internal/admin/recruitments/${recruitmentId}/final-members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-UCMS-Internal-Token": internalToken,
        "X-UCMS-Actor-User-Id": String(actorUserId),
      },
      body: JSON.stringify({ generation }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (_error) {
    throw recruitMemberError("SPRING_RECRUIT_UNAVAILABLE", "회원 등록 서비스에 연결할 수 없습니다.", 503);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw recruitMemberError(payload.code || "FINAL_MEMBER_REGISTRATION_FAILED", payload.message || "최종합격자를 회원으로 등록하지 못했습니다.", response.status);
  }
  return payload;
}

module.exports = { registerFinalMembers };
