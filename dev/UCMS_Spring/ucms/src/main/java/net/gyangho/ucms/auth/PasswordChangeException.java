package net.gyangho.ucms.auth;

import org.springframework.http.HttpStatus;

public class PasswordChangeException extends RuntimeException {
	private final String code;
	private final HttpStatus status;

	PasswordChangeException(String code, String message, HttpStatus status) {
		super(message);
		this.code = code;
		this.status = status;
	}

	String getCode() { return code; }
	HttpStatus getStatus() { return status; }
}
