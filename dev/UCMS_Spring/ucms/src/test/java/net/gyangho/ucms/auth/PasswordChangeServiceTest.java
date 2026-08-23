package net.gyangho.ucms.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

@ExtendWith(MockitoExtension.class)
class PasswordChangeServiceTest {

	@Mock
	private JdbcTemplate jdbcTemplate;

	@Mock
	private PasswordHashService passwordHashService;

	@Test
	void reportsCurrentPasswordMismatchAsFormValidation() {
		// 2026-08-23: A typing error must not look like an expired UCMS login session.
		when(jdbcTemplate.query(anyString(), org.mockito.ArgumentMatchers.<RowMapper<String>>any(), eq(7L)))
			.thenReturn(List.of("stored-hash"));
		when(passwordHashService.matches("wrong-password", "stored-hash")).thenReturn(false);

		PasswordChangeService service = new PasswordChangeService(jdbcTemplate, passwordHashService);
		assertThatThrownBy(() -> service.change(7L, new PasswordChangeRequest("wrong-password", "new-password-1234")))
			.isInstanceOfSatisfying(PasswordChangeException.class, exception -> {
				assertThat(exception.getCode()).isEqualTo("CURRENT_PASSWORD_MISMATCH");
				assertThat(exception.getMessage()).isEqualTo("현재 비밀번호가 일치하지 않습니다.");
				assertThat(exception.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
			});
	}
}
