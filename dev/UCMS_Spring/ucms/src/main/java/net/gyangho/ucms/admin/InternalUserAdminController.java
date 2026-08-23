package net.gyangho.ucms.admin;

import jakarta.validation.Valid;
import java.util.Map;
import net.gyangho.ucms.mail.InternalMailTokenVerifier;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v2/internal/admin/users")
public class InternalUserAdminController {

	private final InternalMailTokenVerifier tokenVerifier;
	private final UserAdminService userAdminService;

	public InternalUserAdminController(InternalMailTokenVerifier tokenVerifier, UserAdminService userAdminService) {
		this.tokenVerifier = tokenVerifier;
		this.userAdminService = userAdminService;
	}

	@PatchMapping("/{userId}")
	public ResponseEntity<Map<String, Object>> update(
		@RequestHeader(value = "X-UCMS-Internal-Token", required = false) String token,
		@RequestHeader("X-UCMS-Actor-User-Id") long actorUserId,
		@PathVariable long userId,
		@Valid @RequestBody UserAdminUpdateRequest request
	) {
		// 2026-08-23: Node authenticates the browser session; Spring rechecks the administrator against the database.
		tokenVerifier.verify(token);
		return ResponseEntity.ok(userAdminService.update(actorUserId, userId, request));
	}

	@DeleteMapping("/{userId}")
	public ResponseEntity<Map<String, Object>> delete(
		@RequestHeader(value = "X-UCMS-Internal-Token", required = false) String token,
		@RequestHeader("X-UCMS-Actor-User-Id") long actorUserId,
		@PathVariable long userId
	) {
		tokenVerifier.verify(token);
		return ResponseEntity.ok(userAdminService.delete(actorUserId, userId));
	}
}
