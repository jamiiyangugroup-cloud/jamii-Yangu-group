-- Independent chama workspaces with tenant-scoped members and auditable
-- withdrawal requests. Actual M-Pesa collection/disbursement is intentionally
-- not enabled by storing a Till or Paybill number alone.

create table public.chamas (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 3 and 120),
  registration_number text,
  contact_phone text not null check (contact_phone ~ '^[+]?[0-9 ()-]{9,20}$'),
  county_name text,
  invite_code text not null unique default upper(replace(gen_random_uuid()::text,'-','')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','CLOSED')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registration_number)
);

create table public.chama_memberships (
  chama_id uuid not null references public.chamas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'MEMBER' check (role in ('OWNER','CHAIRPERSON','TREASURER','MEMBER')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','LEFT')),
  joined_at timestamptz not null default now(),
  primary key (chama_id,user_id)
);
create index chama_memberships_user_idx on public.chama_memberships(user_id,status);

create table public.chama_payment_settings (
  chama_id uuid primary key references public.chamas(id) on delete cascade,
  collection_method text not null default 'MANUAL' check (collection_method in ('MANUAL','MPESA_STK')),
  mpesa_shortcode text,
  mpesa_shortcode_type text check (mpesa_shortcode_type in ('PAYBILL','TILL')),
  account_reference text,
  monthly_contribution_kes numeric(12,2) check (monthly_contribution_kes is null or monthly_contribution_kes>0),
  stk_enabled boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  check ((mpesa_shortcode is null and mpesa_shortcode_type is null) or (mpesa_shortcode is not null and mpesa_shortcode_type is not null)),
  check (not stk_enabled or (collection_method='MPESA_STK' and mpesa_shortcode is not null))
);

-- Immutable operational entries. Credits are only posted by a chama manager
-- after reconciling the payment. Debits are posted only by the payout RPC.
create table public.chama_financial_entries (
  id uuid primary key default gen_random_uuid(),
  chama_id uuid not null references public.chamas(id),
  account_type text not null check (account_type in ('MEMBER_SAVINGS','CHAMA_FUNDS')),
  member_user_id uuid references auth.users(id),
  direction text not null check (direction in ('CREDIT','DEBIT')),
  amount_kes numeric(14,2) not null check (amount_kes>0),
  external_reference text not null,
  description text not null check (length(trim(description)) between 3 and 240),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check ((account_type='MEMBER_SAVINGS' and member_user_id is not null) or (account_type='CHAMA_FUNDS' and member_user_id is null)),
  unique(chama_id,external_reference)
);
create index chama_entries_balance_idx on public.chama_financial_entries(chama_id,account_type,member_user_id,created_at);

create table public.chama_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  chama_id uuid not null references public.chamas(id),
  account_type text not null check (account_type in ('MEMBER_SAVINGS','CHAMA_FUNDS')),
  member_user_id uuid references auth.users(id),
  amount_kes numeric(14,2) not null check (amount_kes>0),
  destination_phone text not null check (destination_phone ~ '^254[17][0-9]{8}$'),
  purpose text not null check (length(trim(purpose)) between 5 and 500),
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','PAID')),
  approved_by uuid[] not null default '{}',
  decision_reason text,
  payout_reference text,
  requested_by uuid not null references auth.users(id),
  reviewed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  check ((account_type='MEMBER_SAVINGS' and member_user_id is not null) or (account_type='CHAMA_FUNDS' and member_user_id is null)),
  check ((status='PAID' and payout_reference is not null and paid_at is not null) or status<>'PAID')
);
create index chama_withdrawal_queue_idx on public.chama_withdrawal_requests(chama_id,status,created_at desc);
create unique index chama_payout_reference_unique_idx on public.chama_withdrawal_requests(chama_id,payout_reference) where payout_reference is not null;

create table public.chama_audit_events (
  id uuid primary key default gen_random_uuid(),
  chama_id uuid not null references public.chamas(id),
  actor_user_id uuid not null references auth.users(id),
  action text not null,
  resource_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function private.chama_role(p_chama uuid,p_roles text[] default array['OWNER','CHAIRPERSON','TREASURER'])
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.chama_memberships cm join public.chamas c on c.id=cm.chama_id
    where cm.chama_id=p_chama and cm.user_id=auth.uid() and cm.status='ACTIVE'
      and cm.role=any(p_roles) and c.status='ACTIVE')
