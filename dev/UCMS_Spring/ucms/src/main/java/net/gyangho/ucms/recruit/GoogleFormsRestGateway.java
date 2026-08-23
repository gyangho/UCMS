package net.gyangho.ucms.recruit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.auth.oauth2.GoogleCredentials;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class GoogleFormsRestGateway implements GoogleFormsGateway {
	private static final List<String> SCOPES = List.of(
		"https://www.googleapis.com/auth/forms.body.readonly",
		"https://www.googleapis.com/auth/forms.responses.readonly"
	);
	private final ObjectMapper objectMapper = new ObjectMapper();
	private final HttpClient httpClient = HttpClient.newHttpClient();
	private final Path serviceAccountPath;

	public GoogleFormsRestGateway(@Value("${ucms.recruit.response-sync.service-account-path}") String serviceAccountPath) {
		this.serviceAccountPath = Path.of(serviceAccountPath);
	}

	@Override
	public FormSnapshot load(String formId) {
		try {
			String encodedFormId = URLEncoder.encode(formId, StandardCharsets.UTF_8);
			JsonNode form = get("https://forms.googleapis.com/v1/forms/" + encodedFormId);
			List<Question> questions = new ArrayList<>();
			collectQuestions(form.path("items"), questions);
			List<Response> responses = new ArrayList<>();
			String nextPageToken = null;
			do {
				String url = "https://forms.googleapis.com/v1/forms/" + encodedFormId + "/responses?pageSize=500"
					+ (nextPageToken == null ? "" : "&pageToken=" + URLEncoder.encode(nextPageToken, StandardCharsets.UTF_8));
				JsonNode page = get(url);
				for (JsonNode response : page.path("responses")) responses.add(toResponse(response));
				nextPageToken = page.path("nextPageToken").asText(null);
			} while (nextPageToken != null && !nextPageToken.isBlank());
			return new FormSnapshot(questions, responses);
		} catch (InterruptedException exception) {
			Thread.currentThread().interrupt();
			throw new RecruitResponseSyncException("GOOGLE_FORMS_UNAVAILABLE", "Google Form 응답을 불러오지 못했습니다.", HttpStatus.BAD_GATEWAY, exception);
		} catch (IOException exception) {
			throw new RecruitResponseSyncException("GOOGLE_FORMS_UNAVAILABLE", "Google Form 응답을 불러오지 못했습니다.", HttpStatus.BAD_GATEWAY, exception);
		}
	}

	private JsonNode get(String url) throws IOException, InterruptedException {
		HttpRequest request = HttpRequest.newBuilder(URI.create(url))
			.header("Authorization", "Bearer " + accessToken())
			.GET().build();
		HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
		if (response.statusCode() < 200 || response.statusCode() >= 300) {
			throw new RecruitResponseSyncException("GOOGLE_FORMS_REQUEST_FAILED", "Google Form 응답 접근 권한 또는 연결 상태를 확인해주세요.", HttpStatus.BAD_GATEWAY);
		}
		return objectMapper.readTree(response.body());
	}

	private String accessToken() throws IOException {
		if (!Files.isRegularFile(serviceAccountPath)) {
			throw new RecruitResponseSyncException("GOOGLE_SERVICE_ACCOUNT_MISSING", "Google Forms 서비스 계정 키를 찾을 수 없습니다.", HttpStatus.SERVICE_UNAVAILABLE);
		}
		GoogleCredentials credentials = GoogleCredentials.fromStream(Files.newInputStream(serviceAccountPath)).createScoped(SCOPES);
		credentials.refreshIfExpired();
		return credentials.getAccessToken().getTokenValue();
	}

	private void collectQuestions(JsonNode items, List<Question> questions) {
		for (JsonNode item : items) {
			JsonNode question = item.path("questionItem").path("question");
			if (!question.isMissingNode() && !question.path("questionId").asText().isBlank()) {
				questions.add(new Question(question.path("questionId").asText(), item.path("title").asText("")));
			}
			collectQuestions(item.path("item"), questions);
		}
	}

	private Response toResponse(JsonNode response) {
		Map<String, String> answers = new LinkedHashMap<>();
		response.path("answers").fields().forEachRemaining(entry -> {
			List<String> values = new ArrayList<>();
			for (JsonNode answer : entry.getValue().path("textAnswers").path("answers")) values.add(answer.path("value").asText(""));
			answers.put(entry.getKey(), String.join("; ", values));
		});
		return new Response(response.path("responseId").asText(), answers);
	}
}
