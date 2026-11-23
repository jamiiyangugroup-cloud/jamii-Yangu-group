package ke.jamiiyangu.cooperative.membership;

import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class MembershipApplicationServiceTest {
    @Mock MembershipApplicationRepository repository;
    @Mock PasswordEncoder passwordEncoder;
    @InjectMocks MembershipApplicationService service;

    @Test void returnsPrivateTrackingKeyButPersistsOnlyItsHash() {
        when(passwordEncoder.encode(any())).thenAnswer(invocation -> "bcrypt:" + invocation.getArgument(0));
        MembershipApplicationRequest request = new MembershipApplicationRequest(
            "Applicant Name", java.time.LocalDate.of(1990, 1, 1), null, "+254700000000", "person@example.com",
            "Nairobi", "Westlands", "Example Road", "Teacher", "Next Person", "+254711111111", true, true);

        SubmissionResponse response = service.submit(request);

        assertTrue(response.referenceCode().startsWith("JYG-"));
        assertNotNull(response.trackingKey());
        ArgumentCaptor<MembershipApplication> saved = ArgumentCaptor.forClass(MembershipApplication.class);
        verify(repository).save(saved.capture());
        assertNotEquals(response.trackingKey(), saved.getValue().getAccessKeyHash());
    }
}
