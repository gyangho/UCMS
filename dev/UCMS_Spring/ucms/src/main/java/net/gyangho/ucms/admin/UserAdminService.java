package net.gyangho.ucms.admin;

import java.util.Locale;
import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserAdminService {

	private final JdbcTemplate jdbcTemplate;

	public UserAdminService(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	@Transactional
	public Map<String, Object> update(long actorUserId, long targetUserId, UserAdminUpdateRequest request) {
		verifyAdministrator(actorUserId);
		Target target = lockTarget(targetUserId);
		verifyMutableTarget(actorUserId, target);

		String email = nullableLowercase(request.accountEmail());
		String phone = normalizePhone(request.phoneNumber());
		String name = request.name().trim();
		String status = request.status();
		if (status == null || status.isBlank()) status = target.status();
		boolean emailChanged = !java.util.Objects.equals(email, target.accountEmail());

		try {
			jdbcTemplate.update(
				"""
				UPDATE users
				   SET name = ?, account_email = ?, phone_number = ?, status = ?,
				       password_hash = CASE WHEN ? THEN NULL ELSE password_hash END,
				       email_verified_at = CASE WHEN ? THEN NULL ELSE email_verified_at END
				 WHERE id = ?
				""",
				name, email, phone, emailChanged ? "pending_relink" : status,
				emailChanged, emailChanged, targetUserId
			);
		} catch (DataIntegrityViolationException exception) {
			throw new UserAdminException("USER_VALUE_CONFLICT", "이메일 또는 전화번호가 다른 계정과 중복됩니다.", HttpStatus.CONFLICT);
		}

		if (emailChanged || "disabled".equals(status)) revokeLoginState(targetUserId);
		return Map.of("userId", targetUserId, "emailChanged", emailChanged);
	}

	@Transactional
	public Map<String, Object> delete(long actorUserId, long targetUserId) {
		verifyAdministrator(actorUserId);
		Target target = lockTarget(targetUserId);
		verifyMutableTarget(actorUserId, target);
		if (target.memberLinked()) {
			throw new UserAdminException("MEMBER_LINKED_USER", "회원과 연결된 계정은 삭제할 수 없습니다.", HttpStatus.CONFLICT);
		}

		try {
			revokeLoginState(targetUserId);
			jdbcTemplate.update("DELETE FROM users WHERE id = ?", targetUserId);
		} catch (DataIntegrityViolationException exception) {
			throw new UserAdminException("USER_HAS_REFERENCES", "작성 데이터가 남아 있는 계정은 삭제할 수 없습니다. 먼저 비활성화해 주세요.", HttpStatus.CONFLICT);
		}
		return Map.of("userId", targetUserId, "deleted", true);
	}

	private void verifyAdministrator(long actorUserId) {
		Integer authority = jdbcTemplate.query(
			"""
			SELECT COALESCE(m.authority + 0, u.system_authority + 0, 1)
			  FROM users u LEFT JOIN members m ON m.user_id = u.id
			 WHERE u.id = ? AND u.status <> 'disabled'
			""",
			resultSet -> resultSet.next() ? resultSet.getInt(1) : null,
			actorUserId
		);
		if (authority == null || authority < 6) {
			throw new UserAdminException("ADMIN_REQUIRED", "관리자 권한이 필요합니다.", HttpStatus.FORBIDDEN);
		}
	}

	private Target lockTarget(long targetUserId) {
		return jdbcTemplate.query(
			"""
			SELECT u.id, u.account_email, u.status, u.account_type,
			       EXISTS(SELECT 1 FROM members m WHERE m.user_id = u.id) AS member_linked
			  FROM users u WHERE u.id = ? FOR UPDATE
			""",
			resultSet -> resultSet.next()
				? new Target(resultSet.getLong("id"), resultSet.getString("account_email"),
					resultSet.getString("status"), resultSet.getString("account_type"),
					resultSet.getBoolean("member_linked"))
				: null,
			targetUserId
		);
	}

	private void verifyMutableTarget(long actorUserId, Target target) {
		if (target == null) throw new UserAdminException("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
		if (target.id() == actorUserId) throw new UserAdminException("SELF_MANAGEMENT_FORBIDDEN", "현재 로그인한 계정은 수정하거나 삭제할 수 없습니다.", HttpStatus.CONFLICT);
		if (!"human".equals(target.accountType())) throw new UserAdminException("SYSTEM_ACCOUNT_PROTECTED", "시스템 계정은 수정하거나 삭제할 수 없습니다.", HttpStatus.CONFLICT);
	}

	private void revokeLoginState(long userId) {
		jdbcTemplate.update("UPDATE trusted_login_devices SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL", userId);
		jdbcTemplate.update("DELETE FROM sessions WHERE JSON_VALUE(data, '$.userId' RETURNING UNSIGNED NULL ON EMPTY NULL ON ERROR) = ?", userId);
	}

	private String nullableLowercase(String value) {
		String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
		return normalized.isEmpty() ? null : normalized;
	}

	private String normalizePhone(String value) {
		String digits = value == null ? "" : value.replaceAll("\\D", "");
		if (digits.isEmpty()) return null;
		if (digits.length() < 10 || digits.length() > 11) {
			throw new UserAdminException("INVALID_PHONE", "전화번호는 숫자 10~11자리여야 합니다.", HttpStatus.BAD_REQUEST);
		}
		return digits;
	}

	private record Target(long id, String accountEmail, String status, String accountType, boolean memberLinked) {
	}
}
