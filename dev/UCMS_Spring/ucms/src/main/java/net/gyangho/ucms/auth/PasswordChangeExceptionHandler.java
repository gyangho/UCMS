package net.gyangho.ucms.auth;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = InternalPasswordChangeController.class)
public class PasswordChangeExceptionHandler {
	@ExceptionHandler(PasswordChangeException.class)
	ResponseEntity<Map<String, String>> handle(PasswordChangeException exception) {
		return ResponseEntity.status(exception.getStatus())
			.body(Map.of("code", exception.getCode(), "message", exception.getMessage()));
	}
}
