package net.gyangho.ucms.mail;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Component
public class InternalMailTokenVerifier {

	private final String configuredToken;

	public InternalMailTokenVerifier(@Value("${ucms.mail.internal-token:}") String configuredToken) {
		this.configuredToken = configuredToken;
	}

	public void verify(String suppliedToken) {
		if (!StringUtils.hasText(configuredToken)) {
			throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Internal mail authentication is not configured.");
		}
		byte[] expected = configuredToken.getBytes(StandardCharsets.UTF_8);
		byte[] actual = String.valueOf(suppliedToken).getBytes(StandardCharsets.UTF_8);
		if (!MessageDigest.isEqual(expected, actual)) {
			throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid internal mail token.");
		}
	}
}
