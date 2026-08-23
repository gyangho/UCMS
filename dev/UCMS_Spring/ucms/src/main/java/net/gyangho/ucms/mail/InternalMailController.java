package net.gyangho.ucms.mail;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v2/internal/mail")
public class InternalMailController {

	private final MailService mailService;
	private final InternalMailTokenVerifier tokenVerifier;

	public InternalMailController(MailService mailService, InternalMailTokenVerifier tokenVerifier) {
		this.mailService = mailService;
		this.tokenVerifier = tokenVerifier;
	}

	@PostMapping("/send")
	public ResponseEntity<Void> send(
		@RequestHeader(name = "X-UCMS-Internal-Token", required = false) String token,
		@Valid @RequestBody MailRequest request
	) {
		// 2026-08-23: Existing Node auth reaches the new Spring mail backend only through this authenticated adapter.
		tokenVerifier.verify(token);
		mailService.send(request.to(), request.subject(), request.content());
		return ResponseEntity.noContent().build();
	}
}
