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
@RequestMapping("/api/v2/internal/auth")
public class InternalTemporaryPasswordController {

	private final InternalMailTokenVerifier tokenVerifier;
	private final TemporaryPasswordService temporaryPasswordService;

	public InternalTemporaryPasswordController(
		InternalMailTokenVerifier tokenVerifier,
		TemporaryPasswordService temporaryPasswordService
	) {
		this.tokenVerifier = tokenVerifier;
		this.temporaryPasswordService = temporaryPasswordService;
	}

	@PostMapping("/temporary-password")
	public ResponseEntity<Map<String, Boolean>> issue(
		@RequestHeader(value = "X-UCMS-Internal-Token", required = false) String token,
		@Valid @RequestBody TemporaryPasswordRequest request
	) {
		// 2026-08-23: The public Node adapter never receives the generated password or account existence result.
		tokenVerifier.verify(token);
		temporaryPasswordService.issue(request.email());
		return ResponseEntity.accepted().body(Map.of("accepted", true));
	}
}
