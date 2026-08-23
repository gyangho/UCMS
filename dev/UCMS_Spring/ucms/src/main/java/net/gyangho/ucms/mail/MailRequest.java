package net.gyangho.ucms.mail;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record MailRequest(
	@Email @NotBlank @Size(max = 254) String to,
	@NotBlank @Size(max = 200) String subject,
	@NotBlank @Size(max = 10000) String content
) {
}
