# Jamii Yangu production readiness

## Database state

The repository contains these versioned migrations, which depend on chronological application:

1. `202611230001_identity_membership.sql`
2. `202611230002_financial_workflows.sql`
3. `202611230003_rls_storage.sql`
4. `202611230004_staff_portals.sql`
5. `202611230005_member_life_services.sql`
6. `202611230006_general_finance_label.sql`
7. `202611230007_remove_unapproved_financial_defaults.sql`
8. `202611230008_chama_workspaces.sql`
9. `202611240001_staff_governance.sql`
10. `202611240002_finance_reconciliation.sql`
11. `202611240003_cooperative_policy_and_member_loans.sql`

The linked production project is `pccaayvqnzcywadxxvtd`. The Supabase CLI is available, but the current environment has no `SUPABASE_ACCESS_TOKEN`. `supabase migration list --remote` therefore could not read the remote migration table. No migration was applied, and the remote schema version remains unverified. Do not run these migration files manually in the Dashboard SQL Editor: that would bypass Supabase's migration history and the files are versioned scripts, not safe to replay.

After an authorized operator signs in to the Supabase CLI, inspect and apply only the migration versions shown as pending:

```powershell
npm.cmd exec --yes --package=supabase -- supabase login
npm.cmd exec --yes --package=supabase -- supabase link --project-ref pccaayvqnzcywadxxvtd
npm.cmd exec --yes --package=supabase -- supabase migration list --remote
npm.cmd exec --yes --package=supabase -- supabase db push --dry-run
```

Review the dry run and confirm a current database backup before applying:

```powershell
npm.cmd exec --yes --package=supabase -- supabase db push
npm.cmd exec --yes --package=supabase -- supabase migration list --remote
```

Do not use `supabase db reset` against production. Do not repair migration history with direct inserts or deletes. Resolve any schema drift with a reviewed, versioned migration.

## Local database tests

The test files are under `tests/database/` and run against a local Supabase database, not production. Docker is not installed in the current environment, so pgTAP could not be executed here. With Docker available, run:

```powershell
npm.cmd exec --yes --package=supabase -- supabase start
npm.cmd exec --yes --package=supabase -- supabase test db
npm.cmd exec --yes --package=supabase -- supabase stop
```

The tests use transactions and rollback synthetic fixtures. They must be run against the local Supabase stack or a disposable test project.

## Verified repository and deployment facts

- Vercel project framework is Vite; build command is `npm run build`; output is `dist`; production branch is `main`.
- Vercel has `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` configured for Production and Preview. Secret values are intentionally not recorded here.
- All five `/apps/...` routes and the sampled PWA manifest and service worker returned HTTP 200 through Vercel's authenticated route checker. Those responses verify SPA route fallback and static asset availability only; they do not verify authenticated portal access or database operations.
- Five separate manifests and icons exist. The root service worker handles all app paths under one scope; it is not a separately deployed worker per portal.
- The staff portal calls `get_my_staff_portals()` and requires an MFA `aal2` session before showing assigned portals. The member workspace calls authenticated member RPCs and relies on RLS.
- `vercel project inspect` confirms Vite settings and the GitHub production branch. The last known production deployment was READY. Vercel Authentication protection remains enabled.

## Backend work still required

- Loan backend currently checks eligibility and accepts applications. There are no regional review, affordability review, final approval, disbursement, amortization schedule, or repayment posting workflows. Loan terms and affordability rules require approved cooperative policy before they can safely be implemented.
- Financial assistance has application tables and member read/create policies, but no complete regional/finance/final approval and payment lifecycle in the application.
- Payment, contribution, and savings tables enforce RLS and uniqueness constraints, but the application does not implement payment initiation, an authorized verification workflow, receipt generation, or complete ledger posting/reversal operations.
- There is no Daraja STK Push or callback Edge Function in `supabase/functions/`. No Daraja environment variables are configured in the repository or Vercel project. Sandbox testing requires a Safaricom sandbox app, credentials, shortcode, passkey, and a reachable callback URL. Live payments additionally require Safaricom production approval.
- Remote database migration status, actual RLS behavior against the deployed schema, pgTAP results, and authenticated business workflows remain unverified until Supabase CLI access and a disposable test database are available.
