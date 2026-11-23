INSERT INTO roles (id, role_key, display_name, privileged) VALUES
  (gen_random_uuid(), 'SUPER_ADMIN', 'Super Administrator', TRUE),
  (gen_random_uuid(), 'NATIONAL_MANAGER', 'National Manager', TRUE),
  (gen_random_uuid(), 'REGIONAL_ADMIN', 'Regional Administrator', TRUE),
  (gen_random_uuid(), 'COUNTY_ADMIN', 'County Administrator', TRUE),
  (gen_random_uuid(), 'SUB_COUNTY_ADMIN', 'Sub-county Administrator', TRUE),
  (gen_random_uuid(), 'BRANCH_ADMIN', 'Branch Administrator', TRUE),
  (gen_random_uuid(), 'MEMBERSHIP_OFFICER', 'Membership Officer', TRUE),
  (gen_random_uuid(), 'KYC_VERIFICATION_OFFICER', 'KYC Verification Officer', TRUE),
  (gen_random_uuid(), 'FINANCE_OFFICER', 'Finance Officer', TRUE),
  (gen_random_uuid(), 'CREDIT_OFFICER', 'Credit Officer', TRUE),
  (gen_random_uuid(), 'INVESTMENT_OFFICER', 'Investment Officer', TRUE),
  (gen_random_uuid(), 'HR_MANAGER', 'HR Manager', TRUE),
  (gen_random_uuid(), 'SUPPORT_OFFICER', 'Support Officer', TRUE),
  (gen_random_uuid(), 'MEMBER', 'Member', FALSE),
  (gen_random_uuid(), 'INVESTOR', 'Investor', FALSE);

INSERT INTO permissions (id, permission_key, description) VALUES
  (gen_random_uuid(), 'member.self.read', 'Read own member profile and workspace'),
  (gen_random_uuid(), 'member.self.update', 'Update permitted own profile fields'),
  (gen_random_uuid(), 'member.contribution.read', 'Read own contribution history'),
  (gen_random_uuid(), 'member.savings.read', 'Read own savings balances and activity'),
  (gen_random_uuid(), 'member.savings.withdraw.request', 'Request a permitted savings withdrawal'),
  (gen_random_uuid(), 'member.loan.read', 'Read own loan accounts and applications'),
  (gen_random_uuid(), 'member.loan.apply', 'Submit own loan application'),
  (gen_random_uuid(), 'member.assistance.read', 'Read own assistance applications'),
  (gen_random_uuid(), 'member.assistance.apply', 'Submit own assistance application'),
  (gen_random_uuid(), 'member.document.read', 'Read own document verification status'),
  (gen_random_uuid(), 'member.document.upload', 'Upload a document to own private vault'),
  (gen_random_uuid(), 'member.support.read', 'Read own support cases'),
  (gen_random_uuid(), 'member.support.create', 'Create a support case'),
  (gen_random_uuid(), 'application.read', 'Read membership applications within assigned scope'),
  (gen_random_uuid(), 'application.review', 'Review membership applications within assigned scope'),
  (gen_random_uuid(), 'kyc.read', 'Read KYC status and documents within assigned scope'),
  (gen_random_uuid(), 'kyc.review', 'Review KYC documents within assigned scope'),
  (gen_random_uuid(), 'finance.contribution.read', 'Read contribution records within assigned scope'),
  (gen_random_uuid(), 'finance.payment.verify', 'Verify payment transactions within assigned scope'),
  (gen_random_uuid(), 'credit.application.read', 'Read credit applications within assigned scope'),
  (gen_random_uuid(), 'credit.application.review', 'Review credit applications within assigned scope'),
  (gen_random_uuid(), 'assistance.application.read', 'Read support applications within assigned scope'),
  (gen_random_uuid(), 'assistance.application.review', 'Review support applications within assigned scope'),
  (gen_random_uuid(), 'investment.read', 'Read approved investment information'),
  (gen_random_uuid(), 'investment.manage', 'Manage investment opportunities within authority'),
  (gen_random_uuid(), 'staff.manage', 'Manage staff records within authority'),
  (gen_random_uuid(), 'administration.accounts.manage', 'Manage administrator accounts'),
  (gen_random_uuid(), 'administration.jurisdictions.manage', 'Manage regional and county assignments'),
  (gen_random_uuid(), 'reports.read', 'Read reports within assigned scope'),
  (gen_random_uuid(), 'audit.read', 'Read audit events within assigned scope'),
  (gen_random_uuid(), 'support.manage', 'Manage member support cases within assigned scope'),
  (gen_random_uuid(), 'governance.manage', 'Manage cooperative governance records'),
  (gen_random_uuid(), 'settings.manage', 'Manage authorized system settings'),
  (gen_random_uuid(), 'finance.transactions.approve', 'Approve financial transactions within limits'),
  (gen_random_uuid(), 'finance.ledger.read', 'Read ledger records within assigned scope');

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.role_key = 'SUPER_ADMIN';

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN (
  'member.self.read','member.self.update','member.contribution.read','member.savings.read',
  'member.savings.withdraw.request','member.loan.read','member.loan.apply','member.assistance.read',
  'member.assistance.apply','member.document.read','member.document.upload','member.support.read','member.support.create'
) WHERE r.role_key = 'MEMBER';

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = 'investment.read'
WHERE r.role_key = 'INVESTOR';

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN (
  'application.read','application.review','kyc.read','reports.read'
) WHERE r.role_key IN ('MEMBERSHIP_OFFICER','COUNTY_ADMIN','SUB_COUNTY_ADMIN','BRANCH_ADMIN','REGIONAL_ADMIN','NATIONAL_MANAGER');

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN (
  'kyc.read','kyc.review','application.read'
) WHERE r.role_key = 'KYC_VERIFICATION_OFFICER';

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN (
  'finance.contribution.read','finance.payment.verify','finance.ledger.read','reports.read'
) WHERE r.role_key = 'FINANCE_OFFICER';

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN (
  'credit.application.read','credit.application.review','assistance.application.read',
  'assistance.application.review','reports.read'
) WHERE r.role_key = 'CREDIT_OFFICER';

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN (
  'investment.read','investment.manage','reports.read'
) WHERE r.role_key = 'INVESTMENT_OFFICER';

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN (
  'staff.manage','reports.read'
) WHERE r.role_key = 'HR_MANAGER';

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key IN (
  'support.manage'
) WHERE r.role_key = 'SUPPORT_OFFICER';
