package net.gyangho.ucms.auth;

import java.util.List;
import java.util.Locale;
import net.gyangho.ucms.mail.MailService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TemporaryPasswordService {

	private static final int MAX_REQUESTS_PER_15_MINUTES = 3;

	private final JdbcTemplate jdbcTemplate;
	private final MailService mailService;
	private final PasswordHashService passwordHashService;

	public TemporaryPasswordService(
		JdbcTemplate jdbcTemplate,
		MailService mailService,
		PasswordHashService passwordHashService
	) {
		this.jdbcTemplate = jdbcTemplate;
		this.mailService = mailService;
		this.passwordHashService = passwordHashService;
	}

	@Transactional
	public void issue(String emailValue) {
		String email = emailValue.trim().toLowerCase(Locale.ROOT);
		List<Account> accounts = jdbcTemplate.query(
			"""
			SELECT id, account_email
			  FROM users
			 WHERE account_email = ? AND account_type = 'human' AND status = 'active'
			 LIMIT 1 FOR UPDATE
			""",
			(resultSet, rowNumber) -> new Account(resultSet.getLong("id"), resultSet.getString("account_email")),
			email
		);
		// 2026-08-23: Unknown or inactive accounts deliberately receive the same public response.
		if (accounts.isEmpty()) return;

		Account account = accounts.getFirst();
		Integer recentRequests = jdbcTemplate.queryForObject(
			"SELECT COUNT(*) FROM password_reset_requests WHERE user_id = ? AND requested_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)",
			Integer.class,
			account.id()
		);
		if (recentRequests != null && recentRequests >= MAX_REQUESTS_PER_15_MINUTES) return;

		String temporaryPassword = passwordHashService.generateTemporaryPassword();
		String passwordHash = passwordHashService.encode(temporaryPassword);
		jdbcTemplate.update("INSERT INTO password_reset_requests (user_id) VALUES (?)", account.id());
		Long requestId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
		jdbcTemplate.update("UPDATE users SET password_hash = ? WHERE id = ?", passwordHash, account.id());
		jdbcTemplate.update("UPDATE trusted_login_devices SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL", account.id());
		jdbcTemplate.update(
			"DELETE FROM sessions WHERE JSON_VALUE(data, '$.userId' RETURNING UNSIGNED NULL ON EMPTY NULL ON ERROR) = ?",
			account.id()
		);

		mailService.send(
			account.email(),
			"[UCMS] 임시 비밀번호 안내",
			"임시 비밀번호는 아래와 같습니다.\n\n" + temporaryPassword
				+ "\n\n로그인 후 안전한 비밀번호로 변경해 주세요.\n\n본인이 요청하지 않았다면 관리자에게 문의해 주세요."
		);
		jdbcTemplate.update("UPDATE password_reset_requests SET delivered_at = NOW() WHERE id = ?", requestId);
	}

	private record Account(long id, String email) {
	}
}
