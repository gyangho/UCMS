package net.gyangho.ucms.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import org.bouncycastle.crypto.generators.SCrypt;
import org.springframework.stereotype.Component;

@Component
public class PasswordHashService {

	private static final int SCRYPT_N = 16384;
	private static final int SCRYPT_R = 8;
	private static final int SCRYPT_P = 1;
	private static final int KEY_LENGTH = 64;
	private static final char[] RANDOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789".toCharArray();
	private final SecureRandom secureRandom = new SecureRandom();

	// 2026-08-23: Keep Spring-issued credentials byte-compatible with the existing Node login verifier.
	String generateTemporaryPassword() {
		StringBuilder password = new StringBuilder("Ucms!");
		for (int index = 0; index < 11; index += 1) {
			password.append(RANDOM_ALPHABET[secureRandom.nextInt(RANDOM_ALPHABET.length)]);
		}
		return password.toString();
	}

	String encode(String password) {
		byte[] salt = new byte[16];
		secureRandom.nextBytes(salt);
		byte[] derived = SCrypt.generate(
			password.getBytes(StandardCharsets.UTF_8), salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, KEY_LENGTH
		);
		Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
		return "scrypt$" + SCRYPT_N + "$" + SCRYPT_R + "$" + SCRYPT_P + "$"
			+ encoder.encodeToString(salt) + "$" + encoder.encodeToString(derived);
	}

	boolean matches(String password, String encoded) {
		try {
			String[] parts = encoded == null ? new String[0] : encoded.split("\\$");
			if (parts.length != 6 || !"scrypt".equals(parts[0])) return false;
			byte[] salt = Base64.getUrlDecoder().decode(parts[4]);
			byte[] expected = Base64.getUrlDecoder().decode(parts[5]);
			byte[] actual = SCrypt.generate(
				password.getBytes(StandardCharsets.UTF_8), salt,
				Integer.parseInt(parts[1]), Integer.parseInt(parts[2]), Integer.parseInt(parts[3]), expected.length
			);
			return MessageDigest.isEqual(expected, actual);
		} catch (IllegalArgumentException exception) {
			return false;
		}
	}
}
