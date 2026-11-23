package ke.jamiiyangu.cooperative.membership;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record MembershipApplicationRequest(
    @NotBlank @Size(max = 160) String fullLegalName,
    @NotNull @Past LocalDate dateOfBirth,
    @Size(max = 30) String gender,
    @NotBlank @Pattern(regexp = "^\\+?[0-9 ()-]{9,20}$") String phoneNumber,
    @NotBlank @Email @Size(max = 254) String emailAddress,
    @NotBlank @Size(max = 80) String county,
    @NotBlank @Size(max = 100) String subCounty,
    @NotBlank @Size(max = 240) String physicalAddress,
    @NotBlank @Size(max = 120) String occupation,
    @NotBlank @Size(max = 160) String nextOfKinName,
    @NotBlank @Pattern(regexp = "^\\+?[0-9 ()-]{9,20}$") String nextOfKinPhone,
    boolean termsAccepted,
    boolean privacyAccepted
) {}
