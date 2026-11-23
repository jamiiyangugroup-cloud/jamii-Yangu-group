-- Member-owned life-planning data and cooperative-verified directories.
-- No providers, discounts, jobs, housing listings, or partners are seeded as facts.

create table public.member_budget_entries(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 entry_month date not null check(extract(day from entry_month)=1), entry_date date not null default current_date,
 entry_type text not null check(entry_type in ('INCOME','EXPENSE')), category text not null check(length(trim(category)) between 2 and 60),
 description text check(description is null or length(description)<=240), amount_kes numeric(14,2) not null check(amount_kes>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index member_budget_month_idx on public.member_budget_entries(user_id,entry_month,entry_date desc);

create table public.member_savings_goals(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(trim(title)) between 2 and 100), purpose text not null check(purpose in ('EMERGENCY','SCHOOL_FEES','RENT','BUSINESS','FAMILY','OTHER')),
 target_amount_kes numeric(14,2) not null check(target_amount_kes>0), target_date date,
 status text not null default 'ACTIVE' check(status in ('ACTIVE','COMPLETED','PAUSED','CANCELLED')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index member_savings_goals_owner_idx on public.member_savings_goals(user_id,status,created_at desc);

create table public.member_family_goals(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(trim(title)) between 2 and 100), goal_type text not null check(goal_type in ('EDUCATION','HOUSING','EMERGENCY','HOUSEHOLD','OTHER')),
 target_amount_kes numeric(14,2) not null check(target_amount_kes>0), target_date date,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index member_family_goals_owner_idx on public.member_family_goals(user_id,target_date);

create table public.cooperative_partners(
 id uuid primary key default gen_random_uuid(), name text not null, partner_type text not null,
 website_url text check(website_url is null or website_url ~* '^https://'), county_id uuid references public.counties(id), town text,
 verification_status text not null default 'PENDING' check(verification_status in ('PENDING','VERIFIED','SUSPENDED')),
 verified_by uuid references auth.users(id), verified_at timestamptz, created_at timestamptz not null default now(),
 check((verification_status='VERIFIED' and verified_by is not null and verified_at is not null) or verification_status<>'VERIFIED')
);
create index cooperative_partners_public_idx on public.cooperative_partners(verification_status,name);

create table public.partner_offers(
 id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.cooperative_partners(id),
 title text not null, description text not null, terms text not null, offer_url text check(offer_url is null or offer_url ~* '^https://'),
 starts_at timestamptz not null, ends_at timestamptz not null, status text not null default 'DRAFT' check(status in ('DRAFT','PENDING_REVIEW','PUBLISHED','CLOSED','REJECTED')),
 approved_by uuid references auth.users(id), approved_at timestamptz, created_at timestamptz not null default now(),
 check(ends_at>starts_at), check((status='PUBLISHED' and approved_by is not null and approved_at is not null) or status<>'PUBLISHED')
);
create index partner_offers_current_idx on public.partner_offers(status,starts_at,ends_at);

create table public.verified_service_providers(
 id uuid primary key default gen_random_uuid(), provider_type text not null check(provider_type in ('ELECTRICITY','WATER','INTERNET','SCHOOL_FEES','HEALTHCARE','HOUSING','BUILDING_MATERIALS','OTHER_ESSENTIAL')),
 name text not null, description text not null, county_id uuid references public.counties(id), town text,
 website_url text check(website_url is null or website_url ~* '^https://'), public_phone text, public_address text,
 status text not null default 'PENDING_VERIFICATION' check(status in ('PENDING_VERIFICATION','VERIFIED','SUSPENDED')),
 verified_by uuid references auth.users(id), verified_at timestamptz, created_at timestamptz not null default now(),
 check((status='VERIFIED' and verified_by is not null and verified_at is not null) or status<>'VERIFIED')
);
create index verified_service_lookup_idx on public.verified_service_providers(provider_type,status,county_id,town);

create table public.housing_opportunities(
 id uuid primary key default gen_random_uuid(), partner_id uuid references public.cooperative_partners(id),
 opportunity_type text not null check(opportunity_type in ('RENTAL','AFFORDABLE_HOUSING','BUILDING_MATERIALS')),
 title text not null, description text not null, county_id uuid references public.counties(id), town text,
 contact_url text check(contact_url is null or contact_url ~* '^https://'), contact_phone text,
 status text not null default 'PENDING_REVIEW' check(status in ('PENDING_REVIEW','PUBLISHED','CLOSED','REJECTED')),
 verified_by uuid references auth.users(id), verified_at timestamptz, created_at timestamptz not null default now(),
 check((status='PUBLISHED' and verified_by is not null and verified_at is not null) or status<>'PUBLISHED')
);
create index housing_opportunities_public_idx on public.housing_opportunities(status,county_id,town);

create table public.member_opportunities(
 id uuid primary key default gen_random_uuid(), opportunity_type text not null check(opportunity_type in ('JOB','INTERNSHIP','SCHOLARSHIP','BURSARY','TRAINING','GRANT','BUSINESS')),
 title text not null, organization_name text not null, description text not null, eligibility text not null,
 county_id uuid references public.counties(id), application_url text check(application_url is null or application_url ~* '^https://'),
 deadline date, status text not null default 'PENDING_REVIEW' check(status in ('PENDING_REVIEW','PUBLISHED','CLOSED','REJECTED')),
 verified_by uuid references auth.users(id), verified_at timestamptz, created_at timestamptz not null default now(),
 check((status='PUBLISHED' and verified_by is not null and verified_at is not null) or status<>'PUBLISHED')
);
create index member_opportunities_public_idx on public.member_opportunities(status,opportunity_type,deadline);

create table public.member_opportunity_saves(
 user_id uuid not null references auth.users(id) on delete cascade, opportunity_id uuid not null references public.member_opportunities(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(user_id,opportunity_id)
);

create table public.member_marketplace_listings(
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members(id),
 title text not null check(length(trim(title)) between 3 and 120), category text not null,
 description text not null check(length(trim(description)) between 10 and 2000), price_kes numeric(14,2) check(price_kes is null or price_kes>=0),
 contact_phone text not null, county_id uuid not null references public.counties(id), town text not null,
 consent_to_publish_contact boolean not null default false,
 status text not null default 'PENDING_REVIEW' check(status in ('PENDING_REVIEW','PUBLISHED','REJECTED','SUSPENDED','CLOSED')),
 reviewed_by uuid references auth.users(id), reviewed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((status='PUBLISHED' and consent_to_publish_contact and reviewed_by is not null and reviewed_at is not null) or status<>'PUBLISHED')
);
create index member_marketplace_lookup_idx on public.member_marketplace_listings(status,county_id,category,created_at desc);

create table public.member_support_tickets(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 category text not null check(category in ('ACCOUNT','APPLICATION','PAYMENT','TECHNICAL','COMPLAINT','SUGGESTION','OTHER')),
 subject text not null check(length(trim(subject)) between 3 and 160), message text not null check(length(trim(message)) between 10 and 5000),
 status text not null default 'OPEN' check(status in ('OPEN','IN_PROGRESS','WAITING_FOR_MEMBER','RESOLVED','CLOSED')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index member_support_owner_idx on public.member_support_tickets(user_id,created_at desc);

create table public.cooperative_announcements(
 id uuid primary key default gen_random_uuid(), title text not null, body text not null,
 published_at timestamptz, expires_at timestamptz, active boolean not null default false,
 created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 check(not active or (published_at is not null and created_by is not null))
);
create index cooperative_announcements_current_idx on public.cooperative_announcements(active,published_at desc);

do $$ declare t text; begin
 foreach t in array array['member_budget_entries','member_savings_goals','member_family_goals','partner_offers','verified_service_providers','housing_opportunities','member_opportunities','member_opportunity_saves','member_marketplace_listings','member_support_tickets','cooperative_announcements'] loop
  execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;

grant select,insert,update,delete on public.member_budget_entries,public.member_savings_goals,public.member_family_goals to authenticated;
create policy budget_own_rows on public.member_budget_entries for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy savings_goals_own_rows on public.member_savings_goals for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy family_goals_own_rows on public.member_family_goals for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

grant select on public.cooperative_partners to anon,authenticated;
create policy verified_partners_read on public.cooperative_partners for select to anon,authenticated using(verification_status='VERIFIED');
grant select on public.partner_offers to anon,authenticated;
create policy published_partner_offers_read on public.partner_offers for select to anon,authenticated using(status='PUBLISHED' and starts_at<=now() and ends_at>now() and exists(select 1 from public.cooperative_partners p where p.id=partner_id and p.verification_status='VERIFIED'));
grant select on public.verified_service_providers to anon,authenticated;
create policy verified_service_directory_read on public.verified_service_providers for select to anon,authenticated using(status='VERIFIED');
grant select on public.housing_opportunities to anon,authenticated;
create policy published_housing_opportunities_read on public.housing_opportunities for select to anon,authenticated using(status='PUBLISHED' and exists(select 1 from public.cooperative_partners p where p.id=partner_id and p.verification_status='VERIFIED'));
grant select on public.member_opportunities to anon,authenticated;
create policy verified_opportunities_read on public.member_opportunities for select to anon,authenticated using(status='PUBLISHED' or (status='CLOSED' and verified_by is not null));
grant select,insert,delete on public.member_opportunity_saves to authenticated;
create policy opportunity_saves_own_rows on public.member_opportunity_saves for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and exists(select 1 from public.member_opportunities o where o.id=opportunity_id and o.status in ('PUBLISHED','CLOSED')));

grant select,insert,update on public.member_marketplace_listings to authenticated;
create policy marketplace_public_or_owner_read on public.member_marketplace_listings for select to authenticated using(status='PUBLISHED' and consent_to_publish_contact or exists(select 1 from public.members m where m.id=member_id and m.user_id=auth.uid()));
create policy marketplace_member_create on public.member_marketplace_listings for insert to authenticated with check(status='PENDING_REVIEW' and reviewed_by is null and reviewed_at is null and private.member_access(member_id,'member.self.read') and exists(select 1 from public.members m where m.id=member_id and m.user_id=auth.uid()));
create policy marketplace_owner_edit_pending on public.member_marketplace_listings for update to authenticated using(exists(select 1 from public.members m where m.id=member_id and m.user_id=auth.uid()) and status='PENDING_REVIEW') with check(exists(select 1 from public.members m where m.id=member_id and m.user_id=auth.uid()) and status='PENDING_REVIEW' and reviewed_by is null and reviewed_at is null);

grant select,insert,update on public.member_support_tickets to authenticated;
create policy support_ticket_owner_rows on public.member_support_tickets for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and status='OPEN');
grant select on public.cooperative_announcements to authenticated;
create policy active_announcements_read on public.cooperative_announcements for select to authenticated using(active and published_at<=now() and (expires_at is null or expires_at>now()));

do $$ declare t text; begin
 foreach t in array array['member_budget_entries','member_savings_goals','member_family_goals','member_marketplace_listings','member_support_tickets'] loop
  execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t);
  execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_sensitive_write()',t,t);
 end loop;
end $$;
