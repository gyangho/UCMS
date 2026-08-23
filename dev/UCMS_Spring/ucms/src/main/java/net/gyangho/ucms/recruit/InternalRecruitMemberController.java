package net.gyangho.ucms.recruit;

import jakarta.validation.Valid;
import java.util.Map;
import net.gyangho.ucms.mail.InternalMailTokenVerifier;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v2/internal/admin/recruitments")
public class InternalRecruitMemberController {
	private final InternalMailTokenVerifier tokenVerifier;
	private final RecruitMemberRegistrationService registrationService;
	private final RecruitResponseSyncService responseSyncService;

	public InternalRecruitMemberController(
		InternalMailTokenVerifier tokenVerifier,
		RecruitMemberRegistrationService registrationService,
		RecruitResponseSyncService responseSyncService
	) {
		this.tokenVerifier = tokenVerifier;
		this.registrationService = registrationService;
		this.responseSyncService = responseSyncService;
	}

	@PostMapping("/{recruitmentId}/final-members")
	public ResponseEntity<Map<String, Object>> registerFinalMembers(
		@RequestHeader(value = "X-UCMS-Internal-Token", required = false) String token,
		@RequestHeader("X-UCMS-Actor-User-Id") long actorUserId,
		@PathVariable long recruitmentId,
		@Valid @RequestBody FinalMemberRegistrationRequest request
	) {
		// 2026-08-23: Node authenticates the session; Spring rechecks authority and owns this new write path.
		tokenVerifier.verify(token);
		return ResponseEntity.ok(registrationService.register(actorUserId, recruitmentId, request.generation()));
	}

	@PostMapping("/{recruitmentId}/responses/sync")
	public ResponseEntity<Map<String, Object>> syncResponses(
		@RequestHeader(value = "X-UCMS-Internal-Token", required = false) String token,
		@RequestHeader("X-UCMS-Actor-User-Id") long actorUserId,
		@PathVariable long recruitmentId
	) {
		// 2026-08-23: Node supplies the authenticated actor; Spring verifies authority and owns the Google Forms write path.
		tokenVerifier.verify(token);
		return ResponseEntity.ok(responseSyncService.syncByManager(actorUserId, recruitmentId));
	}
}
