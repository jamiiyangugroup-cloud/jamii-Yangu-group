-- Cooperative-provided starting policy. Values remain configurable by Super Admin.
insert into public.organization_settings(setting_key,setting_value)
values
  ('registration_fee_kes','500'::jsonb),
  ('monthly_contribution_kes','300'::jsonb),
  ('loan_minimum_savings_kes','2000'::jsonb),
  ('loan_minimum_membership_months','2'::jsonb)
on conflict(setting_key) do nothing;

alter table public.membership_applications
  alter column registration_fee_kes set default 500;
alter table public.member_contributions
  alter column amount_kes set default 300;

drop policy if exists application_owner_insert on public.membership_applications;
create policy application_owner_insert on public.membership_applications for insert to authenticated
with check (
  user_id=auth.uid()
  and lower(email_address)=lower(auth.jwt()->>'email')
  and status='SUBMITTED'
  and registration_payment_status='UNPAID'
  and exists(select 1 from public.organization_settings s where s.setting_key='registration_fee_kes'
    and case when s.setting_value #>> '{}' ~ '^[0-9]+([.][0-9]{1,2})?$'
      then (s.setting_value #>> '{}')::numeric=registration_fee_kes else false end)
  and terms_accepted and privacy_accepted and consented_at<=now()
  and reviewed_by is null and reviewed_at is null
  and exists(select 1 from public.user_profiles p where p.user_id=auth.uid() and p.account_status='ACTIVE')
);
grant insert(registration_fee_kes) on public.membership_applications to authenticated;

create or replace function public.sync_approved_member_role()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.status='ACTIVE' then
    insert into public.user_roles as existing(user_id,role_key,active,assigned_by)
      values(new.user_id,'MEMBER',true,new.approved_by)
      on conflict(user_id,role_key) do update set
        active=true,
        assigned_by=case when not existing.active then excluded.assigned_by else existing.assigned_by end,
        assigned_at=case when not existing.active then now() else existing.assigned_at end;
  else
    update public.user_roles set active=false where user_id=new.user_id and role_key='MEMBER' and active;
  end if;
  return new;
end $$;
revoke all on function public.sync_approved_member_role() from public,anon,authenticated;
drop trigger if exists sync_approved_member_role on public.members;
create trigger sync_approved_member_role after insert or update on public.members
for each row execute function public.sync_approved_member_role();
insert into public.user_roles(user_id,role_key,active,assigned_by)
  select user_id,'MEMBER',status='ACTIVE',approved_by from public.members
  on conflict(user_id,role_key) do update set active=excluded.active;

alter table public.savings_transactions
  add column reverses_transaction_id uuid references public.savings_transactions(id);
create unique index savings_transaction_reversed_once_idx
  on public.savings_transactions(reverses_transaction_id) where reverses_transaction_id is not null;

create or replace function public.get_membership_application_policy()
returns jsonb language sql stable security definer set search_path=''
as $$
  select jsonb_build_object(
    'registration_fee_kes', case when s.setting_value #>> '{}' ~ '^[0-9]+([.][0-9]{1,2})?$'
      then (s.setting_value #>> '{}')::numeric else null end
  )
  from (select 1) seed
  left join public.organization_settings s on s.setting_key='registration_fee_kes'
$$;
revoke all on function public.get_membership_application_policy() from public;
grant execute on function public.get_membership_application_policy() to anon,authenticated;

create or replace function public.get_cooperative_policy_settings()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare policy_values jsonb;
begin
  if not private.is_global_super_admin() then raise exception 'global Super Admin MFA session required' using errcode='42501'; end if;
  select coalesce(jsonb_object_agg(setting_key,setting_value),'{}'::jsonb) into policy_values
  from public.organization_settings
  where setting_key in ('registration_fee_kes','monthly_contribution_kes','loan_minimum_savings_kes','loan_minimum_membership_months');
  return policy_values;
end $$;
revoke all on function public.get_cooperative_policy_settings() from public,anon;
grant execute on function public.get_cooperative_policy_settings() to authenticated;

create or replace function public.set_cooperative_policy_settings(
  p_registration_fee_kes numeric,
  p_monthly_contribution_kes numeric,
  p_loan_minimum_savings_kes numeric,
  p_loan_minimum_membership_months integer
)
returns void language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); prior jsonb; next_values jsonb;
begin
  if not private.is_global_super_admin() then raise exception 'global Super Admin MFA session required' using errcode='42501'; end if;
  if p_registration_fee_kes is null or p_registration_fee_kes<=0 or p_registration_fee_kes>10000000 or
     p_monthly_contribution_kes is null or p_monthly_contribution_kes<=0 or p_monthly_contribution_kes>10000000 or
     p_loan_minimum_savings_kes is null or p_loan_minimum_savings_kes<0 or p_loan_minimum_savings_kes>1000000000 or
     p_loan_minimum_membership_months is null or p_loan_minimum_membership_months<0 or p_loan_minimum_membership_months>120 then
    raise exception 'enter valid cooperative policy values' using errcode='22023';
  end if;
  select coalesce(jsonb_object_agg(setting_key,setting_value),'{}'::jsonb) into prior
  from public.organization_settings
  where setting_key in ('registration_fee_kes','monthly_contribution_kes','loan_minimum_savings_kes','loan_minimum_membership_months');
  next_values:=jsonb_build_object('registration_fee_kes',p_registration_fee_kes,
    'monthly_contribution_kes',p_monthly_contribution_kes,
    'loan_minimum_savings_kes',p_loan_minimum_savings_kes,
    'loan_minimum_membership_months',p_loan_minimum_membership_months);
  insert into public.organization_settings(setting_key,setting_value,updated_by,updated_at)
  select key,value,actor,now() from jsonb_each(next_values)
  on conflict(setting_key) do update set setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
  values(actor,'organization.policy.changed','organization_settings','cooperative_financial_policy',
    jsonb_build_object('before',prior,'after',next_values));
end $$;
revoke all on function public.set_cooperative_policy_settings(numeric,numeric,numeric,integer) from public,anon;
grant execute on function public.set_cooperative_policy_settings(numeric,numeric,numeric,integer) to authenticated;

alter table public.loan_applications
  add column next_of_kin_name text,
  add column next_of_kin_phone text,
  add constraint loan_application_next_of_kin_check check (
    (next_of_kin_name is null and next_of_kin_phone is null) or
    (next_of_kin_name is not null and next_of_kin_phone is not null and
     length(trim(next_of_kin_name)) between 2 and 160 and next_of_kin_phone ~ '^[+]?[0-9 ()-]{9,20}$')
  );
-- New applications must go through the eligibility RPC, which stores required next-of-kin data.
revoke insert(member_id,amount_requested_kes,purpose,repayment_months,income_source) on public.loan_applications from authenticated;

create or replace function public.get_my_loan_eligibility()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); member_row public.members%rowtype; min_savings numeric; min_months integer;
  savings_balance numeric:=0; membership_months integer:=0; active_loan_count integer:=0;
  has_kin boolean:=false; has_orphan_reversal boolean:=false; reasons text[]:='{}';
begin
  if actor is null or not private.has_permission('member.loan.read') then raise exception 'member loan access required' using errcode='42501'; end if;
  select * into member_row from public.members where user_id=actor;
  select case when setting_value #>> '{}' ~ '^[0-9]+([.][0-9]{1,2})?$' then (setting_value #>> '{}')::numeric end
    into min_savings from public.organization_settings where setting_key='loan_minimum_savings_kes';
  select case when setting_value #>> '{}' ~ '^[0-9]+$' then (setting_value #>> '{}')::integer end
    into min_months from public.organization_settings where setting_key='loan_minimum_membership_months';
  if member_row.id is null then
    reasons:=array_append(reasons,'An approved membership is required.');
  else
    if member_row.status<>'ACTIVE' then reasons:=array_append(reasons,'Your membership must be active.'); end if;
    if min_savings is null or min_months is null then reasons:=array_append(reasons,'Loan eligibility policy is not configured.'); end if;
    select coalesce(sum(case tx.transaction_type
        when 'DEPOSIT' then tx.amount_kes
        when 'WITHDRAWAL' then -tx.amount_kes
        when 'REVERSAL' then case reversed_tx.transaction_type when 'DEPOSIT' then -tx.amount_kes when 'WITHDRAWAL' then tx.amount_kes else 0 end
        else 0 end),0),
      coalesce(bool_or(tx.transaction_type='REVERSAL' and
        (reversed_tx.id is null or reversed_tx.savings_account_id<>account.id or reversed_tx.amount_kes<>tx.amount_kes or reversed_tx.transaction_type='REVERSAL')),false)
      into savings_balance,has_orphan_reversal
    from public.member_savings account
    left join public.savings_transactions tx on tx.savings_account_id=account.id
    left join public.savings_transactions reversed_tx on reversed_tx.id=tx.reverses_transaction_id
    where account.member_id=member_row.id and account.status='ACTIVE';
    if has_orphan_reversal then reasons:=array_append(reasons,'A savings reversal is awaiting reconciliation. Contact member support.'); end if;
    if min_savings is not null and savings_balance<min_savings then reasons:=array_append(reasons,'Your recorded savings are below the current minimum.'); end if;
    membership_months:=greatest(0,(extract(year from age(current_date,member_row.approved_at::date))::integer*12)+extract(month from age(current_date,member_row.approved_at::date))::integer);
    if min_months is not null and membership_months<min_months then reasons:=array_append(reasons,'Your membership has not reached the minimum period.'); end if;
    select count(*)::integer into active_loan_count from public.loans
      where member_id=member_row.id and status in ('APPROVED','DISBURSED','REPAYING','DEFAULTED');
    if active_loan_count>0 then reasons:=array_append(reasons,'An outstanding loan must be cleared before a new loan application.'); end if;
    select exists(select 1 from public.membership_applications a where a.id=member_row.application_id
      and length(trim(a.next_of_kin_name))>=2 and a.next_of_kin_phone ~ '^[+]?[0-9 ()-]{9,20}$') into has_kin;
  end if;
  return jsonb_build_object('eligible',cardinality(reasons)=0,'reasons',to_jsonb(reasons),
    'savings_balance_kes',savings_balance,'minimum_savings_kes',min_savings,
    'membership_months',membership_months,'minimum_membership_months',min_months,
    'active_loan_count',active_loan_count,'next_of_kin_on_file',has_kin);
end $$;
revoke all on function public.get_my_loan_eligibility() from public,anon;
grant execute on function public.get_my_loan_eligibility() to authenticated;

create or replace function public.submit_member_loan_application(
  p_amount_requested_kes numeric,p_purpose text,p_repayment_months integer,
  p_income_source text,p_next_of_kin_name text,p_next_of_kin_phone text
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); member_key uuid; eligibility jsonb; application_key uuid;
begin
  if actor is null or not private.has_permission('member.loan.apply') then raise exception 'member loan application permission required' using errcode='42501'; end if;
  if p_amount_requested_kes is null or p_amount_requested_kes<=0 or p_amount_requested_kes>1000000000 or
     p_repayment_months is null or p_repayment_months<1 or p_repayment_months>120 or
     length(trim(coalesce(p_purpose,''))) not between 5 and 1000 or
     length(trim(coalesce(p_income_source,''))) not between 2 and 160 or
     length(trim(coalesce(p_next_of_kin_name,''))) not between 2 and 160 or
     coalesce(p_next_of_kin_phone,'') !~ '^[+]?[0-9 ()-]{9,20}$' then
    raise exception 'complete the loan form with valid details' using errcode='22023';
  end if;
  select id into member_key from public.members where user_id=actor and status='ACTIVE';
  if member_key is null then raise exception 'active approved membership is required' using errcode='42501'; end if;
  eligibility:=public.get_my_loan_eligibility();
  if coalesce((eligibility->>'eligible')::boolean,false) is not true then
    raise exception 'loan eligibility requirements are not met: %',coalesce(eligibility->'reasons','[]'::jsonb)::text using errcode='23514';
  end if;
  insert into public.loan_applications(member_id,amount_requested_kes,purpose,repayment_months,income_source,next_of_kin_name,next_of_kin_phone)
  values(member_key,p_amount_requested_kes,trim(p_purpose),p_repayment_months,trim(p_income_source),trim(p_next_of_kin_name),trim(p_next_of_kin_phone))
  returning id into application_key;
  insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
  values(actor,'loan.application.submitted','loan_applications',application_key::text,
    jsonb_build_object('amount_requested_kes',p_amount_requested_kes,'repayment_months_requested',p_repayment_months));
  return application_key;
end $$;
revoke all on function public.submit_member_loan_application(numeric,text,integer,text,text,text) from public,anon;
grant execute on function public.submit_member_loan_application(numeric,text,integer,text,text,text) to authenticated;
