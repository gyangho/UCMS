package net.gyangho.ucms.admin;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class UserAdminExceptionHandler {

	@ExceptionHandler(UserAdminException.class)
	ResponseEntity<Map<String, String>> handle(UserAdminException exception) {
		// 2026-08-23: Return actionable conflict codes without exposing SQL or referenced row details.
		return ResponseEntity.status(exception.getStatus())
			.body(Map.of("code", exception.getCode(), "message", exception.getMessage()));
	}
}
