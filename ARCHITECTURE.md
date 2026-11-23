# Jamii Yangu — Current Architecture and Delivery Plan

## Existing project inspection

- **Frontend:** React 18 + TypeScript + Vite 6. Entry point is `src/main.tsx`; there is no router yet. The homepage uses anchor navigation and a membership dialog.
- **Development:** `npm run dev`, `npm run build`, and `npm run preview` are already defined. VS Code Live Server is not the app server: it serves raw files and cannot transpile TSX or resolve npm package imports. Dependencies are present in `node_modules`; Node is installed outside this shell's PATH. The frontend build is being checked with the installed runtime.
- **Backend transition:** Earlier work added an unfinished Spring Boot API under `backend/`. The newer project direction selects Supabase, so that Java API is now legacy and is not used by the Vite client. Do not run it alongside the Supabase version.
- **Supabase:** Version-controlled schema is under `supabase/migrations/`; Edge Functions are under `supabase/functions/`. No Supabase project credentials were supplied, the migrations have not been applied, and nothing has been deployed.
- **Hosting:** `vercel.json` configures Vite output, SPA fallback and security headers. No GitHub or Vercel connection exists in this workspace.

## Target architecture

- **Client:** React + TypeScript + Vite, mobile-first, deployed as a static Vite app on Vercel.
- **Identity and data:** Supabase Auth and PostgreSQL. Public users use only the Supabase publishable key. No password table or service/secret key is shipped to the browser.
- **Authorization:** PostgreSQL RLS is the data boundary. Database role permissions answer what an officer may do; active assignments answer which region/county/sub-county/branch they may access. The authenticated JWT subject supplies the user identity, never a browser-supplied user ID.
- **Sensitive documents:** Private Storage buckets. Direct client downloads are denied. Edge Functions verify the caller against RLS, write an audit event, and issue a 60-second signed URL. Upload is disabled by default; the current function checks size and file signatures but has no malware scanner.
- **Financial data:** KES fixed-precision values, separate contribution/savings/share/welfare/payment tables, immutable double-entry journal lines, and payment verification before posting. Client roles have no direct write access to payment/ledger records.
- **External services:** Official payment/SMS/email integrations are not configured. Do not represent an initiated payment as verified.

## Implemented in this Supabase slice

- Supabase Auth signup, sign-in, sign-out, password reset and update flows in the membership dialog.
- User-owned application submission and status list, conditioned on verified email, authentication, RLS, and configured county/sub-county reference rows.
- A `/member` PIW using a Supabase RPC bound to `auth.uid()` for actual membership/application, verified contribution, eligibility, active loan/investment count, and notification data.
- Core normalized schema for identity, membership, geography, staff, finance, loans, assistance, investments, documents, notifications, complaints, approvals, audit, accounting, and settings.
- Database-backed role/permission seeds for the requested roles. No public route can assign roles or geographic scope.
- RLS helper functions and policies for owner reads, scoped administrative reads, constrained application inserts, policy-configured assistance eligibility, and approved public listings.
- Nine private Storage buckets with size/MIME limits and two Edge Functions for signature-checked upload and audited short-lived download links. Upload is gated by `DOCUMENT_UPLOADS_ENABLED=true` and must stay disabled until malware scanning is integrated and reviewed.
- pgTAP negative access tests for own-member isolation, cross-county application isolation, and role self-assignment denial.
- Vercel SPA rewrite and baseline security headers.
- A `/staff` portal entry with MFA enrollment/challenge and four assigned workspaces. Its summary RPC verifies active role plus global/regional assignment on every request, returns database aggregates, and appends portal-access audit records.

## Important limits

The Supabase project is not connected or initialized with real credentials. Migrations and database tests have not run. The region/county/sub-county directory has no seed data yet. Staff assignment provisioning, membership review/approval actions, member financial transactions/savings management, operational review queues, payment provider callback, ledger posting RPC, antivirus scanning, notification provider, or operational backup plan remain unfinished. Staff portal access checks require `aal2` and UI enrollment/challenge is present, but it has not been exercised against a Supabase project. Draft legal pages still require professional review.

No approved cooperative policy was supplied for registration fees, monthly contributions, or assistance eligibility. Migration `202611230007_remove_unapproved_financial_defaults.sql` removes the example values introduced by the earlier schema, preserves administrator-updated settings and existing records, and leaves amounts unset until configured. The member page reports unset policy instead of presenting a made-up amount or eligibility rule. The cooperative must still provide approved values and workflows before those financial features can be operated.

The staff portal currently provides role-scoped summary views only. It does not complete application decisions, finance approvals, reconciliation, user/role management, system configuration, or audit-log browsing. Those actions must be added with approved decision rules and verified against a configured Supabase project; the current summary cards are not a complete operational portal.

## Next implementation steps

1. Install Node 20+, Docker Desktop, and Supabase CLI; run the local migrations and pgTAP tests; correct any reported SQL issues.
2. Add a reviewed Kenyan geography dataset, configure Auth email confirmation/SMTP, and exercise registration through the local Supabase stack.
3. Add controlled membership/KYC approval RPCs, audited administrator onboarding, and privileged MFA setup/challenge/recovery.
4. Build member, county/branch and staff review workflows against RLS-protected data; test every view and action with negative access cases.
5. Integrate document scanning before enabling uploads; add payment provider verification and balanced ledger posting RPCs.
6. Add notification/support workflows and run the security/deployment checklist before production.

The old Spring migrations are not part of the Supabase migration history. Use only `supabase/migrations/` for the required Supabase stack.
