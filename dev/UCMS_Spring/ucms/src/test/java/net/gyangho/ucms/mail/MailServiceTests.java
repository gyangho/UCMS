package net.gyangho.ucms.mail;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;

class MailServiceTests {

	@Test
	void sendsBrandedHtmlMailWithPlainTextFallback() throws Exception {
		JavaMailSender sender = org.mockito.Mockito.mock(JavaMailSender.class);
		MimeMessage mimeMessage = new MimeMessage(Session.getInstance(new Properties()));
		org.mockito.Mockito.when(sender.createMimeMessage()).thenReturn(mimeMessage);
		MailService service = new MailService(sender, "sender@gmail.com");

		service.send(
			"test@example.com",
			"UCMS 메일 테스트",
			"인증번호는 아래와 같습니다.\n\n123456\n\n5분 내로 입력해 주세요.\n\n본인이 요청하지 않았다면 이 메일을 무시해 주세요."
		);

		ArgumentCaptor<MimeMessage> message = ArgumentCaptor.forClass(MimeMessage.class);
		verify(sender).send(message.capture());
		assertEquals("sender@gmail.com", message.getValue().getFrom()[0].toString());
		assertEquals("test@example.com", message.getValue().getAllRecipients()[0].toString());
		assertEquals("UCMS 메일 테스트", message.getValue().getSubject());
		assertTrue(message.getValue().getContent() instanceof jakarta.mail.Multipart);
	}

	@Test
	void wrapsMailSenderFailureWithoutCredentialDetails() {
		JavaMailSender sender = org.mockito.Mockito.mock(JavaMailSender.class);
		org.mockito.Mockito.when(sender.createMimeMessage())
			.thenReturn(new MimeMessage(Session.getInstance(new Properties())));
		doThrow(new MailSendException("SMTP authentication failed")).when(sender).send(any(MimeMessage.class));
		MailService service = new MailService(sender, "sender@gmail.com");

		MailDeliveryException exception = assertThrows(
			MailDeliveryException.class,
			() -> service.send("test@example.com", "subject", "content")
		);
		assertEquals("SMTP mail delivery failed.", exception.getMessage());
	}
}
