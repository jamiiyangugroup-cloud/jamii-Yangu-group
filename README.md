# Jamii Yangu Group Cooperative

React + TypeScript + Vite frontend, Supabase Auth/Postgres/Storage backend, and Vercel hosting configuration.

## Run on Windows PowerShell

VS Code **Live Server is not the right server for this project**. It serves the source files as static text and cannot compile React `.tsx` files, TypeScript, CSS imports, or resolve packages such as `react` and `lucide-react`. Use Vite:

```powershell
node --version
npm --version
npm install
Copy-Item .env.example .env.local
notepad .env.local
npm run dev
```

Use Node.js 20 or newer. Add the Supabase Project URL and publishable key to `.env.local`, save it, and restart Vite. Open the `Local` URL printed by Vite (normally `http://localhost:5173`). The homepage can load without credentials, but account/application features require them.

Other commands:

```powershell
npm run typecheck
npm run build
npm run preview
```

If port 5173 is occupied, Vite normally selects another free port. To choose one explicitly:

```powershell
npm run dev -- --port 5174
```

If commands are not recognized, install Node.js 20+ and reopen PowerShell. If dependencies are missing, run `npm install` from this project folder. In the current development environment, Node.js is installed outside the default shell PATH; add its installation directory to PATH before running npm scripts.

## Supabase setup

1. Create a Supabase project. In its Dashboard, use **Connect** to copy the Project URL and publishable key. The publishable key is safe for browser code only because RLS is enabled; never put a `sb_secret_...` or legacy service-role key in a `VITE_` variable.
2. Put the values in the local `.env.local` file:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

3. For a local database and RLS test run, install Docker Desktop and Supabase CLI, then run:

   ```powershell
   npx supabase start
   npx supabase status
   npx supabase test db --local
   npx supabase stop
   ```

   To apply the reviewed migrations to your linked hosted project:

   ```powershell
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

   Run and fix the local tests before pushing migrations to a hosted project.

4. In Supabase Authentication settings, enable email confirmation, set the local Site URL to `http://localhost:5173`, and allow that redirect URL. Configure a production Site URL and SMTP before production use; the hosted test email service has limits.
5. Load an authoritative region/county/sub-county directory into the geographic tables. The registration form intentionally has no free-text jurisdiction fallback.
6. Deploy the document Edge Functions and set exact allowed origins as Supabase Function secrets:

   ```powershell
   npx supabase functions deploy upload-private-document
   npx supabase functions deploy create-document-download
   npx supabase secrets set APP_ORIGIN=https://your-domain.example LOCAL_DEV_ORIGIN=http://localhost:5173
   ```

   `upload-private-document` is disabled unless `DOCUMENT_UPLOADS_ENABLED=true`; **leave it disabled** until a malware-scanning step is added and reviewed. The Edge Functions use Supabase server-side secrets; never add a secret key to `.env.local` or Vercel frontend variables.

### Staff portal access

- Open the staff workspace at `http://localhost:5173/staff` after starting Vite.
- Staff do not self-register. An authorized project owner must create the Auth user, assign the matching role and geographic scope using a controlled privileged process, and require MFA. The first Super Admin must be bootstrapped by the project owner; no public endpoint can grant roles.
- Migration `202611230004_staff_portals.sql` adds Super Finance/Regional Finance roles, role discovery and scoped summary RPCs. Apply and test all migrations before assigning real staff. The current UI displays summary figures only; it does not yet provide approval, transaction, or staff-management actions.

### Independent chama workspaces

- Open `/chama` to create an account, register a chama, or join one with its private invitation code. A verified email account is required. The chama owner can appoint Chairpersons and Treasurers, set manual Paybill/Till instructions, reconcile deposits, and review member savings or shared-fund withdrawal requests.
- Withdrawals are limited to reconciled ledger balances, require approval from two different officers, and must be paid outside the app before an authorized officer records the verified transfer reference. This is an auditable request-and-record workflow; it does **not** send a payout.
- Payment settings currently show manual collection instructions. STK Push requires Daraja application credentials, the shortcode-specific passkey, callback validation, and provider configuration. M-Pesa B2C payout access is also required for automatic withdrawals. A Paybill/Till number by itself does not enable either feature. Do not enter provider secrets in the browser or expose them as `VITE_` variables.
- Migration `202611230008_chama_workspaces.sql` must be applied to the Supabase project before chama registration and financial actions work. It has not been applied or run against a Supabase database in this workspace.

Get the Project URL/publishable key in the Supabase Dashboard's **Connect** panel or **Settings → API Keys**. No project credentials were provided or invented in this codebase.

## Vercel deployment

1. Push this project to a GitHub repository.
2. In Vercel, choose **Add New → Project**, import the GitHub repository, and keep the Vite preset. The included `vercel.json` sets `npm run build`, `dist`, SPA deep-link fallback and security headers.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` under the Vercel project's Environment Variables for Preview and Production. Add only the publishable key, never server secrets.
4. Deploy. Inspect **Deployments → deployment → Build Logs** if the build fails. A push to the connected branch triggers a new deployment; use **Redeploy** on a deployment to retry it.
5. Add a custom domain under **Project → Settings → Domains**, then follow Vercel's DNS instructions. Add the final HTTPS site URL to Supabase Auth redirect URLs and set the `APP_ORIGIN` Supabase Edge Function secret to the exact origin.

No GitHub push or Vercel deployment has been performed or verified from this environment. No Git executable or account connection is available here.

## Current implementation status

- Supabase auth and membership application UI is wired to the publishable client and database policies.
- The `/member` route provides a private sign-in workspace backed by a user-bound Supabase RPC for the authenticated member's actual membership status, verified contribution totals, eligibility, application statuses, loan/investment counts, and notifications. Values are not hardcoded.
- The real Vite app now has a `/staff` workspace with Super Admin, Super Finance, Regional Admin and Regional Finance entry points. Staff access requires a provisioned active role and assignment, MFA (aal2), and Supabase RPC authorization; its summary cards query live database aggregates and are audit logged.
- To view the actual application, use `npm run dev` and open the URL Vite prints. Live Server cannot run the React/TypeScript application.
- Supabase SQL migrations, RLS policies, private buckets, Edge Function source and pgTAP tests are present, but **not applied or executed**. The unapproved example fee, monthly contribution and assistance eligibility defaults have been removed by migration `202611230007_remove_unapproved_financial_defaults.sql`; no such amounts are currently configured.
- Staff assignment provisioning, operational review queues and approvals, member transactions/savings management, live payment processing and document scanning are not yet operational. Member and staff workspaces currently display authorized account summaries and status records. The existing `backend/` Spring code is legacy and is not used by the Supabase client.
- The new staff portal migration must be applied locally and tested before use. No admin users or assignments have been created.
- Privacy and membership terms remain drafts; complete them with professional review before collecting real applications.

See [ARCHITECTURE.md](ARCHITECTURE.md) for scope and next steps.
