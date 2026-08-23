package net.gyangho.ucms.pos;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.List;

public record PosInstanceUpdateRequest(
	@NotBlank String name,
	@NotEmpty List<@Valid Product> products,
	@NotEmpty List<@NotBlank String> salesmanStudentIds,
	String promotionCopy,
	Instant autoCloseAt,
	String posterFileName,
	String posterDataUrl
) {
	public record Product(Long id, @NotBlank String name, @NotNull @Min(0) Long price, @NotNull @Min(0) Integer stock) {
	}
}
