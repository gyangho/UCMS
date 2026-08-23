package net.gyangho.ucms.mail;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.util.HtmlUtils;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class MailService {

	private static final Logger log = LoggerFactory.getLogger(MailService.class);
	private static final Pattern VERIFICATION_CODE = Pattern.compile("(?<!\\d)(\\d{6})(?!\\d)");
	private static final String LOGO_CONTENT_ID = "ucms-logo";

	private final JavaMailSender mailSender;
	private final String senderAddress;

	public MailService(JavaMailSender mailSender, @Value("${spring.mail.username:}") String senderAddress) {
		this.mailSender = mailSender;
		this.senderAddress = senderAddress;
	}

	public void send(String to, String subject, String content) {
		if (!StringUtils.hasText(senderAddress)) {
			throw new MailDeliveryException("Gmail SMTP sender is not configured.", null);
		}

		try {
			MimeMessage message = mailSender.createMimeMessage();
			MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
			helper.setFrom(senderAddress);
			helper.setTo(to);
			helper.setSubject(subject);
			// 2026-08-23: Send a branded HTML message with a plain-text fallback for restrictive mail clients.
			helper.setText(content, buildHtmlContent(subject, content));
			helper.addInline(LOGO_CONTENT_ID, new ClassPathResource("mail/ucms-logo.png"), "image/png");
			mailSender.send(message);
		} catch (MailException | MessagingException exception) {
			// 2026-08-23: Record the failure category without logging recipients, messages, or SMTP credentials.
			log.error("SMTP mail delivery failed: {}", exception.getClass().getSimpleName());
			throw new MailDeliveryException("SMTP mail delivery failed.", exception);
		}
	}

	private String buildHtmlContent(String subject, String content) {
		String safeSubject = HtmlUtils.htmlEscape(subject);
		String safeContent = HtmlUtils.htmlEscape(content).replace("\r\n", "\n");
		Matcher matcher = VERIFICATION_CODE.matcher(safeContent);
		StringBuffer highlighted = new StringBuffer();
		while (matcher.find()) {
			matcher.appendReplacement(
				highlighted,
				"<span style=\"display:inline-block;margin:18px 0;padding:14px 24px;border:1px solid #e8cf72;border-radius:12px;background:#fff4bd;color:#5a4314;font-size:30px;font-weight:800;letter-spacing:8px;\">$1</span>"
			);
		}
		matcher.appendTail(highlighted);
		String formattedContent = highlighted.toString().replace("\n", "<br>");

		return """
			<!doctype html>
			<html lang="ko">
			<body style="margin:0;padding:24px;background:#fffdf5;font-family:'Nanum Gothic','Malgun Gothic',Arial,sans-serif;color:#3e3524;">
			  <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;border:1px solid #eadba4;border-radius:18px;background:#ffffff;overflow:hidden;">
			    <tr><td style="padding:26px 28px 18px;text-align:center;background:#fff8d8;">
			      <!-- 2026-08-23: Emphasize the UCMS logo and remove the redundant English product caption. -->
			      <img src="cid:%s" alt="UCMS" width="132" height="132" style="display:block;margin:0 auto;width:132px;height:132px;object-fit:contain;">
			    </td></tr>
			    <tr><td style="padding:30px 32px 34px;">
			      <h1 style="margin:0 0 22px;font-size:22px;line-height:1.45;color:#4d3a12;">%s</h1>
			      <div style="font-size:16px;line-height:1.85;color:#514936;">%s</div>
			      <div style="margin-top:26px;padding-top:18px;border-top:1px solid #eee5c8;font-size:12px;line-height:1.65;color:#8a8069;">
			        인증정보를 다른 사람에게 알려주지 마세요.
			      </div>
			    </td></tr>
			  </table>
			</body>
			</html>
			""".formatted(LOGO_CONTENT_ID, safeSubject, formattedContent);
	}
}
