package net.gyangho.ucms.recruit;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class RecruitMemberRegistrationExceptionHandler {
	@ExceptionHandler(RecruitMemberRegistrationException.class)
	ResponseEntity<Map<String, String>> handle(RecruitMemberRegistrationException exception) {
		// 2026-08-23: Return a safe, actionable reason while the transaction rolls back every member change.
		return ResponseEntity.status(exception.getStatus())
			.body(Map.of("code", exception.getCode(), "message", exception.getMessage()));
	}
}
