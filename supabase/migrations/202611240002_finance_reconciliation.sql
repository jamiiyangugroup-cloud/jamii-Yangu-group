-- Regional finance submits self-reported reconciliations; General Finance reviews them.
-- This records review evidence only. It does not alter, approve, or post transactions.
create table public.finance_reconciliations (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id),
  period_start date not null,
  period_end date not null,
  verified_recorded_total_kes numeric(16,2) not null check(verified_recorded_total_kes>=0),
  provider_reported_total_kes numeric(16,2) check(provider_reported_total_kes is null or provider_reported_total_kes>=0),
  unmatched_count integer not null default 0 check(unmatched_count>=0),
  duplicate_count integer not null default 0 check(duplicate_count>=0),
  provider_reference text,
  notes text not null,
  status text not null default 'SUBMITTED' check(status in ('SUBMITTED','CLARIFICATION_REQUIRED','ACCEPTED','REJECTED')),
  submitted_by uuid not null references auth.users(id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  check(period_end>=period_start),
  check(length(trim(notes)) between 10 and 2000),
  check(provider_reference is null or length(provider_reference)<=160),
  check((status='SUBMITTED' and reviewed_by is null and reviewed_at is null) or
        (status<>'SUBMITTED' and reviewed_by is not null and reviewed_at is not null))
);
create index finance_reconciliation_queue_idx on public.finance_reconciliations(status,submitted_at);
create index finance_reconciliation_region_period_idx on public.finance_reconciliations(region_id,period_start,period_end);
alter table public.finance_reconciliations enable row level security;
revoke all on public.finance_reconciliations from anon,authenticated;
create trigger audit_finance_reconciliations after insert or update or delete on public.finance_reconciliations
  for each row execute function public.audit_sensitive_write();

create or replace function private.has_global_general_finance()
returns boolean language sql stable security definer set search_path=''
as $$
  select auth.uid() is not null and auth.jwt()->>'aal'='aal2'
    and exists(select 1 from public.user_profiles p where p.user_id=auth.uid() and p.account_status='ACTIVE')
    and exists(select 1 from public.user_roles ur join public.administrative_assignments a on a.user_id=ur.user_id and a.role_key=ur.role_key
      join public.roles r on r.role_key=ur.role_key and r.active
      where ur.user_id=auth.uid() and ur.role_key='SUPER_FINANCE' and ur.active and a.active
      and a.scope_level='GLOBAL' and (a.expires_at is null or a.expires_at>now()))
$$;
revoke all on function private.has_global_general_finance() from public,anon;
grant execute on function private.has_global_general_finance() to authenticated;