$$;
revoke all on function private.chama_role(uuid,text[]) from public,anon;
grant execute on function private.chama_role(uuid,text[]) to authenticated;
create or replace function private.chama_member(p_chama uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.chama_memberships cm join public.chamas c on c.id=cm.chama_id
    where cm.chama_id=p_chama and cm.user_id=auth.uid() and cm.status='ACTIVE' and c.status='ACTIVE')
$$;
revoke all on function private.chama_member(uuid) from public,anon;
grant execute on function private.chama_member(uuid) to authenticated;

create or replace function public.register_chama(p_name text,p_phone text,p_county text default null,p_registration text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_chama public.chamas;
begin
  if auth.uid() is null then raise exception 'Sign in to register a chama.' using errcode='42501'; end if;
  if not exists(select 1 from public.user_profiles p where p.user_id=auth.uid() and p.account_status='ACTIVE') then
    raise exception 'Verify your email and activate your account first.' using errcode='42501'; end if;
  insert into public.chamas(name,contact_phone,county_name,registration_number,created_by)
  values(trim(p_name),trim(p_phone),nullif(trim(p_county),''),nullif(trim(p_registration),''),auth.uid()) returning * into v_chama;
  insert into public.chama_memberships(chama_id,user_id,role) values(v_chama.id,auth.uid(),'OWNER');
  insert into public.chama_payment_settings(chama_id) values(v_chama.id);
  insert into public.chama_audit_events(chama_id,actor_user_id,action,resource_id)
  values(v_chama.id,auth.uid(),'CHAMA_REGISTERED',v_chama.id);
  return jsonb_build_object('id',v_chama.id,'name',v_chama.name,'invite_code',v_chama.invite_code,'role','OWNER');
end $$;
revoke all on function public.register_chama(text,text,text,text) from public,anon;
grant execute on function public.register_chama(text,text,text,text) to authenticated;

create or replace function public.join_chama(p_invite_code text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
  if not exists(select 1 from public.user_profiles p where p.user_id=auth.uid() and p.account_status='ACTIVE') then
    raise exception 'Verify your email and activate your account first.' using errcode='42501'; end if;
  select id into v_id from public.chamas where invite_code=upper(trim(p_invite_code)) and status='ACTIVE';
  if v_id is null then raise exception 'That chama code was not found or is inactive.' using errcode='P0002'; end if;
  insert into public.chama_memberships(chama_id,user_id) values(v_id,auth.uid()) on conflict(chama_id,user_id) do update set status='ACTIVE';
  insert into public.chama_audit_events(chama_id,actor_user_id,action) values(v_id,auth.uid(),'MEMBER_JOINED');
  return v_id;
end $$;
revoke all on function public.join_chama(text) from public,anon;
grant execute on function public.join_chama(text) to authenticated;

create or replace function public.set_chama_member_role(p_chama uuid,p_user uuid,p_role text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.chama_role(p_chama,array['OWNER']) then raise exception 'Only the chama owner can assign officer roles.' using errcode='42501'; end if;
  if p_role not in ('CHAIRPERSON','TREASURER','MEMBER') then raise exception 'Choose Chairperson, Treasurer, or Member.'; end if;
  if p_user=auth.uid() then raise exception 'The owner role cannot be changed here.'; end if;
  update public.chama_memberships set role=p_role where chama_id=p_chama and user_id=p_user and status='ACTIVE';
  if not found then raise exception 'Active chama member not found.' using errcode='P0002'; end if;
  insert into public.chama_audit_events(chama_id,actor_user_id,action,details)
  values(p_chama,auth.uid(),'MEMBER_ROLE_CHANGED',jsonb_build_object('member_user_id',p_user,'role',p_role));
end $$;
revoke all on function public.set_chama_member_role(uuid,uuid,text) from public,anon;
grant execute on function public.set_chama_member_role(uuid,uuid,text) to authenticated;

create or replace function public.get_my_chamas()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'role',cm.role,'status',cm.status,
    'invite_code',case when cm.role in ('OWNER','CHAIRPERSON','TREASURER') then c.invite_code else null end,
    'contact_phone',c.contact_phone,'county_name',c.county_name,
    'shortcode',ps.mpesa_shortcode,'shortcode_type',ps.mpesa_shortcode_type,
    'account_reference',ps.account_reference,'monthly_contribution_kes',ps.monthly_contribution_kes,
    'collection_method',ps.collection_method,'stk_enabled',ps.stk_enabled)
    order by c.name),'[]'::jsonb)
  from public.chama_memberships cm join public.chamas c on c.id=cm.chama_id
  left join public.chama_payment_settings ps on ps.chama_id=c.id
  where cm.user_id=auth.uid() and cm.status='ACTIVE'
