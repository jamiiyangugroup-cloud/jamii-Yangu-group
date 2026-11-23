package ke.jamiiyangu.cooperative.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RecordAccessPolicyTest {
    private final RecordAccessPolicy policy = new RecordAccessPolicy();
    private final UUID actor = UUID.randomUUID();
    private final UUID otherMember = UUID.randomUUID();
    private final UUID kajiado = UUID.randomUUID();
    private final UUID kakamega = UUID.randomUUID();

    @Test void memberCanAccessOwnRecordButNotAnotherMembersRecordWithoutAssignment() {
        JurisdictionScope record = countyRecord(kajiado);
        assertTrue(policy.allows("member.self.read", Set.of("member.self.read"), actor, actor, List.of(), record));
        assertFalse(policy.allows("member.self.read", Set.of("member.self.read"), actor, otherMember, List.of(), record));
    }

    @Test void countyAssignmentCannotCrossCountyBoundary() {
        JurisdictionScope assignment = new JurisdictionScope(JurisdictionScope.Level.COUNTY, null, kajiado, null, null);
        assertTrue(policy.allows("application.read", Set.of("application.read"), actor, otherMember, List.of(assignment), countyRecord(kajiado)));
        assertFalse(policy.allows("application.read", Set.of("application.read"), actor, otherMember, List.of(assignment), countyRecord(kakamega)));
        assertFalse(policy.allows("application.review", Set.of("application.read"), actor, otherMember, List.of(assignment), countyRecord(kajiado)));
    }

    @Test void regionalAssignmentCoversOnlyMatchingRegion() {
        UUID regionOne = UUID.randomUUID();
        UUID regionTwo = UUID.randomUUID();
        JurisdictionScope assignment = new JurisdictionScope(JurisdictionScope.Level.REGION, regionOne, null, null, null);
        JurisdictionScope inside = new JurisdictionScope(JurisdictionScope.Level.COUNTY, regionOne, kajiado, null, null);
        JurisdictionScope outside = new JurisdictionScope(JurisdictionScope.Level.COUNTY, regionTwo, kakamega, null, null);
        assertTrue(policy.allows("reports.read", Set.of("reports.read"), actor, otherMember, List.of(assignment), inside));
        assertFalse(policy.allows("reports.read", Set.of("reports.read"), actor, otherMember, List.of(assignment), outside));
    }

    @Test void missingPrincipalOrRecordScopeFailsClosed() {
        assertFalse(policy.allows("application.read", Set.of("application.read"), null, otherMember, List.of(), countyRecord(kajiado)));
        assertFalse(policy.allows("application.read", Set.of("application.read"), actor, otherMember, List.of(), null));
        assertFalse(policy.allows("application.read", Set.of(), actor, actor, List.of(), countyRecord(kajiado)));
        assertFalse(policy.allows(null, Set.of("application.read"), actor, actor, List.of(), countyRecord(kajiado)));
    }

    private JurisdictionScope countyRecord(UUID countyId) {
        return new JurisdictionScope(JurisdictionScope.Level.COUNTY, UUID.randomUUID(), countyId, null, null);
    }
}
