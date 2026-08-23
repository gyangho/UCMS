package net.gyangho.ucms.mail;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class MailExceptionHandler {

	@ExceptionHandler(MailDeliveryException.class)
	ResponseEntity<Map<String, String>> handleMailDeliveryException() {
		// 2026-08-23: Return a stable public error without exposing the SMTP server response or credentials.
		return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
			.body(Map.of("code", "MAIL_DELIVERY_FAILED", "message", "메일을 발송하지 못했습니다."));
	}

	@ExceptionHandler(ResponseStatusException.class)
	ResponseEntity<Map<String, String>> handleMailAccessException(ResponseStatusException exception) {
		// 2026-08-23: Keep internal-token configuration and validation details out of every HTTP response.
		return ResponseEntity.status(exception.getStatusCode())
			.body(Map.of("code", "MAIL_REQUEST_REJECTED", "message", "요청을 처리할 수 없습니다."));
	}
}
