package ke.jamiiyangu.cooperative.membership;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MembershipApplicationRepository extends JpaRepository<MembershipApplication, UUID> {
    Optional<MembershipApplication> findByReferenceCode(String referenceCode);
}