create or replace function public.submit_finance_reconciliation(
  p_region_id uuid,p_period_start date,p_period_end date,p_provider_reported_total_kes numeric,
  p_unmatched_count integer,p_duplicate_count integer,p_provider_reference text,p_notes text
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); recorded_total numeric(16,2); report_id uuid;
begin
  if actor is null or coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'MFA session required' using errcode='42501'; end if;
  if not exists(select 1 from public.user_profiles where user_id=actor and account_status='ACTIVE') then raise exception 'active account required' using errcode='42501'; end if;
  if not exists(select 1 from public.user_roles ur join public.administrative_assignments a on a.user_id=ur.user_id and a.role_key=ur.role_key
    join public.regions r on r.id=a.region_id and r.active
    where ur.user_id=actor and ur.role_key='REGIONAL_FINANCE' and ur.active and a.active and a.scope_level='REGION'
      and a.region_id=p_region_id and (a.expires_at is null or a.expires_at>now())) then
    raise exception 'Regional Finance assignment required for the selected region' using errcode='42501'; end if;
  if p_period_start is null or p_period_end is null or p_period_end<p_period_start then raise exception 'valid reporting period required' using errcode='22023'; end if;
  if p_provider_reported_total_kes is not null and p_provider_reported_total_kes<0 then raise exception 'reported total cannot be negative' using errcode='22023'; end if;
  if p_unmatched_count is null or p_unmatched_count<0 or p_duplicate_count is null or p_duplicate_count<0 then raise exception 'reconciliation counts cannot be negative' using errcode='22023'; end if;
  if length(trim(coalesce(p_notes,''))) not between 10 and 2000 or length(coalesce(p_provider_reference,''))>160 then raise exception 'enter valid reconciliation notes and reference' using errcode='22023'; end if;
  select coalesce(sum(pay.amount_kes),0) into recorded_total
  from public.payments pay join public.members m on m.user_id=pay.user_id
    join public.counties c on c.id=m.county_id
  where pay.status='VERIFIED' and c.region_id=p_region_id and pay.created_at::date between p_period_start and p_period_end;
  insert into public.finance_reconciliations(region_id,period_start,period_end,verified_recorded_total_kes,
    provider_reported_total_kes,unmatched_count,duplicate_count,provider_reference,notes,submitted_by)
  values(p_region_id,p_period_start,p_period_end,recorded_total,p_provider_reported_total_kes,p_unmatched_count,
    p_duplicate_count,nullif(trim(coalesce(p_provider_reference,'')),''),trim(p_notes),actor) returning id into report_id;
  insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
    values(actor,'finance.reconciliation.submitted','finance_reconciliations',report_id::text,
      jsonb_build_object('region_id',p_region_id,'period_start',p_period_start,'period_end',p_period_end,
        'verified_recorded_total_kes',recorded_total,'provider_reported_total_kes',p_provider_reported_total_kes,
        'unmatched_count',p_unmatched_count,'duplicate_count',p_duplicate_count));
  return report_id;
end $$;
revoke all on function public.submit_finance_reconciliation(uuid,date,date,numeric,integer,integer,text,text) from public,anon;
grant execute on function public.submit_finance_reconciliation(uuid,date,date,numeric,integer,integer,text,text) to authenticated;

create or replace function public.get_my_finance_reconciliations(p_region_id uuid)
returns table(report_id uuid,period_start date,period_end date,verified_recorded_total_kes numeric,
  provider_reported_total_kes numeric,unmatched_count integer,duplicate_count integer,provider_reference text,
  notes text,status text,submitted_at timestamptz,review_note text)
language plpgsql stable security definer set search_path=''
as $$ begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'MFA session required' using errcode='42501'; end if;
  if not exists(select 1 from public.user_profiles where user_id=auth.uid() and account_status='ACTIVE') then raise exception 'active account required' using errcode='42501'; end if;
  if not exists(select 1 from public.user_roles ur join public.administrative_assignments a on a.user_id=ur.user_id and a.role_key=ur.role_key
    where ur.user_id=auth.uid() and ur.role_key='REGIONAL_FINANCE' and ur.active and a.active and a.region_id=p_region_id
      and a.scope_level='REGION' and (a.expires_at is null or a.expires_at>now())) then raise exception 'Regional Finance scope required' using errcode='42501'; end if;
  return query select f.id,f.period_start,f.period_end,f.verified_recorded_total_kes,f.provider_reported_total_kes,
    f.unmatched_count,f.duplicate_count,f.provider_reference,f.notes,f.status,f.submitted_at,f.review_note
  from public.finance_reconciliations f where f.region_id=p_region_id order by f.submitted_at desc limit 100;
end $$;
revoke all on function public.get_my_finance_reconciliations(uuid) from public,anon;
grant execute on function public.get_my_finance_reconciliations(uuid) to authenticated;

create or replace function public.get_finance_reconciliation_queue()
returns table(report_id uuid,region_id uuid,region_name text,period_start date,period_end date,
  verified_recorded_total_kes numeric,provider_reported_total_kes numeric,unmatched_count integer,
  duplicate_count integer,provider_reference text,notes text,status text,submitted_by uuid,
  submitted_email text,submitted_at timestamptz)
