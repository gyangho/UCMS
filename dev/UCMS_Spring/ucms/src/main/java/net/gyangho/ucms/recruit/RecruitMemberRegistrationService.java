package net.gyangho.ucms.recruit;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RecruitMemberRegistrationService {
	private final JdbcTemplate jdbcTemplate;

	public RecruitMemberRegistrationService(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	@Transactional
	public Map<String, Object> register(long actorUserId, long recruitmentId, int generation) {
		verifyManager(actorUserId);
		Recruitment recruitment = lockRecruitment(recruitmentId);
		if (recruitment == null) {
			throw problem("RECRUITMENT_NOT_FOUND", "모집 인스턴스를 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
		}
		if (!"interview_completed".equals(recruitment.status())) {
			throw problem("INVALID_RECRUITMENT_STATUS", "면접 종료 상태에서만 최종합격자를 회원으로 등록할 수 있습니다.", HttpStatus.CONFLICT);
		}

		List<Candidate> candidates = lockFinalCandidates(recruitment.formId());
		validateCandidates(candidates);
		int created = 0;
		int updated = 0;
		int linked = 0;
		try {
			for (Candidate candidate : candidates) {
				ExistingMember member = findMember(candidate);
				UserAccount account = findMatchingUser(candidate);
				validateLinks(candidate, member, account);
				Long userId = member != null && member.userId() != null
					? member.userId()
					: account == null ? null : account.id();

				if (member == null) {
					jdbcTemplate.update(
						"INSERT INTO members (student_id, name, major, phone, gender, generation, authority, user_id) VALUES (?, ?, ?, ?, ?, ?, '부원', ?)",
						candidate.studentId(), candidate.name(), candidate.major(), candidate.phone(), candidate.gender(), generation, userId
					);
					created++;
				} else {
					jdbcTemplate.update(
						"UPDATE members SET name = ?, major = ?, phone = ?, gender = ?, generation = ?, authority = CASE WHEN authority IN ('미인증', '일반') THEN '부원' ELSE authority END, user_id = ? WHERE student_id = ?",
						candidate.name(), candidate.major(), candidate.phone(), candidate.gender(), generation, userId, candidate.studentId()
					);
					updated++;
				}
				if (account != null) {
					jdbcTemplate.update("UPDATE users SET student_id = ?, major = ? WHERE id = ?", candidate.studentId(), candidate.major(), account.id());
					if (member == null || member.userId() == null) linked++;
				}
			}
			jdbcTemplate.update(
				"UPDATE recruitment_instances SET status = 'closed', members_registered_at = CURRENT_TIMESTAMP, snapshot_final_pass_count = ? WHERE id = ?",
				candidates.size(), recruitmentId
			);
		} catch (DataIntegrityViolationException exception) {
			throw problem("MEMBER_DATA_CONFLICT", "학번·전화번호 또는 사용자 연결이 기존 회원 정보와 충돌합니다. 회원 정보를 확인해 주세요.", HttpStatus.CONFLICT);
		}
		return Map.of(
			"recruitmentId", recruitmentId,
			"status", "closed",
			"finalPassCount", candidates.size(),
			"createdCount", created,
			"updatedCount", updated,
			"linkedUserCount", linked
		);
	}

	private void verifyManager(long actorUserId) {
		Integer authority = jdbcTemplate.query(
			"SELECT COALESCE(m.authority + 0, u.system_authority + 0, 1) FROM users u LEFT JOIN members m ON m.user_id = u.id WHERE u.id = ? AND u.status <> 'disabled'",
			result -> result.next() ? result.getInt(1) : null,
			actorUserId
		);
		if (authority == null || authority < 3) {
			throw problem("RECRUIT_MANAGER_REQUIRED", "임원진 이상의 권한이 필요합니다.", HttpStatus.FORBIDDEN);
		}
	}

	private Recruitment lockRecruitment(long recruitmentId) {
		return jdbcTemplate.query(
			"SELECT form_id, status FROM recruitment_instances WHERE id = ? FOR UPDATE",
			result -> result.next() ? new Recruitment(result.getString("form_id"), result.getString("status")) : null,
			recruitmentId
		);
	}

	private List<Candidate> lockFinalCandidates(String formId) {
		return jdbcTemplate.query(
			"SELECT id, student_id, name, major, phone, gender FROM recruiting_members WHERE form_id = ? AND rating = '최종합격' ORDER BY id FOR UPDATE",
			(result, rowNum) -> new Candidate(
				result.getLong("id"), trim(result.getString("student_id")), trim(result.getString("name")),
				trim(result.getString("major")), normalizePhone(result.getString("phone")), trim(result.getString("gender"))
			),
			formId
		);
	}

	private void validateCandidates(List<Candidate> candidates) {
		Set<String> studentIds = new HashSet<>();
		Set<String> phones = new HashSet<>();
		for (Candidate candidate : candidates) {
			if (candidate.studentId().isEmpty() || candidate.name().isEmpty() || candidate.major().isEmpty()
				|| candidate.phone().isEmpty() || candidate.gender().isEmpty()) {
				throw problem("INCOMPLETE_FINAL_CANDIDATE", candidate.id() + "번 최종합격자의 학번·이름·전공·전화번호·성별을 모두 확인해 주세요.", HttpStatus.CONFLICT);
			}
			if (candidate.studentId().length() > 20 || candidate.name().length() > 50 || candidate.major().length() > 20) {
				throw problem("FINAL_CANDIDATE_VALUE_TOO_LONG", candidate.name() + " 지원자의 학번·이름 또는 전공 값이 회원 필드 길이를 초과합니다.", HttpStatus.CONFLICT);
			}
			if (candidate.phone().length() < 10 || candidate.phone().length() > 11 || !Set.of("남자", "여자").contains(candidate.gender())) {
				throw problem("INVALID_FINAL_CANDIDATE", candidate.name() + " 지원자의 전화번호 또는 성별 값이 올바르지 않습니다.", HttpStatus.CONFLICT);
			}
			if (!studentIds.add(candidate.studentId()) || !phones.add(candidate.phone())) {
				throw problem("DUPLICATE_FINAL_CANDIDATE", "최종합격자 목록에 중복된 학번 또는 전화번호가 있습니다.", HttpStatus.CONFLICT);
			}
		}
	}

	private ExistingMember findMember(Candidate candidate) {
		List<ExistingMember> matches = jdbcTemplate.query(
			"SELECT student_id, phone, user_id FROM members WHERE student_id = ? OR REPLACE(REPLACE(REPLACE(phone, '-', ''), ' ', ''), '+82', '0') = ? FOR UPDATE",
			(result, rowNum) -> {
				Number userId = (Number) result.getObject("user_id");
				return new ExistingMember(result.getString("student_id"), normalizePhone(result.getString("phone")), userId == null ? null : userId.longValue());
			},
			candidate.studentId(), candidate.phone()
		);
		if (matches.size() > 1 || (!matches.isEmpty() && !Objects.equals(matches.get(0).studentId(), candidate.studentId()))) {
			throw problem("MEMBER_IDENTITY_CONFLICT", candidate.name() + " 지원자의 학번 또는 전화번호가 다른 기존 회원과 충돌합니다.", HttpStatus.CONFLICT);
		}
		return matches.isEmpty() ? null : matches.get(0);
	}

	private UserAccount findMatchingUser(Candidate candidate) {
		List<UserAccount> accounts = jdbcTemplate.query(
			"SELECT u.id, u.name, u.phone_number, m.student_id AS linked_student_id FROM users u LEFT JOIN members m ON m.user_id = u.id WHERE u.account_type = 'human' AND u.status <> 'disabled' AND REPLACE(REPLACE(REPLACE(u.phone_number, '-', ''), ' ', ''), '+82', '0') = ? FOR UPDATE",
			(result, rowNum) -> new UserAccount(result.getLong("id"), result.getString("name"), normalizePhone(result.getString("phone_number")), result.getString("linked_student_id")),
			candidate.phone()
		).stream().filter(account -> normalizeName(account.name()).equals(normalizeName(candidate.name()))).toList();
		if (accounts.size() > 1) {
			throw problem("USER_IDENTITY_CONFLICT", candidate.name() + " 지원자와 일치하는 사용자 계정이 여러 개입니다.", HttpStatus.CONFLICT);
		}
		return accounts.isEmpty() ? null : accounts.get(0);
	}

	private void validateLinks(Candidate candidate, ExistingMember member, UserAccount account) {
		if (account != null && account.linkedStudentId() != null && !account.linkedStudentId().equals(candidate.studentId())) {
			throw problem("USER_ALREADY_LINKED", candidate.name() + " 사용자가 다른 회원과 연결되어 있습니다.", HttpStatus.CONFLICT);
		}
		if (member != null && member.userId() != null && account != null && !member.userId().equals(account.id())) {
			throw problem("MEMBER_ALREADY_LINKED", candidate.name() + " 회원이 다른 사용자 계정과 연결되어 있습니다.", HttpStatus.CONFLICT);
		}
	}

	private RecruitMemberRegistrationException problem(String code, String message, HttpStatus status) {
		return new RecruitMemberRegistrationException(code, message, status);
	}

	private String trim(String value) { return value == null ? "" : value.trim(); }
	private String normalizeName(String value) { return trim(value).replaceAll("\\s+", "").toLowerCase(java.util.Locale.ROOT); }
	private String normalizePhone(String value) {
		String digits = value == null ? "" : value.replaceAll("\\D", "");
		return digits.startsWith("82") ? "0" + digits.substring(2) : digits;
	}

	private record Recruitment(String formId, String status) { }
	private record Candidate(long id, String studentId, String name, String major, String phone, String gender) { }
	private record ExistingMember(String studentId, String phone, Long userId) { }
	private record UserAccount(long id, String name, String phone, String linkedStudentId) { }
}
