create table public.payments(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 purpose text not null check(purpose in ('REGISTRATION','MONTHLY_CONTRIBUTION','SAVINGS','SHARE_CAPITAL','WELFARE','LOAN_REPAYMENT','INVESTMENT')),
 amount_kes numeric(14,2) not null check(amount_kes>0), currency char(3) not null default 'KES' check(currency='KES'),
 status text not null default 'INITIATED' check(status in ('INITIATED','PENDING','VERIFIED','FAILED','REFUNDED')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index payments_owner_idx on public.payments(user_id,created_at desc);
create table public.payment_transactions(
 id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.payments(id), provider text not null,
 provider_transaction_id text, idempotency_key text not null unique, provider_payload_hash text,
 verified_at timestamptz, created_at timestamptz not null default now(), unique(provider,provider_transaction_id));
create table public.member_contributions(
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members(id), payment_id uuid not null unique references public.payments(id),
 contribution_month date not null check(extract(day from contribution_month)=1), amount_kes numeric(12,2) not null default 100 check(amount_kes=100),
 status text not null default 'PENDING' check(status in ('PENDING','VERIFIED','REVERSED')), created_at timestamptz not null default now(), unique(member_id,contribution_month));
create index contribution_member_month_idx on public.member_contributions(member_id,contribution_month desc);
create table public.member_savings(
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members(id), account_reference text not null unique,
 status text not null default 'ACTIVE' check(status in ('ACTIVE','FROZEN','CLOSED')), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.savings_transactions(
 id uuid primary key default gen_random_uuid(), savings_account_id uuid not null references public.member_savings(id), payment_id uuid unique references public.payments(id),
 transaction_type text not null check(transaction_type in ('DEPOSIT','WITHDRAWAL','REVERSAL')), amount_kes numeric(14,2) not null check(amount_kes>0), created_at timestamptz not null default now());
create table public.share_capital(
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members(id), payment_id uuid unique references public.payments(id),
 amount_kes numeric(14,2) not null check(amount_kes>0), status text not null default 'PENDING' check(status in ('PENDING','VERIFIED','REVERSED')), created_at timestamptz not null default now());
create table public.welfare_funds(
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members(id), payment_id uuid unique references public.payments(id),
 fund_type text not null, amount_kes numeric(14,2) not null check(amount_kes>0), status text not null default 'PENDING' check(status in ('PENDING','VERIFIED','REVERSED')), created_at timestamptz not null default now());

create table public.loan_applications(
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members(id), amount_requested_kes numeric(14,2) not null check(amount_requested_kes>0),
 purpose text not null, repayment_months integer not null check(repayment_months between 1 and 120), income_source text, status text not null default 'SUBMITTED'
 check(status in ('SUBMITTED','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','APPROVED','REJECTED','WITHDRAWN')), requested_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index loan_application_queue_idx on public.loan_applications(status,requested_at);
create table public.loans(
 id uuid primary key default gen_random_uuid(), application_id uuid not null unique references public.loan_applications(id), member_id uuid not null references public.members(id),
 principal_kes numeric(14,2) not null check(principal_kes>0), currency char(3) not null default 'KES' check(currency='KES'),
 status text not null default 'APPROVED' check(status in ('APPROVED','DISBURSED','REPAYING','PAID','DEFAULTED','CANCELLED')),
 approved_by uuid not null references auth.users(id), approved_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.loan_repayments(
 id uuid primary key default gen_random_uuid(), loan_id uuid not null references public.loans(id), payment_id uuid not null unique references public.payments(id),
 amount_kes numeric(14,2) not null check(amount_kes>0), paid_at timestamptz not null default now());

create table public.financial_assistance_applications(
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members(id),
 assistance_type text not null check(assistance_type in ('RENT','SCHOOL_FEES','MEDICAL','EMERGENCY','BUSINESS','BASIC_NEEDS')),
 arrangement text not null check(arrangement in ('RECOVERABLE_LOAN','WELFARE_GRANT','DIRECT_BILL_PAYMENT')),
 amount_requested_kes numeric(14,2) not null check(amount_requested_kes>0), reason text not null,
 status text not null default 'SUBMITTED' check(status in ('SUBMITTED','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','APPROVED','PARTIALLY_APPROVED','REJECTED','PAYMENT_PROCESSING','DISBURSED','CLOSED')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index assistance_queue_idx on public.financial_assistance_applications(status,assistance_type,created_at);
create table public.rent_assistance(application_id uuid primary key references public.financial_assistance_applications(id), landlord_name text not null, landlord_phone text not null, property_location text not null, payment_deadline date not null);
create table public.school_fees_assistance(application_id uuid primary key references public.financial_assistance_applications(id), student_name text not null, institution_name text not null, admission_number text, payment_deadline date not null);
create table public.medical_assistance(application_id uuid primary key references public.financial_assistance_applications(id), provider_name text, patient_name text not null, payment_deadline date);
create table public.business_profiles(id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members(id), name text not null, category text not null, location text not null, registration_reference text, description text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.business_financing_applications(application_id uuid primary key references public.financial_assistance_applications(id), business_name text not null, category text not null, location text not null, description text not null, proposed_use text not null, expected_revenue_kes numeric(14,2));

create table public.investment_projects(
 id uuid primary key default gen_random_uuid(), name text not null, category text not null, description text not null, risk_disclosure text not null,
 capital_required_kes numeric(16,2) check(capital_required_kes>0), minimum_investment_kes numeric(14,2) check(minimum_investment_kes>0),
 status text not null default 'DRAFT' check(status in ('DRAFT','REVIEW','APPROVED','OPEN','CLOSED','COMPLETED','CANCELLED')),
 approved_by uuid references auth.users(id), approved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.investment_records(
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.investment_projects(id), investor_user_id uuid not null references auth.users(id),
 payment_id uuid unique references public.payments(id), amount_kes numeric(14,2) not null check(amount_kes>0), status text not null default 'INTERESTED'
 check(status in ('INTERESTED','PENDING_APPROVAL','ACTIVE','EXITED','CANCELLED')), created_at timestamptz not null default now());

create table public.private_documents(
 id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id), member_id uuid references public.members(id), application_id uuid references public.membership_applications(id),
 bucket_id text not null, object_path text not null unique, category text not null, mime_type text not null,
 byte_size bigint not null check(byte_size between 1 and 10485760), status text not null default 'UPLOADED'
 check(status in ('UPLOADED','UNDER_REVIEW','VERIFIED','REJECTED','EXPIRED','MORE_INFORMATION_REQUIRED')),
 expires_at date, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((member_id is null) <> (application_id is null)));
create index private_documents_owner_idx on public.private_documents(owner_user_id,created_at desc);
create table public.document_verification(
 id uuid primary key default gen_random_uuid(), document_id uuid not null references public.private_documents(id),
 reviewer_user_id uuid not null references auth.users(id), decision text not null check(decision in ('VERIFIED','REJECTED','MORE_INFORMATION_REQUIRED')),
 reason text, decided_at timestamptz not null default now());
create index document_verification_history_idx on public.document_verification(document_id,decided_at desc);
create table public.notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), title text not null, body text not null, channel text not null default 'IN_APP', read_at timestamptz, created_at timestamptz not null default now());
create table public.complaints(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), subject text not null, description text not null, status text not null default 'OPEN' check(status in ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.approval_workflows(id uuid primary key default gen_random_uuid(), workflow_key text not null unique, name text not null, active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.approval_steps(id uuid primary key default gen_random_uuid(), workflow_id uuid not null references public.approval_workflows(id), sequence_number integer not null check(sequence_number>0), required_permission text not null references public.permissions(permission_key), approval_limit_kes numeric(14,2), unique(workflow_id,sequence_number));
create table public.approval_records(id uuid primary key default gen_random_uuid(), workflow_id uuid not null references public.approval_workflows(id), resource_type text not null, resource_id uuid not null, step_number integer not null, actor_user_id uuid not null references auth.users(id), decision text not null check(decision in ('APPROVED','REJECTED','MORE_INFORMATION_REQUIRED')), reason text, created_at timestamptz not null default now());
create table public.audit_logs(id uuid primary key default gen_random_uuid(), actor_user_id uuid references auth.users(id), action_key text not null, resource_type text not null, resource_id text, request_id text, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create index audit_resource_idx on public.audit_logs(resource_type,resource_id,created_at desc);
create or replace function public.prevent_audit_log_mutation() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'audit log entries are append-only'; end; $$;
create trigger audit_logs_append_only before update or delete on public.audit_logs for each row execute function public.prevent_audit_log_mutation();
create or replace function public.audit_sensitive_write() returns trigger language plpgsql security definer set search_path='' as $$
declare row_data jsonb; resource_key text;
begin
 row_data := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 resource_key := coalesce(row_data->>'id',row_data->>'application_id',row_data->>'member_id',row_data->>'user_id');
 insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
 values(auth.uid(),lower(tg_op),tg_table_name,resource_key,'{}'::jsonb);
 if tg_op='DELETE' then return old; else return new; end if;
end; $$;
create table public.ledger_accounts(id uuid primary key default gen_random_uuid(), account_code text not null unique, name text not null, account_type text not null check(account_type in ('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE')), active boolean not null default true, created_at timestamptz not null default now());
create table public.journal_entries(id uuid primary key default gen_random_uuid(), reference text not null unique, source_type text not null, source_id uuid not null, description text not null, posted_by uuid references auth.users(id), posted_at timestamptz, reversed_entry_id uuid unique references public.journal_entries(id), created_at timestamptz not null default now());
create table public.journal_lines(id uuid primary key default gen_random_uuid(), journal_entry_id uuid not null references public.journal_entries(id), account_id uuid not null references public.ledger_accounts(id), debit_kes numeric(16,2) not null default 0 check(debit_kes>=0), credit_kes numeric(16,2) not null default 0 check(credit_kes>=0), member_id uuid references public.members(id), check((debit_kes>0 and credit_kes=0) or (credit_kes>0 and debit_kes=0)));
create index journal_lines_entry_idx on public.journal_lines(journal_entry_id);
create table public.organization_settings(setting_key text primary key, setting_value jsonb not null, updated_by uuid references auth.users(id), updated_at timestamptz not null default now());
insert into public.organization_settings(setting_key,setting_value) values ('registration_fee_kes','300'::jsonb),('monthly_contribution_kes','100'::jsonb),('assistance_eligibility_consecutive_months','6'::jsonb);

do $$ declare t text; begin
 foreach t in array array['user_profiles','membership_applications','members','employee_profiles','user_roles','administrative_assignments','payments','payment_transactions','member_contributions','savings_transactions','share_capital','welfare_funds','loan_applications','loans','loan_repayments','financial_assistance_applications','rent_assistance','school_fees_assistance','medical_assistance','business_financing_applications','investment_projects','investment_records','private_documents','document_verification','complaints','approval_records','journal_entries','journal_lines','organization_settings'] loop
  execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_sensitive_write()',t,t);
 end loop;
end $$;

create or replace function public.check_journal_balanced() returns trigger language plpgsql set search_path='' as $$
declare entry_id uuid; d numeric(16,2); c numeric(16,2); n integer; posted timestamptz;
begin
 if tg_table_name='journal_entries' then
   entry_id := coalesce(new.id,old.id);
   select posted_at into posted from public.journal_entries where id=entry_id;
   if posted is null then return null; end if;
 else
   entry_id := coalesce(new.journal_entry_id,old.journal_entry_id);
 end if;
 select coalesce(sum(debit_kes),0),coalesce(sum(credit_kes),0),count(*) into d,c,n from public.journal_lines where journal_entry_id=entry_id;
 if n=0 or d<>c then raise exception 'journal entry must have balanced debit and credit lines'; end if;
 return null;
end; $$;
create constraint trigger journal_lines_balanced after insert or update or delete on public.journal_lines deferrable initially deferred for each row execute function public.check_journal_balanced();
create constraint trigger posted_journal_entry_balanced after insert or update of posted_at on public.journal_entries deferrable initially deferred for each row execute function public.check_journal_balanced();

create or replace function public.prevent_posted_journal_mutation() returns trigger language plpgsql set search_path='' as $$
declare entry_id uuid; posted timestamptz;
begin
 if tg_table_name='journal_entries' then
   if old.posted_at is not null then raise exception 'posted journal entries are immutable; create a reversal'; end if;
 else
   entry_id := coalesce(new.journal_entry_id,old.journal_entry_id);
   select posted_at into posted from public.journal_entries where id=entry_id;
   if posted is not null then raise exception 'posted journal lines are immutable; create a reversal'; end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end; $$;
create trigger journal_entry_immutable before update or delete on public.journal_entries for each row execute function public.prevent_posted_journal_mutation();
create trigger journal_line_immutable before insert or update or delete on public.journal_lines for each row execute function public.prevent_posted_journal_mutation();
