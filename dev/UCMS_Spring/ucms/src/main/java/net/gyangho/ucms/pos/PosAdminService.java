package net.gyangho.ucms.pos;

import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PosAdminService {
	private static final int MAX_POSTER_BYTES = 10 * 1024 * 1024;
	private final JdbcTemplate jdbcTemplate;

	public PosAdminService(JdbcTemplate jdbcTemplate) { this.jdbcTemplate = jdbcTemplate; }

	@Transactional
	public Map<String, Object> update(long actorUserId, long instanceId, PosInstanceUpdateRequest request) {
		verifyManager(actorUserId);
		String status = jdbcTemplate.query("SELECT status FROM pos_instances WHERE id = ? FOR UPDATE",
			result -> result.next() ? result.getString(1) : null, instanceId);
		if (status == null) throw new PosAdminException("POS_NOT_FOUND", "POS 인스턴스를 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
		if ("active".equals(status)) throw new PosAdminException("POS_ACTIVE", "판매 중인 POS 인스턴스는 수정할 수 없습니다.", HttpStatus.CONFLICT);

		Poster poster = decodePoster(request.posterFileName(), request.posterDataUrl());
		try {
			if (poster == null) {
				jdbcTemplate.update("UPDATE pos_instances SET instance_name = ?, promotion_copy = ?, auto_close_at = ? WHERE id = ?",
					request.name().trim(), nullable(request.promotionCopy()), request.autoCloseAt(), instanceId);
			} else {
				jdbcTemplate.update("UPDATE pos_instances SET instance_name = ?, promotion_copy = ?, auto_close_at = ?, poster_file_name = ?, poster_mime_type = 'application/pdf', poster_pdf = ? WHERE id = ?",
					request.name().trim(), nullable(request.promotionCopy()), request.autoCloseAt(), poster.fileName(), poster.bytes(), instanceId);
			}
			replaceProducts(instanceId, request.products());
			replaceSalesmen(instanceId, request.salesmanStudentIds());
		} catch (DataIntegrityViolationException exception) {
			throw new PosAdminException("POS_UPDATE_CONFLICT", "판매 기록에서 사용 중인 품목이나 판매자는 제거할 수 없습니다.", HttpStatus.CONFLICT);
		}
		return Map.of("instanceId", instanceId, "updated", true);
	}

	private void verifyManager(long actorUserId) {
		Integer authority = jdbcTemplate.query("SELECT COALESCE(m.authority + 0, u.system_authority + 0, 1) FROM users u LEFT JOIN members m ON m.user_id = u.id WHERE u.id = ? AND u.status <> 'disabled'",
			result -> result.next() ? result.getInt(1) : null, actorUserId);
		if (authority == null || authority < 3) throw new PosAdminException("POS_MANAGER_REQUIRED", "임원진 이상의 권한이 필요합니다.", HttpStatus.FORBIDDEN);
	}

	private void replaceProducts(long instanceId, List<PosInstanceUpdateRequest.Product> products) {
		Set<Long> retained = new HashSet<>();
		List<Long> existing = jdbcTemplate.queryForList("SELECT id FROM pos_products WHERE instance_id = ?", Long.class, instanceId);
		for (PosInstanceUpdateRequest.Product product : products) {
			if (product.id() != null) {
				int changed = jdbcTemplate.update("UPDATE pos_products SET product_name = ?, product_price = ?, initial_stock = GREATEST(initial_stock - stock, 0) + ?, stock = ? WHERE id = ? AND instance_id = ?",
					product.name().trim(), product.price(), product.stock(), product.stock(), product.id(), instanceId);
				if (changed == 0) throw new PosAdminException("INVALID_POS_PRODUCT", "수정할 수 없는 품목이 포함되어 있습니다.", HttpStatus.BAD_REQUEST);
				retained.add(product.id());
			} else {
				jdbcTemplate.update("INSERT INTO pos_products (instance_id, product_name, product_price, stock, initial_stock) VALUES (?, ?, ?, ?, ?)",
					instanceId, product.name().trim(), product.price(), product.stock(), product.stock());
			}
		}
		for (Long id : existing) if (!retained.contains(id)) jdbcTemplate.update("DELETE FROM pos_products WHERE id = ?", id);
	}

	private void replaceSalesmen(long instanceId, List<String> studentIds) {
		jdbcTemplate.update("DELETE FROM pos_salesmans WHERE instance_id = ?", instanceId);
		for (String studentId : new java.util.LinkedHashSet<>(studentIds)) {
			int exists = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM members WHERE student_id = ?", Integer.class, studentId);
			if (exists == 0) throw new PosAdminException("INVALID_SALESMAN", "존재하지 않는 판매자가 포함되어 있습니다.", HttpStatus.BAD_REQUEST);
			jdbcTemplate.update("INSERT INTO pos_salesmans (member_id, instance_id) VALUES (?, ?)", studentId, instanceId);
		}
	}

	private Poster decodePoster(String fileName, String dataUrl) {
		if (dataUrl == null || dataUrl.isBlank()) return null;
		String prefix = "data:application/pdf;base64,";
		if (!dataUrl.startsWith(prefix)) throw new PosAdminException("INVALID_PDF", "PDF 포스터만 업로드할 수 있습니다.", HttpStatus.BAD_REQUEST);
		byte[] bytes;
		try { bytes = Base64.getDecoder().decode(dataUrl.substring(prefix.length())); }
		catch (IllegalArgumentException exception) { throw new PosAdminException("INVALID_PDF", "올바른 PDF 파일을 업로드해 주세요.", HttpStatus.BAD_REQUEST); }
		if (bytes.length > MAX_POSTER_BYTES || bytes.length < 5 || bytes[0] != '%' || bytes[1] != 'P' || bytes[2] != 'D' || bytes[3] != 'F' || bytes[4] != '-')
			throw new PosAdminException("INVALID_PDF", "10MB 이하의 올바른 PDF 파일을 업로드해 주세요.", HttpStatus.BAD_REQUEST);
		return new Poster(fileName == null || fileName.isBlank() ? "poster.pdf" : fileName.trim(), bytes);
	}

	private String nullable(String value) { return value == null || value.trim().isEmpty() ? null : value.trim(); }
	private record Poster(String fileName, byte[] bytes) { }
}