$$;
revoke all on function public.get_my_chamas() from public,anon;
grant execute on function public.get_my_chamas() to authenticated;

create or replace function public.get_chama_balances(p_chama uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_funds numeric; v_savings numeric;
begin
  if not private.chama_member(p_chama) then raise exception 'Chama membership required.' using errcode='42501'; end if;
  select coalesce(sum(case when direction='CREDIT' then amount_kes else -amount_kes end),0) into v_savings
    from public.chama_financial_entries where chama_id=p_chama and account_type='MEMBER_SAVINGS' and member_user_id=auth.uid();
  if private.chama_role(p_chama) then
    select coalesce(sum(case when direction='CREDIT' then amount_kes else -amount_kes end),0) into v_funds
      from public.chama_financial_entries where chama_id=p_chama and account_type='CHAMA_FUNDS';
  else v_funds:=null; end if;
  return jsonb_build_object('member_savings',v_savings,'chama_funds',v_funds);
end $$;
revoke all on function public.get_chama_balances(uuid) from public,anon;
grant execute on function public.get_chama_balances(uuid) to authenticated;

create or replace function public.configure_chama_collection(p_chama uuid,p_shortcode text,p_shortcode_type text,p_account_reference text default null,p_monthly_contribution numeric default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.chama_role(p_chama) then raise exception 'Chama treasurer access required.' using errcode='42501'; end if;
  if p_shortcode_type not in ('PAYBILL','TILL') or trim(p_shortcode) !~ '^[0-9]{5,7}$' then raise exception 'Enter a valid M-Pesa Paybill or Till number.'; end if;
  if p_monthly_contribution is not null and p_monthly_contribution<=0 then raise exception 'Contribution must be greater than zero.'; end if;
  update public.chama_payment_settings set collection_method='MANUAL',mpesa_shortcode=trim(p_shortcode),mpesa_shortcode_type=p_shortcode_type,
    account_reference=nullif(trim(p_account_reference),''),monthly_contribution_kes=p_monthly_contribution,stk_enabled=false,updated_by=auth.uid(),updated_at=now()
  where chama_id=p_chama;
  insert into public.chama_audit_events(chama_id,actor_user_id,action,details) values(p_chama,auth.uid(),'COLLECTION_DETAILS_UPDATED',jsonb_build_object('method','MANUAL','shortcode_type',p_shortcode_type));
end $$;
revoke all on function public.configure_chama_collection(uuid,text,text,text,numeric) from public,anon;
grant execute on function public.configure_chama_collection(uuid,text,text,text,numeric) to authenticated;

create or replace function public.record_chama_credit(p_chama uuid,p_account_type text,p_member uuid,p_amount numeric,p_reference text,p_description text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if not private.chama_role(p_chama) then raise exception 'Treasurer access required.' using errcode='42501'; end if;
  if p_account_type not in ('MEMBER_SAVINGS','CHAMA_FUNDS') or p_amount<=0 or trim(p_reference)='' then raise exception 'Invalid deposit details.'; end if;
  if p_account_type='MEMBER_SAVINGS' and not exists(select 1 from public.chama_memberships where chama_id=p_chama and user_id=p_member and status='ACTIVE') then raise exception 'Member does not belong to this chama.'; end if;
  insert into public.chama_financial_entries(chama_id,account_type,member_user_id,direction,amount_kes,external_reference,description,created_by)
  values(p_chama,p_account_type,p_member,'CREDIT',p_amount,trim(p_reference),trim(p_description),auth.uid()) returning id into v_id;
  insert into public.chama_audit_events(chama_id,actor_user_id,action,resource_id,details)
  values(p_chama,auth.uid(),'CREDIT_RECORDED',v_id,jsonb_build_object('account_type',p_account_type,'amount_kes',p_amount,'reference',p_reference));
  return v_id;
end $$;
revoke all on function public.record_chama_credit(uuid,text,uuid,numeric,text,text) from public,anon;
grant execute on function public.record_chama_credit(uuid,text,uuid,numeric,text,text) to authenticated;

create or replace function public.request_chama_withdrawal(p_chama uuid,p_account_type text,p_amount numeric,p_destination_phone text,p_purpose text,p_member uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_balance numeric; v_reserved numeric; v_id uuid;
begin
  if v_user is null then raise exception 'Sign in first.' using errcode='42501'; end if;
  perform 1 from public.chamas where id=p_chama and status='ACTIVE' for update;
  if not found then raise exception 'Active chama not found.' using errcode='P0002'; end if;
  if p_amount<=0 or p_destination_phone !~ '^254[17][0-9]{8}$' or length(trim(p_purpose))<5 then raise exception 'Check the amount, Kenyan mobile number and reason.'; end if;
  if p_account_type='MEMBER_SAVINGS' then
    if p_member is distinct from v_user or not exists(select 1 from public.chama_memberships where chama_id=p_chama and user_id=v_user and status='ACTIVE') then raise exception 'You can only request your own savings from a chama you belong to.' using errcode='42501'; end if;
  elsif p_account_type='CHAMA_FUNDS' then
    if not private.chama_role(p_chama,array['OWNER','CHAIRPERSON','TREASURER']) then raise exception 'Chama officer access required.' using errcode='42501'; end if;
    p_member:=null;
  else raise exception 'Invalid withdrawal source.'; end if;
  select coalesce(sum(case when direction='CREDIT' then amount_kes else -amount_kes end),0) into v_balance
    from public.chama_financial_entries where chama_id=p_chama and account_type=p_account_type and member_user_id is not distinct from p_member;
  select coalesce(sum(amount_kes),0) into v_reserved from public.chama_withdrawal_requests where chama_id=p_chama and account_type=p_account_type
    and member_user_id is not distinct from p_member and status in ('PENDING','APPROVED');
  if p_amount>v_balance-v_reserved then raise exception 'Requested amount exceeds the available reconciled balance.' using errcode='22023'; end if;
  insert into public.chama_withdrawal_requests(chama_id,account_type,member_user_id,amount_kes,destination_phone,purpose,requested_by)
  values(p_chama,p_account_type,p_member,p_amount,p_destination_phone,trim(p_purpose),v_user) returning id into v_id;
  insert into public.chama_audit_events(chama_id,actor_user_id,action,resource_id,details) values(p_chama,v_user,'WITHDRAWAL_REQUESTED',v_id,jsonb_build_object('account_type',p_account_type,'amount_kes',p_amount));
  return v_id;
end $$;
revoke all on function public.request_chama_withdrawal(uuid,text,numeric,text,text,uuid) from public,anon;
grant execute on function public.request_chama_withdrawal(uuid,text,numeric,text,text,uuid) to authenticated;

create or replace function public.review_chama_withdrawal(p_request uuid,p_approve boolean,p_reason text default null)
returns text language plpgsql security definer set search_path='' as $$
declare v public.chama_withdrawal_requests; v_approvers uuid[];
begin
  select * into v from public.chama_withdrawal_requests where id=p_request for update;
  if not found or not private.chama_role(v.chama_id,array['OWNER','CHAIRPERSON','TREASURER']) then raise exception 'Authorized chama officer access required.' using errcode='42501'; end if;
  if v.status<>'PENDING' or v.requested_by=auth.uid() then raise exception 'A different officer must review this pending request.'; end if;
  if auth.uid()=any(v.approved_by) then raise exception 'A second, different officer must review this request.'; end if;
  if p_approve then
    v_approvers:=array_append(v.approved_by,auth.uid());
    update public.chama_withdrawal_requests set approved_by=v_approvers,status=case when cardinality(v_approvers)>=2 then 'APPROVED' else 'PENDING' end,
      reviewed_at=now(),decision_reason=nullif(trim(p_reason),'') where id=p_request;
  else
    update public.chama_withdrawal_requests set status='REJECTED',decision_reason=coalesce(nullif(trim(p_reason),''),'Rejected by chama officer.'),reviewed_at=now() where id=p_request;
  end if;
  insert into public.chama_audit_events(chama_id,actor_user_id,action,resource_id,details)
  values(v.chama_id,auth.uid(),case when p_approve then 'WITHDRAWAL_APPROVED' else 'WITHDRAWAL_REJECTED' end,p_request,jsonb_build_object('two_person_approval_count',case when p_approve then cardinality(v_approvers) else 0 end));
  return case when p_approve and cardinality(v_approvers)>=2 then 'APPROVED' when p_approve then 'AWAITING_SECOND_APPROVAL' else 'REJECTED' end;
end $$;
revoke all on function public.review_chama_withdrawal(uuid,boolean,text) from public,anon;
grant execute on function public.review_chama_withdrawal(uuid,boolean,text) to authenticated;

create or replace function public.mark_chama_withdrawal_paid(p_request uuid,p_payout_reference text)
returns void language plpgsql security definer set search_path='' as $$
declare v public.chama_withdrawal_requests; v_ref text;
begin
  select * into v from public.chama_withdrawal_requests where id=p_request for update;
  if not found or not private.chama_role(v.chama_id,array['OWNER','CHAIRPERSON','TREASURER']) then raise exception 'Authorized chama officer access required.' using errcode='42501'; end if;
  if v.status<>'APPROVED' or auth.uid()=v.requested_by then raise exception 'An approved request must be paid and recorded by an authorized officer other than the requester.'; end if;
  v_ref:=trim(p_payout_reference);
  if length(v_ref)<5 then raise exception 'Enter the verified M-Pesa or bank payout reference.'; end if;
  insert into public.chama_financial_entries(chama_id,account_type,member_user_id,direction,amount_kes,external_reference,description,created_by)
  values(v.chama_id,v.account_type,v.member_user_id,'DEBIT',v.amount_kes,'WITHDRAWAL-'||v.id::text,'Approved withdrawal: '||v.purpose,auth.uid());
  update public.chama_withdrawal_requests set status='PAID',payout_reference=v_ref,paid_at=now() where id=p_request;
  insert into public.chama_audit_events(chama_id,actor_user_id,action,resource_id,details)
  values(v.chama_id,auth.uid(),'WITHDRAWAL_MARKED_PAID',v.id,jsonb_build_object('payout_reference',v_ref,'amount_kes',v.amount_kes));
end $$;
revoke all on function public.mark_chama_withdrawal_paid(uuid,text) from public,anon;
grant execute on function public.mark_chama_withdrawal_paid(uuid,text) to authenticated;

alter table public.chamas enable row level security;
alter table public.chama_memberships enable row level security;
alter table public.chama_payment_settings enable row level security;
alter table public.chama_financial_entries enable row level security;
alter table public.chama_withdrawal_requests enable row level security;
alter table public.chama_audit_events enable row level security;

grant select on public.chamas to authenticated;
create policy chama_members_read on public.chamas for select to authenticated using(private.chama_member(id));
grant select on public.chama_memberships to authenticated;
create policy chama_membership_roster_read on public.chama_memberships for select to authenticated using(user_id=auth.uid() or private.chama_role(chama_id));
grant select on public.chama_payment_settings to authenticated;
create policy chama_settings_members_read on public.chama_payment_settings for select to authenticated using(private.chama_member(chama_id));
grant select on public.chama_financial_entries to authenticated;
create policy chama_entries_scoped_read on public.chama_financial_entries for select to authenticated using(
  (account_type='MEMBER_SAVINGS' and member_user_id=auth.uid()) or private.chama_role(chama_id)
);
grant select on public.chama_withdrawal_requests to authenticated;
create policy chama_withdrawals_scoped_read on public.chama_withdrawal_requests for select to authenticated using(
  requested_by=auth.uid() or member_user_id=auth.uid() or private.chama_role(chama_id)
);
grant select on public.chama_audit_events to authenticated;
create policy chama_audit_officer_read on public.chama_audit_events for select to authenticated using(private.chama_role(chama_id));

-- No direct client writes to financial tables or settings: all mutations go
-- through the checked, audit-logged RPCs above.
revoke insert,update,delete on public.chamas,public.chama_memberships,public.chama_payment_settings,
  public.chama_financial_entries,public.chama_withdrawal_requests,public.chama_audit_events from anon,authenticated;

create trigger set_updated_at_chamas before update on public.chamas for each row execute function public.set_updated_at();
