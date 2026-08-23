package net.gyangho.ucms.auth;

import jakarta.validation.Valid;
import java.util.Map;
import net.gyangho.ucms.mail.InternalMailTokenVerifier;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v2/internal/auth/password")
public class InternalPasswordChangeController {
	private final InternalMailTokenVerifier tokenVerifier;
	private final PasswordChangeService passwordChangeService;

	public InternalPasswordChangeController(InternalMailTokenVerifier tokenVerifier, PasswordChangeService passwordChangeService) {
		this.tokenVerifier = tokenVerifier;
		this.passwordChangeService = passwordChangeService;
	}

	@PostMapping("/change")
	public ResponseEntity<Map<String, Boolean>> change(
		@RequestHeader(value = "X-UCMS-Internal-Token", required = false) String token,
		@RequestHeader("X-UCMS-User-Id") long userId,
		@Valid @RequestBody PasswordChangeRequest request
	) {
		tokenVerifier.verify(token);
		passwordChangeService.change(userId, request);
		return ResponseEntity.ok(Map.of("changed", true));
	}
}
