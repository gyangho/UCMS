package net.gyangho.ucms.recruit;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
class RecruitMemberRegistrationServiceTest {
	@Autowired JdbcTemplate jdbcTemplate;
	@Autowired RecruitMemberRegistrationService service;

	@Test
	void registersFinalCandidatesAndLinksMatchingUserAtomically() {
		// 2026-08-23: Exercise the complete interview-completed to member/closed transition on the migrated schema.
		jdbcTemplate.update("INSERT INTO users (name, account_email, status, account_type) VALUES ('테스트 관리자', 'recruit-admin-test@ucms.invalid', 'active', 'human')");
		long actorId = jdbcTemplate.queryForObject("SELECT id FROM users WHERE account_email = 'recruit-admin-test@ucms.invalid'", Long.class);
		jdbcTemplate.update("INSERT INTO members (student_id, name, major, phone, gender, generation, authority, user_id) VALUES ('9900000001', '테스트 관리자', '테스트전공', '01099000001', '남자', 1, '임원진', ?)", actorId);
		jdbcTemplate.update("INSERT INTO users (name, account_email, phone_number, status, account_type) VALUES ('최종 합격자', 'recruit-candidate-test@ucms.invalid', '01012345678', 'active', 'human')");
		long candidateUserId = jdbcTemplate.queryForObject("SELECT id FROM users WHERE account_email = 'recruit-candidate-test@ucms.invalid'", Long.class);
		jdbcTemplate.update("INSERT INTO formlist (id, title, form_type) VALUES ('recruit-member-test-form', '테스트 모집', '신규모집')");
		jdbcTemplate.update("INSERT INTO recruitment_instances (form_id, title, status, closed_at) VALUES ('recruit-member-test-form', '9기 테스트 모집', 'interview_completed', NOW())");
		long recruitmentId = jdbcTemplate.queryForObject("SELECT id FROM recruitment_instances WHERE form_id = 'recruit-member-test-form'", Long.class);
		jdbcTemplate.update("INSERT INTO recruiting_members (form_id, response_id, student_id, name, major, phone, gender, rating) VALUES ('recruit-member-test-form', 'response-1', '20990001', '최종 합격자', '소프트웨어학부', '010-1234-5678', '여자', '최종합격')");

		Map<String, Object> result = service.register(actorId, recruitmentId, 9);

		assertThat(result).containsEntry("status", "closed").containsEntry("createdCount", 1).containsEntry("linkedUserCount", 1);
		Map<String, Object> member = jdbcTemplate.queryForMap("SELECT generation, authority, user_id FROM members WHERE student_id = '20990001'");
		assertThat(member).containsEntry("generation", 9).containsEntry("authority", "부원");
		assertThat(((Number) member.get("user_id")).longValue()).isEqualTo(candidateUserId);
		assertThat(jdbcTemplate.queryForObject("SELECT status FROM recruitment_instances WHERE id = ?", String.class, recruitmentId)).isEqualTo("closed");
		assertThat(jdbcTemplate.queryForObject("SELECT student_id FROM users WHERE id = ?", String.class, candidateUserId)).isEqualTo("20990001");
	}
}
