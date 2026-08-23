package net.gyangho.ucms.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TemporaryPasswordRequest(
	@Email @NotBlank @Size(max = 254) String email
) {
}
