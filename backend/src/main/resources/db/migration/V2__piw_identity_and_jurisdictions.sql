CREATE TABLE regions (
    id UUID PRIMARY KEY,
    code VARCHAR(24) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE counties (
    id UUID PRIMARY KEY,
    region_id UUID NOT NULL REFERENCES regions(id),
    code VARCHAR(24) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX counties_region_idx ON counties(region_id);

CREATE TABLE sub_counties (
    id UUID PRIMARY KEY,
    county_id UUID NOT NULL REFERENCES counties(id),
    code VARCHAR(24) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT sub_counties_id_county_unique UNIQUE (id, county_id)
);
CREATE INDEX sub_counties_county_idx ON sub_counties(county_id);

CREATE TABLE branches (
    id UUID PRIMARY KEY,
    sub_county_id UUID NOT NULL REFERENCES sub_counties(id),
    code VARCHAR(24) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT branches_id_sub_county_unique UNIQUE (id, sub_county_id)
);
CREATE INDEX branches_sub_county_idx ON branches(sub_county_id);

CREATE TABLE users (
    id UUID PRIMARY KEY,
    username VARCHAR(80) NOT NULL,
    email_address VARCHAR(254) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    account_status VARCHAR(24) NOT NULL DEFAULT 'INVITED',
    mfa_secret_ciphertext TEXT,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_status_check CHECK (account_status IN ('INVITED','ACTIVE','SUSPENDED','CLOSED')),
    CONSTRAINT users_failed_login_check CHECK (failed_login_count >= 0),
    CONSTRAINT users_username_lowercase_check CHECK (username = lower(username)),
    CONSTRAINT users_email_lowercase_check CHECK (email_address = lower(email_address))
);
CREATE UNIQUE INDEX users_username_lower_unique ON users(lower(username));
CREATE UNIQUE INDEX users_email_lower_unique ON users(lower(email_address));
CREATE INDEX users_status_idx ON users(account_status);

CREATE TABLE roles (
    id UUID PRIMARY KEY,
    role_key VARCHAR(40) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    privileged BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY,
    permission_key VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(240) NOT NULL
);

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id),
    permission_id UUID NOT NULL REFERENCES permissions(id),
    PRIMARY KEY(role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id),
    role_id UUID NOT NULL REFERENCES roles(id),
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    PRIMARY KEY(user_id, role_id, assigned_at)
);
CREATE INDEX user_roles_active_idx ON user_roles(user_id, role_id) WHERE revoked_at IS NULL;

CREATE TABLE administrative_assignments (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    role_id UUID NOT NULL REFERENCES roles(id),
    scope_level VARCHAR(20) NOT NULL,
    region_id UUID REFERENCES regions(id),
    county_id UUID REFERENCES counties(id),
    sub_county_id UUID REFERENCES sub_counties(id),
    branch_id UUID REFERENCES branches(id),
    assigned_by UUID NOT NULL REFERENCES users(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    CONSTRAINT admin_assignment_level_check CHECK (scope_level IN ('GLOBAL','REGION','COUNTY','SUB_COUNTY','BRANCH')),
    CONSTRAINT admin_assignment_scope_check CHECK (
      (scope_level = 'GLOBAL' AND region_id IS NULL AND county_id IS NULL AND sub_county_id IS NULL AND branch_id IS NULL) OR
      (scope_level = 'REGION' AND region_id IS NOT NULL AND county_id IS NULL AND sub_county_id IS NULL AND branch_id IS NULL) OR
      (scope_level = 'COUNTY' AND region_id IS NULL AND county_id IS NOT NULL AND sub_county_id IS NULL AND branch_id IS NULL) OR
      (scope_level = 'SUB_COUNTY' AND region_id IS NULL AND county_id IS NULL AND sub_county_id IS NOT NULL AND branch_id IS NULL) OR
      (scope_level = 'BRANCH' AND region_id IS NULL AND county_id IS NULL AND sub_county_id IS NULL AND branch_id IS NOT NULL)
    )
);
CREATE INDEX admin_assignments_user_active_idx ON administrative_assignments(user_id, role_id) WHERE revoked_at IS NULL;
CREATE INDEX admin_assignments_county_idx ON administrative_assignments(county_id) WHERE revoked_at IS NULL;

CREATE TABLE member_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    application_id UUID NOT NULL UNIQUE REFERENCES membership_application(id),
    membership_number VARCHAR(24) UNIQUE,
    membership_status VARCHAR(24) NOT NULL DEFAULT 'PENDING_APPROVAL',
    county_id UUID REFERENCES counties(id),
    sub_county_id UUID REFERENCES sub_counties(id),
    branch_id UUID REFERENCES branches(id),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT member_profiles_status_check CHECK (membership_status IN ('PENDING_APPROVAL','ACTIVE','SUSPENDED','REJECTED','CLOSED')),
    CONSTRAINT member_profiles_sub_county_requires_county CHECK (sub_county_id IS NULL OR county_id IS NOT NULL),
    CONSTRAINT member_profiles_branch_requires_sub_county CHECK (branch_id IS NULL OR sub_county_id IS NOT NULL),
    CONSTRAINT member_profiles_approval_check CHECK (
      (membership_status <> 'ACTIVE') OR (membership_number IS NOT NULL AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    ),
    CONSTRAINT member_profiles_sub_county_matches_county FOREIGN KEY (sub_county_id, county_id) REFERENCES sub_counties(id, county_id),
    CONSTRAINT member_profiles_branch_matches_sub_county FOREIGN KEY (branch_id, sub_county_id) REFERENCES branches(id, sub_county_id)
);
CREATE INDEX member_profiles_county_idx ON member_profiles(county_id);
CREATE INDEX member_profiles_sub_county_idx ON member_profiles(sub_county_id);
CREATE INDEX member_profiles_branch_idx ON member_profiles(branch_id);

CREATE TABLE approval_records (
    id UUID PRIMARY KEY,
    application_id UUID NOT NULL REFERENCES membership_application(id),
    reviewer_user_id UUID NOT NULL REFERENCES users(id),
    decision VARCHAR(32) NOT NULL,
    reason TEXT,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT approval_records_decision_check CHECK (decision IN ('APPROVED','REJECTED','MORE_INFORMATION_REQUIRED'))
);
CREATE INDEX approval_records_application_idx ON approval_records(application_id, decided_at DESC);

CREATE TABLE audit_events (
    id UUID PRIMARY KEY,
    actor_user_id UUID REFERENCES users(id),
    action_key VARCHAR(100) NOT NULL,
    resource_type VARCHAR(80) NOT NULL,
    resource_id VARCHAR(100),
    request_id VARCHAR(100),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_actor_time_idx ON audit_events(actor_user_id, occurred_at DESC);
CREATE INDEX audit_events_resource_idx ON audit_events(resource_type, resource_id, occurred_at DESC);

CREATE FUNCTION prevent_audit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit events are append-only';
END;
$$;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();
