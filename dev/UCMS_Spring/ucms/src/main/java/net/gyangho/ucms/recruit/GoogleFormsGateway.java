package net.gyangho.ucms.recruit;

import java.util.List;
import java.util.Map;

public interface GoogleFormsGateway {
	FormSnapshot load(String formId);

	record FormSnapshot(List<Question> questions, List<Response> responses) { }
	record Question(String id, String title) { }
	record Response(String id, Map<String, String> answers) { }
}
