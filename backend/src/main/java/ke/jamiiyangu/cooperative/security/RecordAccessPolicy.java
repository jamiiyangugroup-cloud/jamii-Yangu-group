package ke.jamiiyangu.cooperative.security;

import java.util.Collection;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** Requires both a database-granted permission and a self/geographic scope match. */
@Component
public class RecordAccessPolicy {
    public boolean allows(String requiredPermission, Set<String> grantedPermissions,
        UUID actorUserId, UUID recordOwnerUserId,
        Collection<JurisdictionScope> activeAssignments, JurisdictionScope recordScope) {
        if (requiredPermission == null || grantedPermissions == null || !grantedPermissions.contains(requiredPermission)) return false;
        if (actorUserId == null) return false;
        if (actorUserId.equals(recordOwnerUserId)) return true;
        if (activeAssignments == null || recordScope == null) return false;
        return activeAssignments.stream().anyMatch(assignment -> assignment != null && assignment.contains(recordScope));
    }
}
