package ke.jamiiyangu.cooperative.membership;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import ke.jamiiyangu.cooperative.config.WebConfiguration;

@WebMvcTest(value = MembershipApplicationController.class, properties = "app.membership-applications.enabled=true")
@Import(WebConfiguration.class)
class MembershipApplicationControllerTest {
    @Autowired MockMvc mvc;
    @MockBean MembershipApplicationService service;

    @Test void rejectsMissingConsentAndInvalidFields() throws Exception {
        mvc.perform(post("/api/membership-applications").contentType(MediaType.APPLICATION_JSON)
            .content("""{"fullLegalName":"A","phoneNumber":"bad","emailAddress":"bad","termsAccepted":false,"privacyAccepted":false}"""))
            .andExpect(status().isBadRequest());
    }

    @Test void returnsReferenceAndOneTimeTrackingKeyAfterValidSubmission() throws Exception {
        when(service.submit(any())).thenReturn(new SubmissionResponse("JYG-1234ABCD", "private-key", "SUBMITTED", "Save this key."));
        mvc.perform(post("/api/membership-applications").contentType(MediaType.APPLICATION_JSON)
            .content("""{"fullLegalName":"A Person","dateOfBirth":"1990-01-01","gender":"","phoneNumber":"+254700000000","emailAddress":"person@example.com","county":"Nairobi","subCounty":"Westlands","physicalAddress":"Road","occupation":"Teacher","nextOfKinName":"B Person","nextOfKinPhone":"+254711111111","termsAccepted":true,"privacyAccepted":true}"""))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.referenceCode").value("JYG-1234ABCD"))
            .andExpect(jsonPath("$.trackingKey").value("private-key"));
    }
}
