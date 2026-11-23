package ke.jamiiyangu.cooperative.membership;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "membership_application")
public class MembershipApplication {
    @Id
    private UUID id;
    @Column(name = "reference_code", nullable = false, unique = true, length = 20)
    private String referenceCode;
    @Column(name = "access_key_hash", nullable = false, length = 100)
    private String accessKeyHash;
    @Column(name = "full_legal_name", nullable = false, length = 160)
    private String fullLegalName;
    @Column(name = "date_of_birth", nullable = false)
    private LocalDate dateOfBirth;
    @Column(length = 30)
    private String gender;
    @Column(name = "phone_number", nullable = false, length = 24)
    private String phoneNumber;
    @Column(name = "email_address", nullable = false, length = 254)
    private String emailAddress;
    @Column(nullable = false, length = 80)
    private String county;
    @Column(name = "sub_county", nullable = false, length = 100)
    private String subCounty;
    @Column(name = "physical_address", nullable = false, length = 240)
    private String physicalAddress;
    @Column(nullable = false, length = 120)
    private String occupation;
    @Column(name = "next_of_kin_name", nullable = false, length = 160)
    private String nextOfKinName;
    @Column(name = "next_of_kin_phone", nullable = false, length = 24)
    private String nextOfKinPhone;
    @Column(name = "consented_at", nullable = false)
    private Instant consentedAt;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ApplicationStatus status;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected MembershipApplication() {}

    public MembershipApplication(String referenceCode, String accessKeyHash, MembershipApplicationRequest request, Instant consentedAt) {
        this.id = UUID.randomUUID();
        this.referenceCode = referenceCode;
        this.accessKeyHash = accessKeyHash;
        this.fullLegalName = request.fullLegalName().trim();
        this.dateOfBirth = request.dateOfBirth();
        this.gender = request.gender() == null ? null : request.gender().trim();
        this.phoneNumber = request.phoneNumber().trim();
        this.emailAddress = request.emailAddress().trim().toLowerCase();
        this.county = request.county().trim();
        this.subCounty = request.subCounty().trim();
        this.physicalAddress = request.physicalAddress().trim();
        this.occupation = request.occupation().trim();
        this.nextOfKinName = request.nextOfKinName().trim();
        this.nextOfKinPhone = request.nextOfKinPhone().trim();
        this.consentedAt = consentedAt;
        this.status = ApplicationStatus.SUBMITTED;
    }

    @PrePersist void onCreate() { createdAt = Instant.now(); updatedAt = createdAt; }
    @PreUpdate void onUpdate() { updatedAt = Instant.now(); }
    public String getReferenceCode() { return referenceCode; }
    public String getAccessKeyHash() { return accessKeyHash; }
    public ApplicationStatus getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
}
