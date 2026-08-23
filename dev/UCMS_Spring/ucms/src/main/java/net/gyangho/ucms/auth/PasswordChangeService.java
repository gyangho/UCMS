package net.gyangho.ucms.auth;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PasswordChangeService {
	private final JdbcTemplate jdbcTemplate;
	private final PasswordHashService passwordHashService;

	public PasswordChangeService(JdbcTemplate jdbcTemplate, PasswordHashService passwordHashService) {
		this.jdbcTemplate = jdbcTemplate;
		this.passwordHashService = passwordHashService;
	}

	@Transactional
	public void change(long userId, PasswordChangeRequest request) {
		List<String> hashes = jdbcTemplate.query(
			"SELECT password_hash FROM users WHERE id = ? AND account_type = 'human' AND status = 'active' FOR UPDATE",
			(resultSet, rowNumber) -> resultSet.getString("password_hash"),
			userId
		);
		if (hashes.isEmpty()) {
			throw new PasswordChangeException("PASSWORD_ACCOUNT_UNAVAILABLE", "비밀번호를 변경할 수 없는 계정입니다.", HttpStatus.CONFLICT);
		}
		if (!passwordHashService.matches(request.currentPassword(), hashes.getFirst())) {
			// 2026-08-23: A wrong current password is form validation, not an expired browser session.
			throw new PasswordChangeException("CURRENT_PASSWORD_MISMATCH", "현재 비밀번호가 일치하지 않습니다.", HttpStatus.BAD_REQUEST);
		}
		if (passwordHashService.matches(request.newPassword(), hashes.getFirst())) {
			throw new PasswordChangeException("PASSWORD_UNCHANGED", "새 비밀번호는 현재 비밀번호와 달라야 합니다.", HttpStatus.CONFLICT);
		}

		// 2026-08-23: Revoke every login state after credential rotation so the user signs in again explicitly.
		jdbcTemplate.update("UPDATE users SET password_hash = ? WHERE id = ?", passwordHashService.encode(request.newPassword()), userId);
		jdbcTemplate.update("UPDATE trusted_login_devices SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL", userId);
		jdbcTemplate.update(
			"DELETE FROM sessions WHERE JSON_VALUE(data, '$.userId' RETURNING UNSIGNED NULL ON EMPTY NULL ON ERROR) = ?",
			userId
		);
	}
}
