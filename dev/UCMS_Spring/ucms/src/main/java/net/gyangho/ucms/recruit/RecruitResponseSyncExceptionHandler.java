package net.gyangho.ucms.recruit;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = InternalRecruitMemberController.class)
public class RecruitResponseSyncExceptionHandler {
	@ExceptionHandler(RecruitResponseSyncException.class)
	ResponseEntity<Map<String, String>> handle(RecruitResponseSyncException exception) {
		return ResponseEntity.status(exception.getStatus()).body(Map.of("code", exception.getCode(), "message", exception.getMessage()));
	}
}
