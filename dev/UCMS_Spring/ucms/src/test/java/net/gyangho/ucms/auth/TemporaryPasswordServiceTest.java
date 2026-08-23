package net.gyangho.ucms.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.bouncycastle.crypto.generators.SCrypt;
import org.junit.jupiter.api.Test;

class TemporaryPasswordServiceTest {

	private final PasswordHashService service = new PasswordHashService();

	@Test
	void generatesStrongTemporaryPasswordAndNodeCompatibleScryptHash() {
		// 2026-08-23: Guard the cross-service password format used by Spring issuance and Node login.
		String password = service.generateTemporaryPassword();
		assertThat(password).hasSize(16).startsWith("Ucms!");

		String encoded = service.encode(password);
		String[] parts = encoded.split("\\$");
		assertThat(parts).hasSize(6);
		assertThat(parts[0]).isEqualTo("scrypt");

		byte[] salt = Base64.getUrlDecoder().decode(parts[4]);
		byte[] expected = Base64.getUrlDecoder().decode(parts[5]);
		byte[] actual = SCrypt.generate(
			password.getBytes(StandardCharsets.UTF_8),
			salt,
			Integer.parseInt(parts[1]),
			Integer.parseInt(parts[2]),
			Integer.parseInt(parts[3]),
			expected.length
		);
		assertThat(actual).isEqualTo(expected);
		assertThat(service.matches(password, encoded)).isTrue();
		assertThat(service.matches("wrong-password", encoded)).isFalse();
	}
}
