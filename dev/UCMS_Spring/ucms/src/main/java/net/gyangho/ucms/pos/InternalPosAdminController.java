package net.gyangho.ucms.pos;

import jakarta.validation.Valid;
import java.util.Map;
import net.gyangho.ucms.mail.InternalMailTokenVerifier;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v2/internal/admin/pos/instances")
public class InternalPosAdminController {
	private final InternalMailTokenVerifier tokenVerifier;
	private final PosAdminService service;

	public InternalPosAdminController(InternalMailTokenVerifier tokenVerifier, PosAdminService service) {
		this.tokenVerifier = tokenVerifier;
		this.service = service;
	}

	@PutMapping("/{instanceId}")
	public ResponseEntity<Map<String, Object>> update(
		@RequestHeader(value = "X-UCMS-Internal-Token", required = false) String token,
		@RequestHeader("X-UCMS-Actor-User-Id") long actorUserId,
		@PathVariable long instanceId,
		@Valid @RequestBody PosInstanceUpdateRequest request
	) {
		// 2026-08-23: Node owns the browser session while Spring enforces POS mutation rules transactionally.
		tokenVerifier.verify(token);
		return ResponseEntity.ok(service.update(actorUserId, instanceId, request));
	}
}
