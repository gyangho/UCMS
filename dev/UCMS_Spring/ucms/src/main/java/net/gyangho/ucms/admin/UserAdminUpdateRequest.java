package net.gyangho.ucms.admin;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UserAdminUpdateRequest(
	@NotBlank @Size(max = 50) String name,
	@Email @Size(max = 254) String accountEmail,
	@Pattern(regexp = "^$|[0-9+() -]{10,20}$") String phoneNumber,
	@Pattern(regexp = "pending_email|pending_relink|active|disabled") String status
) {
}
