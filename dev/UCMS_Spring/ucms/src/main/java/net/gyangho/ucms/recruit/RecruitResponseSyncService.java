package net.gyangho.ucms.recruit;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import org.springframework.http.HttpStatus;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RecruitResponseSyncService {
	private final JdbcTemplate jdbcTemplate;
	private final GoogleFormsGateway formsGateway;
	private final Map<Long, ReentrantLock> recruitmentLocks = new ConcurrentHashMap<>();

	public RecruitResponseSyncService(JdbcTemplate jdbcTemplate, GoogleFormsGateway formsGateway) {
		this.jdbcTemplate = jdbcTemplate;
		this.formsGateway = formsGateway;
	}

	public Map<String, Object> syncByManager(long actorUserId, long recruitmentId) {
		verifyManager(actorUserId);
		return sync(recruitmentId);
	}

	// 2026-08-23: Periodically synchronize only open recruiting campaigns; the final close action also calls this path.
	@Scheduled(fixedDelayString = "${ucms.recruit.response-sync.interval-ms:600000}")
	@ConditionalOnProperty(prefix = "ucms.recruit.response-sync", name = "scheduler-enabled", havingValue = "true", matchIfMissing = true)
	public void synchronizeActiveRecruitments() {
		List<Long> ids = jdbcTemplate.queryForList(
			"SELECT id FROM recruitment_instances WHERE status = 'recruiting' AND form_id IS NOT NULL", Long.class
		);
		for (Long id : ids) {
			try { sync(id); } catch (RecruitResponseSyncException ignored) { /* status is saved below; scheduled work must continue. */ }
		}
	}

	public Map<String, Object> sync(long recruitmentId) {
		ReentrantLock lock = recruitmentLocks.computeIfAbsent(recruitmentId, unused -> new ReentrantLock());
		if (!lock.tryLock()) throw problem("RESPONSE_SYNC_IN_PROGRESS", "이미 이 모집의 응답을 동기화하고 있습니다.", HttpStatus.CONFLICT);
		try {
			Recruitment recruitment = findRecruitment(recruitmentId);
			if (recruitment == null) throw problem("RECRUITMENT_NOT_FOUND", "모집 인스턴스를 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
			if (recruitment.formId() == null || recruitment.formId().isBlank()) throw problem("GOOGLE_FORM_REQUIRED", "연결된 Google Form이 없습니다.", HttpStatus.CONFLICT);
			try {
				GoogleFormsGateway.FormSnapshot snapshot = formsGateway.load(recruitment.formId());
				Map<String, Object> result = persist(recruitmentId, recruitment.formId(), snapshot);
				return result;
			} catch (RecruitResponseSyncException exception) {
				recordError(recruitmentId, exception.getMessage());
				throw exception;
			} catch (RuntimeException exception) {
				recordError(recruitmentId, "응답 동기화 처리 중 오류가 발생했습니다.");
				throw problem("RESPONSE_SYNC_FAILED", "지원자 응답을 저장하지 못했습니다.", HttpStatus.INTERNAL_SERVER_ERROR);
			}
		} finally {
			lock.unlock();
		}
	}

	@Transactional
	protected Map<String, Object> persist(long recruitmentId, String formId, GoogleFormsGateway.FormSnapshot snapshot) {
		Map<String, String> semanticByQuestionId = new LinkedHashMap<>();
		for (GoogleFormsGateway.Question question : snapshot.questions()) {
			String semanticKey = semanticKey(question.title());
			jdbcTemplate.update(
				"INSERT INTO form_questions (form_id, question_id, question, semantic_key) VALUES (?, ?, ?, ?) "
					+ "ON DUPLICATE KEY UPDATE question = VALUES(question), semantic_key = COALESCE(form_questions.semantic_key, VALUES(semantic_key)), synced_at = CURRENT_TIMESTAMP",
				formId, question.id(), question.title(), semanticKey
			);
			semanticByQuestionId.put(question.id(), semanticKey);
		}
		int created = 0;
		int updated = 0;
		for (GoogleFormsGateway.Response response : snapshot.responses()) {
			if (response.id() == null || response.id().isBlank()) continue;
			Integer existing = jdbcTemplate.query(
				"SELECT id FROM recruiting_members WHERE form_id = ? AND response_id = ?", result -> result.next() ? result.getInt(1) : null, formId, response.id()
			);
			for (Map.Entry<String, String> answer : response.answers().entrySet()) {
				jdbcTemplate.update(
					"INSERT INTO form_responses (response_id, form_id, question_id, answer) VALUES (?, ?, ?, ?) "
						+ "ON DUPLICATE KEY UPDATE answer = VALUES(answer), synced_at = CURRENT_TIMESTAMP",
					response.id(), formId, answer.getKey(), answer.getValue()
				);
			}
			Map<String, String> identity = identity(response.answers(), semanticByQuestionId);
			jdbcTemplate.update(
				"INSERT INTO recruiting_members (form_id, response_id, student_id, name, major, phone, gender) VALUES (?, ?, ?, ?, ?, ?, ?) "
					+ "ON DUPLICATE KEY UPDATE student_id = VALUES(student_id), name = VALUES(name), major = VALUES(major), phone = VALUES(phone), gender = VALUES(gender), synced_at = CURRENT_TIMESTAMP",
				formId, response.id(), identity.get("student_id"), identity.get("name"), identity.get("major"), identity.get("phone"), identity.get("gender")
			);
			if (existing == null) created++; else updated++;
		}
		jdbcTemplate.update(
			"UPDATE recruitment_instances SET last_response_sync_at = CURRENT_TIMESTAMP, last_response_sync_count = ?, response_sync_error = NULL WHERE id = ?",
			snapshot.responses().size(), recruitmentId
		);
		return Map.of("recruitmentId", recruitmentId, "syncedCount", snapshot.responses().size(), "createdCount", created, "updatedCount", updated, "syncedAt", LocalDateTime.now().toString());
	}

	private Recruitment findRecruitment(long recruitmentId) {
		return jdbcTemplate.query("SELECT form_id FROM recruitment_instances WHERE id = ?", result -> result.next() ? new Recruitment(result.getString(1)) : null, recruitmentId);
	}

	private void verifyManager(long actorUserId) {
		Integer authority = jdbcTemplate.query(
			"SELECT COALESCE(m.authority + 0, u.system_authority + 0, 1) FROM users u LEFT JOIN members m ON m.user_id = u.id WHERE u.id = ? AND u.status <> 'disabled'",
			result -> result.next() ? result.getInt(1) : null, actorUserId
		);
		if (authority == null || authority < 3) throw problem("RECRUIT_MANAGER_REQUIRED", "임원진 이상의 권한이 필요합니다.", HttpStatus.FORBIDDEN);
	}

	private void recordError(long recruitmentId, String message) {
		jdbcTemplate.update("UPDATE recruitment_instances SET response_sync_error = ? WHERE id = ?", message.length() > 500 ? message.substring(0, 500) : message, recruitmentId);
	}

	private Map<String, String> identity(Map<String, String> answers, Map<String, String> semanticByQuestionId) {
		Map<String, String> result = new LinkedHashMap<>();
		for (Map.Entry<String, String> answer : answers.entrySet()) {
			String semantic = semanticByQuestionId.get(answer.getKey());
			if (semantic != null) result.put(semantic, answer.getValue());
		}
		return result;
	}

	private String semanticKey(String title) {
		String normalized = title == null ? "" : title.replaceAll("[\\s\\p{Punct}]", "").toLowerCase(Locale.ROOT);
		// 2026-08-23: Only the controlled form labels below map identity fields; unknown questions remain raw responses.
		if (normalized.equals("학번") || normalized.equals("학생번호")) return "student_id";
		if (normalized.equals("이름") || normalized.equals("성명")) return "name";
		if (normalized.equals("전공") || normalized.equals("학과") || normalized.equals("소속학과")) return "major";
		if (normalized.equals("전화번호") || normalized.equals("휴대폰번호") || normalized.equals("연락처")) return "phone";
		if (normalized.equals("성별")) return "gender";
		return null;
	}

	private RecruitResponseSyncException problem(String code, String message, HttpStatus status) { return new RecruitResponseSyncException(code, message, status); }
	private record Recruitment(String formId) { }
}
