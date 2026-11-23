package ke.jamiiyangu.cooperative.security;

import java.util.UUID;

public record JurisdictionScope(
    Level level,
    UUID regionId,
    UUID countyId,
    UUID subCountyId,
    UUID branchId
) {
    public enum Level { GLOBAL, REGION, COUNTY, SUB_COUNTY, BRANCH }

    public boolean contains(JurisdictionScope resource) {
        if (resource == null || level == null) return false;
        return switch (level) {
            case GLOBAL -> true;
            case REGION -> same(regionId, resource.regionId);
            case COUNTY -> same(countyId, resource.countyId);
            case SUB_COUNTY -> same(subCountyId, resource.subCountyId);
            case BRANCH -> same(branchId, resource.branchId);
        };
    }

    private static boolean same(UUID assigned, UUID resource) {
        return assigned != null && assigned.equals(resource);
    }
}