language plpgsql security definer set search_path=''
as $$ begin
  if not private.has_global_general_finance() then raise exception 'General Finance MFA session required' using errcode='42501'; end if;
  return query select f.id,f.region_id,r.name,f.period_start,f.period_end,f.verified_recorded_total_kes,
    f.provider_reported_total_kes,f.unmatched_count,f.duplicate_count,f.provider_reference,f.notes,f.status,
    f.submitted_by,lower(u.email),f.submitted_at
  from public.finance_reconciliations f join public.regions r on r.id=f.region_id
    join auth.users u on u.id=f.submitted_by
  order by f.submitted_at desc limit 250;
end $$;
revoke all on function public.get_finance_reconciliation_queue() from public,anon;
grant execute on function public.get_finance_reconciliation_queue() to authenticated;

create or replace function public.get_my_member_financial_activity()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); member_key uuid; payment_rows jsonb; contribution_rows jsonb;
  savings_rows jsonb; share_rows jsonb; welfare_rows jsonb;
begin
  if actor is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.user_profiles where user_id=actor and account_status='ACTIVE') then
    raise exception 'active account required' using errcode='42501'; end if;
  select id into member_key from public.members where user_id=actor;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'purpose',p.purpose,'amount_kes',p.amount_kes,
    'currency',p.currency,'status',p.status,'created_at',p.created_at) order by p.created_at desc),'[]'::jsonb)
  into payment_rows from (select id,purpose,amount_kes,currency,status,created_at from public.payments
    where user_id=actor order by created_at desc limit 100) p;
  if member_key is null then
    contribution_rows:='[]'::jsonb;savings_rows:='[]'::jsonb;share_rows:='[]'::jsonb;welfare_rows:='[]'::jsonb;
  else
    select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'month',c.contribution_month,'amount_kes',c.amount_kes,'status',c.status,'created_at',c.created_at) order by c.contribution_month desc),'[]'::jsonb)
      into contribution_rows from (select id,contribution_month,amount_kes,status,created_at from public.member_contributions where member_id=member_key order by contribution_month desc limit 100) c;
    select coalesce(jsonb_agg(jsonb_build_object('account_reference',a.account_reference,'status',a.status,'updated_at',a.updated_at,
      'transactions',coalesce(t.items,'[]'::jsonb)) order by a.created_at desc),'[]'::jsonb)
      into savings_rows from public.member_savings a left join lateral (
        select jsonb_agg(jsonb_build_object('id',x.id,'type',x.transaction_type,'amount_kes',x.amount_kes,'created_at',x.created_at) order by x.created_at desc) items
        from (select id,transaction_type,amount_kes,created_at from public.savings_transactions where savings_account_id=a.id order by created_at desc limit 100) x
      ) t on true where a.member_id=member_key;
    select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'amount_kes',s.amount_kes,'status',s.status,'created_at',s.created_at) order by s.created_at desc),'[]'::jsonb)
      into share_rows from public.share_capital s where s.member_id=member_key;
    select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'fund_type',w.fund_type,'amount_kes',w.amount_kes,'status',w.status,'created_at',w.created_at) order by w.created_at desc),'[]'::jsonb)
      into welfare_rows from public.welfare_funds w where w.member_id=member_key;
  end if;
  return jsonb_build_object('payments',payment_rows,'contributions',contribution_rows,'savings',savings_rows,'share_capital',share_rows,'welfare',welfare_rows);
end $$;
revoke all on function public.get_my_member_financial_activity() from public,anon;
grant execute on function public.get_my_member_financial_activity() to authenticated;

