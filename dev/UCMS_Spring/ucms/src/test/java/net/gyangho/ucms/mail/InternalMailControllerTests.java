package net.gyangho.ucms.mail;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class InternalMailControllerTests {

	@Test
	void acceptsAnAuthenticatedInternalDeliveryRequest() {
		MailService service = org.mockito.Mockito.mock(MailService.class);
		InternalMailController controller = new InternalMailController(
			service,
			new InternalMailTokenVerifier("internal-test-token")
		);
		MailRequest request = new MailRequest("test@example.com", "UCMS 테스트", "테스트 본문");

		assertEquals(HttpStatus.NO_CONTENT, controller.send("internal-test-token", request).getStatusCode());
		verify(service).send(request.to(), request.subject(), request.content());
	}

	@Test
	void rejectsAnInvalidInternalToken() {
		MailService service = org.mockito.Mockito.mock(MailService.class);
		InternalMailController controller = new InternalMailController(
			service,
			new InternalMailTokenVerifier("internal-test-token")
		);

		ResponseStatusException exception = assertThrows(
			ResponseStatusException.class,
			() -> controller.send("wrong-token", new MailRequest("test@example.com", "subject", "content"))
		);
		assertEquals(HttpStatus.UNAUTHORIZED, exception.getStatusCode());
	}
}
