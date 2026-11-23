CREATE TABLE membership_application (
    id UUID PRIMARY KEY,
    reference_code VARCHAR(20) NOT NULL UNIQUE,
    access_key_hash VARCHAR(100) NOT NULL,
    full_legal_name VARCHAR(160) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(30),
    phone_number VARCHAR(24) NOT NULL,
    email_address VARCHAR(254) NOT NULL,
    county VARCHAR(80) NOT NULL,
    sub_county VARCHAR(100) NOT NULL,
    physical_address VARCHAR(240) NOT NULL,
    occupation VARCHAR(120) NOT NULL,
    next_of_kin_name VARCHAR(160) NOT NULL,
    next_of_kin_phone VARCHAR(24) NOT NULL,
    consented_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT membership_application_status_check CHECK (status IN ('SUBMITTED','PAYMENT_PENDING','UNDER_REVIEW','APPROVED','REJECTED','MORE_INFORMATION_REQUIRED'))
);
CREATE INDEX membership_application_email_idx ON membership_application (lower(email_address));
CREATE INDEX membership_application_phone_idx ON membership_application (phone_number);