create or replace function public.review_finance_reconciliation(p_report_id uuid,p_decision text,p_note text)
returns void language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); report public.finance_reconciliations%rowtype;
begin
  if not private.has_global_general_finance() then raise exception 'General Finance MFA session required' using errcode='42501'; end if;
  if p_decision not in ('ACCEPTED','CLARIFICATION_REQUIRED','REJECTED') then raise exception 'unsupported reconciliation decision' using errcode='22023'; end if;
  if length(coalesce(p_note,''))>2000 or (p_decision in ('CLARIFICATION_REQUIRED','REJECTED') and length(trim(coalesce(p_note,'')))<5) then
    raise exception 'provide a review note for clarification or rejection' using errcode='22023'; end if;
  select * into report from public.finance_reconciliations where id=p_report_id and status in ('SUBMITTED','CLARIFICATION_REQUIRED') for update;
  if not found then raise exception 'pending reconciliation report not found' using errcode='P0002'; end if;
  if report.submitted_by=actor then raise exception 'submitter cannot review their own reconciliation' using errcode='42501'; end if;
  update public.finance_reconciliations set status=p_decision,reviewed_by=actor,reviewed_at=now(),review_note=nullif(trim(p_note),'') where id=report.id;
  insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
    values(actor,'finance.reconciliation.'||lower(p_decision),'finance_reconciliations',report.id::text,
      jsonb_build_object('region_id',report.region_id,'submitted_by',report.submitted_by,'note',p_note));
end $$;
revoke all on function public.review_finance_reconciliation(uuid,text,text) from public,anon;
grant execute on function public.review_finance_reconciliation(uuid,text,text) to authenticated;

create or replace function public.set_staff_assignment_active(p_user_id uuid,p_role_key text,p_region_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path=''
as $$ declare actor uuid:=auth.uid(); assignment_key uuid;
begin
  if not private.is_global_super_admin() then raise exception 'global super admin MFA session required' using errcode='42501'; end if;
  if not exists(select 1 from public.roles where role_key=p_role_key and privileged) then raise exception 'privileged role required' using errcode='22023'; end if;
  if p_active and p_region_id is not null and not exists(select 1 from public.regions where id=p_region_id and active) then
    raise exception 'cannot activate an assignment in an inactive region' using errcode='23514'; end if;
  if p_role_key='SUPER_ADMIN' and not p_active and exists(select 1 from public.administrative_assignments where user_id=p_user_id and role_key='SUPER_ADMIN' and active and scope_level='GLOBAL') and
    (select count(distinct ur.user_id) from public.user_roles ur join public.administrative_assignments a on a.user_id=ur.user_id and a.role_key=ur.role_key
      where ur.role_key='SUPER_ADMIN' and ur.active and a.active and a.scope_level='GLOBAL')<=1 then
    raise exception 'cannot revoke the last active global super admin assignment' using errcode='23514'; end if;
  update public.administrative_assignments set active=p_active where user_id=p_user_id and role_key=p_role_key
    and region_id is not distinct from p_region_id and active is distinct from p_active returning id into assignment_key;
  if not found then raise exception 'matching staff assignment not found' using errcode='P0002'; end if;
  if p_active then update public.user_roles set active=true,assigned_by=actor,assigned_at=now() where user_id=p_user_id and role_key=p_role_key;
  elsif not exists(select 1 from public.administrative_assignments where user_id=p_user_id and role_key=p_role_key and active) then
    update public.user_roles set active=false where user_id=p_user_id and role_key=p_role_key;
  end if;
  insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
    values(actor,case when p_active then 'staff.assignment.activated' else 'staff.assignment.revoked' end,
      'administrative_assignments',assignment_key::text,jsonb_build_object('user_id',p_user_id,'role',p_role_key,'region_id',p_region_id));
end $$;
revoke all on function public.set_staff_assignment_active(uuid,text,uuid,boolean) from public,anon;
grant execute on function public.set_staff_assignment_active(uuid,text,uuid,boolean) to authenticated;

-- Final membership authority remains unset until cooperative management selects its approved policy.
create or replace function public.get_membership_final_approval_role()
returns text language sql stable security definer set search_path=''
as $$ select setting_value #>> '{}' from public.organization_settings where setting_key='membership_final_approval_role' $$;
revoke all on function public.get_membership_final_approval_role() from public,anon;
grant execute on function public.get_membership_final_approval_role() to authenticated;

create or replace function public.set_membership_final_approval_role(p_role_key text)
returns void language plpgsql security definer set search_path=''
as $$ declare actor uuid:=auth.uid(); old_role text;
begin
  if not private.is_global_super_admin() then raise exception 'global Super Admin MFA session required' using errcode='42501'; end if;
  select setting_value #>> '{}' into old_role from public.organization_settings where setting_key='membership_final_approval_role';
  if p_role_key is null then
    delete from public.organization_settings where setting_key='membership_final_approval_role';
  else
    if not exists(select 1 from public.roles r join public.role_permissions rp on rp.role_key=r.role_key
      where r.role_key=p_role_key and r.active and rp.permission_key='application.review') then
      raise exception 'selected role does not have membership review permission' using errcode='22023'; end if;
    insert into public.organization_settings(setting_key,setting_value,updated_by,updated_at)
      values('membership_final_approval_role',to_jsonb(p_role_key),actor,now())
      on conflict(setting_key) do update set setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=now();
  end if;
  insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
    values(actor,'membership.approval_policy.changed','organization_settings','membership_final_approval_role',jsonb_build_object('from',old_role,'to',p_role_key));
end $$;
revoke all on function public.set_membership_final_approval_role(text) from public,anon;
grant execute on function public.set_membership_final_approval_role(text) to authenticated;

create or replace function public.review_membership_application(p_application_id uuid,p_action text,p_reason text)
returns void language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); app public.membership_applications%rowtype; is_regional_admin boolean;
  is_reviewer boolean; required_role text; member_number text; number_prefix text;
