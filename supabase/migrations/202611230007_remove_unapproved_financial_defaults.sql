-- Remove financial values that were introduced as examples without an approved
-- cooperative policy. Existing member and payment records are preserved.
alter table public.membership_applications
  alter column registration_fee_kes drop default,
  alter column registration_fee_kes drop not null,
  drop constraint if exists membership_applications_registration_fee_kes_check,
  add constraint membership_applications_registration_fee_kes_check
    check (registration_fee_kes is null or registration_fee_kes > 0);

alter table public.member_contributions
  alter column amount_kes drop default,
  drop constraint if exists member_contributions_amount_kes_check,
  add constraint member_contributions_amount_kes_check check (amount_kes > 0);

-- The rows were inserted by migration 002 with updated_by=NULL. Keep any value
-- that an authorized administrator subsequently configured.
delete from public.organization_settings
where updated_by is null and (
  (setting_key='registration_fee_kes' and setting_value='300'::jsonb) or
  (setting_key='monthly_contribution_kes' and setting_value='100'::jsonb) or
  (setting_key='assistance_eligibility_consecutive_months' and setting_value='6'::jsonb)
);

drop policy if exists application_owner_insert on public.membership_applications;
create policy application_owner_insert on public.membership_applications for insert to authenticated
with check (
  user_id=auth.uid()
  and lower(email_address)=lower(auth.jwt()->>'email')
  and status='SUBMITTED'
  and registration_payment_status='UNPAID'
  and (registration_fee_kes is null or exists (
    select 1 from public.organization_settings s
    where s.setting_key='registration_fee_kes'
      and s.setting_value #>> '{}' = registration_fee_kes::text
  ))
  and terms_accepted and privacy_accepted and consented_at<=now()
  and reviewed_by is null and reviewed_at is null
  and exists(select 1 from public.user_profiles p where p.user_id=auth.uid() and p.account_status='ACTIVE')
);

create or replace function private.assistance_eligible(p_member uuid)
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare required_months integer;
begin
  select case when s.setting_value #>> '{}' ~ '^[0-9]+$'
    then (s.setting_value #>> '{}')::integer else null end
    into required_months
  from public.organization_settings s
  where s.setting_key='assistance_eligibility_consecutive_months';
  if required_months is null or required_months < 1 or required_months > 120 then
    return null;
  end if;
  return exists(
    select 1 from public.members m
    where m.id=p_member and m.status='ACTIVE'
    and exists(
      select 1 from public.member_contributions first_month
      where first_month.member_id=p_member and first_month.status='VERIFIED'
      and (first_month.contribution_month + ((required_months-1)*interval '1 month'))::date
        <= date_trunc('month',current_date)::date
      and not exists(
        select 1 from generate_series(0,required_months-1) as offsets(month_offset)
        where not exists(
          select 1 from public.member_contributions c
          where c.member_id=p_member and c.status='VERIFIED'
          and c.contribution_month=(first_month.contribution_month + (offsets.month_offset*interval '1 month'))::date
        )
      )
    )
  );
end;
$$;
revoke all on function private.assistance_eligible(uuid) from public,anon;
grant execute on function private.assistance_eligible(uuid) to authenticated;

create or replace function public.get_my_member_workspace()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare actor uuid := auth.uid(); member_key uuid; member_info jsonb; application_info jsonb; contribution_info jsonb;
  loan_count bigint; assistance_count bigint; investment_count bigint; notification_info jsonb; monthly_due numeric;
begin
  if actor is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.user_profiles where user_id=actor and account_status='ACTIVE') then
    raise exception 'active member account required' using errcode='42501'; end if;
  select m.id,jsonb_build_object('id',m.id,'county_id',m.county_id,'membership_number',m.membership_number,'status',m.status,'approved_at',m.approved_at,
      'county',c.name,'branch',b.name,'display_name',coalesce(up.display_name,a.full_legal_name))
    into member_key,member_info
    from public.members m join public.counties c on c.id=m.county_id
    left join public.branches b on b.id=m.branch_id
    left join public.user_profiles up on up.user_id=m.user_id
    left join public.membership_applications a on a.id=m.application_id
    where m.user_id=actor;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'status',a.status,'payment_status',a.registration_payment_status,
      'created_at',a.created_at) order by a.created_at desc),'[]'::jsonb)
    into application_info from public.membership_applications a where a.user_id=actor;
  if member_key is not null then
    select jsonb_build_object('verified_months',count(*) filter(where status='VERIFIED'),
      'verified_total_kes',coalesce(sum(amount_kes) filter(where status='VERIFIED'),0),
      'current_month_paid',coalesce(bool_or(status='VERIFIED' and contribution_month=date_trunc('month',current_date)::date),false),
      'assistance_eligible',private.assistance_eligible(member_key))
      into contribution_info from public.member_contributions where member_id=member_key;
    select count(*) into loan_count from public.loans where member_id=member_key and status in ('DISBURSED','REPAYING');
    select count(*) into assistance_count from public.financial_assistance_applications where member_id=member_key;
    select count(*) into investment_count from public.investment_records where investor_user_id=actor and status in ('ACTIVE','PENDING_APPROVAL');
  else
    contribution_info := jsonb_build_object('verified_months',0,'verified_total_kes',0,'current_month_paid',false,'assistance_eligible',null);
    loan_count := 0; assistance_count := 0; investment_count := 0;
  end if;
  select (setting_value #>> '{}')::numeric into monthly_due
  from public.organization_settings where setting_key='monthly_contribution_kes';
  select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'title',n.title,'body',n.body,'created_at',n.created_at,'read_at',n.read_at)
      order by n.created_at desc),'[]'::jsonb)
    into notification_info from (select id,title,body,created_at,read_at from public.notifications where user_id=actor order by created_at desc limit 8) n;
  return jsonb_build_object('member',member_info,'applications',application_info,'monthly_contribution_due_kes',monthly_due,
    'contributions',contribution_info,'active_loans',loan_count,'assistance_requests',assistance_count,
    'active_investments',investment_count,'notifications',notification_info);
end;
$$;
revoke all on function public.get_my_member_workspace() from public,anon;
grant execute on function public.get_my_member_workspace() to authenticated;
