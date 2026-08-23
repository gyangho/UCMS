package net.gyangho.ucms.recruit;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record FinalMemberRegistrationRequest(
	@Min(value = 1, message = "기수는 1 이상이어야 합니다.")
	@Max(value = 999, message = "기수는 999 이하여야 합니다.")
	int generation
) {
}
