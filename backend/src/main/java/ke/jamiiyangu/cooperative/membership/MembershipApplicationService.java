package ke.jamiiyangu.cooperative.membership;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class MembershipApplicationService {
    private final MembershipApplicationRepository repository;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom secureRandom = new SecureRandom();

    public MembershipApplicationService(MembershipApplicationRepository repository, PasswordEncoder passwordEncoder) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public SubmissionResponse submit(MembershipApplicationRequest request) {
        if (!request.termsAccepted() || !request.privacyAccepted()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Terms and privacy consent are required.");
        }
        byte[] keyBytes = new byte[32];
        secureRandom.nextBytes(keyBytes);
        String trackingKey = Base64.getUrlEncoder().withoutPadding().encodeToString(keyBytes);
        String reference = "JYG-" + UUID.randomUUID().toString().substring(0, 16).toUpperCase();
        MembershipApplication application = new MembershipApplication(reference, passwordEncoder.encode(trackingKey), request, Instant.now());
        repository.save(application);
        return new SubmissionResponse(reference, trackingKey, application.getStatus().name(),
            "Save this tracking key. It is shown once and is required to check your application status.");
    }

    @Transactional(readOnly = true)
    public TrackingResponse track(String referenceCode, String trackingKey) {
        MembershipApplication application = repository.findByReferenceCode(referenceCode.trim().toUpperCase())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Application not found or access key is incorrect."));
        if (trackingKey == null || !passwordEncoder.matches(trackingKey, application.getAccessKeyHash())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Application not found or access key is incorrect.");
        }
        return new TrackingResponse(application.getReferenceCode(), application.getStatus().name(), application.getCreatedAt(),
            "Application status only. Payment confirmation and membership approval are separate steps.");
    }
}
