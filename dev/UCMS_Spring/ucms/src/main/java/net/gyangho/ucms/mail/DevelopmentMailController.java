package net.gyangho.ucms.mail;

import jakarta.validation.Valid;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Profile("dev")
@RestController
@RequestMapping("/api/v2/dev/mail")
public class DevelopmentMailController {

	private final MailService mailService;
	private final InternalMailTokenVerifier tokenVerifier;

	public DevelopmentMailController(MailService mailService, InternalMailTokenVerifier tokenVerifier) {
		this.mailService = mailService;
		this.tokenVerifier = tokenVerifier;
	}

	@PostMapping("/test")
	public ResponseEntity<Void> sendTest(
		@RequestHeader(name = "X-UCMS-Internal-Token", required = false) String token,
		@Valid @RequestBody MailRequest request
	) {
		// 2026-08-23: This SMTP smoke endpoint is not registered unless the dev profile is active.
		tokenVerifier.verify(token);
		mailService.send(request.to(), request.subject(), request.content());
		return ResponseEntity.noContent().build();
	}
}
