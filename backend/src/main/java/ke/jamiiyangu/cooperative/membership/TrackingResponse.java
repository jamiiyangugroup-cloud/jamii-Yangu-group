package ke.jamiiyangu.cooperative.membership;

import java.time.Instant;

public record TrackingResponse(String referenceCode, String status, Instant submittedAt, String message) {}
