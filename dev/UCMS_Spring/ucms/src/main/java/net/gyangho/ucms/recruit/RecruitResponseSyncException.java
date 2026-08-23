package net.gyangho.ucms.recruit;

import org.springframework.http.HttpStatus;

public class RecruitResponseSyncException extends RuntimeException {
	private final String code;
	private final HttpStatus status;

	public RecruitResponseSyncException(String code, String message, HttpStatus status) { super(message); this.code = code; this.status = status; }
	public RecruitResponseSyncException(String code, String message, HttpStatus status, Throwable cause) { super(message, cause); this.code = code; this.status = status; }
	public String getCode() { return code; }
	public HttpStatus getStatus() { return status; }
}
