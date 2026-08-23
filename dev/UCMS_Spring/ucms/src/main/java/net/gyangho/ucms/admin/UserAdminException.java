package net.gyangho.ucms.admin;

import org.springframework.http.HttpStatus;

public class UserAdminException extends RuntimeException {

	private final String code;
	private final HttpStatus status;

	public UserAdminException(String code, String message, HttpStatus status) {
		super(message);
		this.code = code;
		this.status = status;
	}

	public String getCode() {
		return code;
	}

	public HttpStatus getStatus() {
		return status;
	}
}
