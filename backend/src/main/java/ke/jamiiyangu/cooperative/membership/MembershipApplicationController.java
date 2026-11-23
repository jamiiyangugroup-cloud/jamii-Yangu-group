package ke.jamiiyangu.cooperative.membership;

import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/membership-applications")
public class MembershipApplicationController {
    private final MembershipApplicationService service;
    private final boolean applicationsEnabled;
    public MembershipApplicationController(MembershipApplicationService service,
        @Value("${app.membership-applications.enabled:false}") boolean applicationsEnabled) {
        this.service = service;
        this.applicationsEnabled = applicationsEnabled;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SubmissionResponse submit(@Valid @RequestBody MembershipApplicationRequest request) {
        if (!applicationsEnabled) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Membership intake is not enabled.");
        return service.submit(request);
    }

    @GetMapping("/{referenceCode}")
    public TrackingResponse track(@PathVariable String referenceCode,
        @RequestHeader(value = "X-Application-Tracking-Key", required = false) String trackingKey) {
        return service.track(referenceCode, trackingKey);
    }
}