begin
  if actor is null or coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'MFA session required' using errcode='42501'; end if;
  if not exists(select 1 from public.user_profiles where user_id=actor and account_status='ACTIVE') then raise exception 'active account required' using errcode='42501'; end if;
  if length(coalesce(p_reason,''))>500 then raise exception 'review note is too long' using errcode='22023'; end if;
  select exists(select 1 from public.user_roles where user_id=actor and role_key='REGIONAL_ADMIN' and active),
    exists(select 1 from public.user_roles ur join public.role_permissions rp on rp.role_key=ur.role_key and rp.permission_key='application.review'
      where ur.user_id=actor and ur.active) into is_regional_admin,is_reviewer;
  select setting_value #>> '{}' into required_role from public.organization_settings where setting_key='membership_final_approval_role';
  if not is_reviewer then raise exception 'membership reviewer role required' using errcode='42501'; end if;
  select * into app from public.membership_applications where id=p_application_id for update;
  if not found or app.status in ('APPROVED','REJECTED') then raise exception 'open membership application not found' using errcode='P0002'; end if;
  if app.user_id=actor then raise exception 'you cannot review your own membership application' using errcode='42501'; end if;
  if not private.application_access(app.id,'application.review') then raise exception 'application is outside your assigned scope' using errcode='42501'; end if;
  if not exists(select 1 from public.counties c join public.regions r on r.id=c.region_id where c.id=app.county_id and r.active) then
    raise exception 'application region is inactive' using errcode='22023'; end if;
  if is_regional_admin and p_action not in ('UNDER_REVIEW','MORE_INFORMATION_REQUIRED','FORWARDED') and required_role is distinct from 'REGIONAL_ADMIN' then
    raise exception 'regional admins can review or forward applications but cannot make final decisions unless selected in the approved policy' using errcode='42501'; end if;
  if p_action not in ('UNDER_REVIEW','MORE_INFORMATION_REQUIRED','FORWARDED','APPROVED','REJECTED') then raise exception 'unsupported application decision' using errcode='22023'; end if;
  if p_action in ('APPROVED','REJECTED') then
    if required_role is null then raise exception 'cooperative membership final approval role has not been configured' using errcode='55000'; end if;
    if not exists(select 1 from public.user_roles where user_id=actor and role_key=required_role and active) then
      raise exception 'configured final membership approver role required' using errcode='42501'; end if;
  end if;
  if p_action='APPROVED' then
    if app.registration_payment_status<>'VERIFIED' then raise exception 'registration payment must be verified before membership approval' using errcode='23514'; end if;
    select coalesce((setting_value #>> '{}'),'JYG') into number_prefix from public.organization_settings where setting_key='membership_number_prefix';
    member_number:=coalesce(number_prefix,'JYG')||'-'||upper(substr(replace(app.id::text,'-',''),1,12));
    insert into public.members(user_id,application_id,membership_number,category_id,county_id,sub_county_id,status,approved_by,approved_at)
      values(app.user_id,app.id,member_number,app.category_id,app.county_id,app.sub_county_id,'ACTIVE',actor,now());
  end if;
  update public.membership_applications set status=p_action,reviewed_by=actor,reviewed_at=now(),
    decision_reason=nullif(trim(coalesce(p_reason,'')),'') where id=app.id;
  insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
    values(actor,'membership.application.'||lower(p_action),'membership_applications',app.id::text,
      jsonb_build_object('user_id',app.user_id,'reason',p_reason,'previous_status',app.status,'final_approval_role',required_role));
  if p_action in ('APPROVED','REJECTED','MORE_INFORMATION_REQUIRED') then
    insert into public.notifications(user_id,title,body,channel)
    values(app.user_id,'Membership application update',case p_action
      when 'APPROVED' then 'Your membership application has been approved.'
      when 'REJECTED' then coalesce(nullif(trim(p_reason),''),'Your membership application was not approved.')
      else coalesce(nullif(trim(p_reason),''),'More information is needed for your application.') end,'IN_APP');
  end if;
end $$;
revoke all on function public.review_membership_application(uuid,text,text) from public,anon;
grant execute on function public.review_membership_application(uuid,text,text) to authenticated;

create or replace function public.get_membership_review_queue()
returns table(application_id uuid,user_id uuid,full_legal_name text,date_of_birth date,gender text,phone_number text,
  email_address text,county_name text,sub_county_name text,physical_address text,occupation text,next_of_kin_name text,
  next_of_kin_phone text,status text,payment_status text,registration_fee_kes numeric,created_at timestamptz,
  region_id uuid,region_name text)
language plpgsql stable security definer set search_path=''
as $$ begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'MFA session required' using errcode='42501'; end if;
  if not exists(select 1 from public.user_profiles where user_id=auth.uid() and account_status='ACTIVE') then raise exception 'active account required' using errcode='42501'; end if;
  if not exists(select 1 from public.user_roles ur join public.role_permissions rp on rp.role_key=ur.role_key and rp.permission_key='application.read'
    where ur.user_id=auth.uid() and ur.active) then raise exception 'membership application read permission required' using errcode='42501'; end if;
  return query select a.id,a.user_id,a.full_legal_name,a.date_of_birth,a.gender,a.phone_number,a.email_address,
    c.name,sc.name,a.physical_address,a.occupation,a.next_of_kin_name,a.next_of_kin_phone,a.status,
    a.registration_payment_status,a.registration_fee_kes,a.created_at,r.id,r.name
  from public.membership_applications a join public.counties c on c.id=a.county_id
  join public.sub_counties sc on sc.id=a.sub_county_id and sc.county_id=c.id
  join public.regions r on r.id=c.region_id and r.active
  where a.status in ('SUBMITTED','PAYMENT_PENDING','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','FORWARDED')
    and private.application_access(a.id,'application.read')
  order by a.created_at asc limit 250;
end $$;
revoke all on function public.get_membership_review_queue() from public,anon;
grant execute on function public.get_membership_review_queue() to authenticated;

create or replace function public.get_recent_admin_audit(p_limit integer default 100)
returns table(audit_id uuid,actor_email text,action_key text,resource_type text,resource_id text,
  request_id text,details jsonb,created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$ begin
  if not private.is_global_super_admin() then raise exception 'global Super Admin MFA session required' using errcode='42501'; end if;
  if p_limit not between 1 and 200 then raise exception 'limit must be between 1 and 200' using errcode='22023'; end if;
  return query select l.id,lower(u.email),l.action_key,l.resource_type,l.resource_id,l.request_id,l.details,l.created_at
    from public.audit_logs l left join auth.users u on u.id=l.actor_user_id
    order by l.created_at desc limit p_limit;
end $$;
revoke all on function public.get_recent_admin_audit(integer) from public,anon;
grant execute on function public.get_recent_admin_audit(integer) to authenticated;
