package net.gyangho.ucms.pos;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = InternalPosAdminController.class)
public class PosAdminExceptionHandler {
	@ExceptionHandler(PosAdminException.class)
	ResponseEntity<Map<String, String>> handle(PosAdminException exception) {
		return ResponseEntity.status(exception.status()).body(Map.of("code", exception.code(), "message", exception.getMessage()));
	}
}
