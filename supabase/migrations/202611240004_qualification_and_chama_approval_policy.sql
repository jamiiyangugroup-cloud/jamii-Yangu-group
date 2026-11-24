-- Add configurable, fail-closed qualification and group approval policy.
-- Existing members, groups, balances and transactions are preserved.

insert into public.organization_settings(setting_key,setting_value)
values ('loan_minimum_verified_contribution_months','null'::jsonb)
on conflict(setting_key) do nothing;

alter table public.chamas
  add column if not exists required_withdrawal_approvals integer not null default 2
  check (required_withdrawal_approvals between 1 and 10);

create or replace function public.get_cooperative_policy_settings()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare policy_values jsonb;
begin
  if not private.is_global_super_admin() then raise exception 'global Super Admin MFA session required' using errcode='42501'; end if;
  select coalesce(jsonb_object_agg(setting_key,setting_value),'{}'::jsonb) into policy_values
  from public.organization_settings
  where setting_key in ('registration_fee_kes','monthly_contribution_kes','loan_minimum_savings_kes',
    'loan_minimum_membership_months','loan_minimum_verified_contribution_months');
  return policy_values;
end $$;
revoke all on function public.get_cooperative_policy_settings() from public,anon;
grant execute on function public.get_cooperative_policy_settings() to authenticated;

create or replace function public.set_loan_qualification_policy(p_minimum_verified_contribution_months integer)
returns void language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); prior_value jsonb; next_value jsonb;
begin
  if not private.is_global_super_admin() then raise exception 'global Super Admin MFA session required' using errcode='42501'; end if;
  if p_minimum_verified_contribution_months is null or p_minimum_verified_contribution_months<1 or p_minimum_verified_contribution_months>120 then
    raise exception 'verified contribution qualification must be between 1 and 120 months' using errcode='22023';
  end if;
  select setting_value into prior_value from public.organization_settings where setting_key='loan_minimum_verified_contribution_months';
  next_value:=to_jsonb(p_minimum_verified_contribution_months);
  insert into public.organization_settings(setting_key,setting_value,updated_by,updated_at)
    values('loan_minimum_verified_contribution_months',next_value,actor,now())
    on conflict(setting_key) do update set setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
    values(actor,'organization.loan_qualification.changed','organization_settings','loan_minimum_verified_contribution_months',
      jsonb_build_object('before',prior_value,'after',next_value));
end $$;
revoke all on function public.set_loan_qualification_policy(integer) from public,anon;
grant execute on function public.set_loan_qualification_policy(integer) to authenticated;

create or replace function public.get_my_loan_eligibility()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); member_row public.members%rowtype;
  min_savings numeric; min_months integer; min_contribution_months integer;
  savings_balance numeric:=0; membership_months integer:=0; qualifying_months integer:=0;
  active_loan_count integer:=0; has_kin boolean:=false; has_orphan_reversal boolean:=false;
  contribution_anchor date; first_missing_offset integer; first_eligible_month date; reasons text[]:='{}';
begin
  if actor is null or not private.has_permission('member.loan.read') then raise exception 'member loan access required' using errcode='42501'; end if;
  select * into member_row from public.members where user_id=actor;
  select case when setting_value #>> '{}' ~ '^[0-9]+([.][0-9]{1,2})?$' then (setting_value #>> '{}')::numeric end
    into min_savings from public.organization_settings where setting_key='loan_minimum_savings_kes';
  select case when setting_value #>> '{}' ~ '^[0-9]+$' then (setting_value #>> '{}')::integer end
    into min_months from public.organization_settings where setting_key='loan_minimum_membership_months';
  select case when setting_value #>> '{}' ~ '^[0-9]+$' then (setting_value #>> '{}')::integer end
    into min_contribution_months from public.organization_settings where setting_key='loan_minimum_verified_contribution_months';
  if member_row.id is null then
    reasons:=array_append(reasons,'An approved membership is required.');
  else
    if member_row.status<>'ACTIVE' then reasons:=array_append(reasons,'Your membership must be active.'); end if;
    if min_savings is null or min_months is null or min_contribution_months is null then
      reasons:=array_append(reasons,'Loan qualification policy is not fully configured.');
    end if;
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

    contribution_anchor:=date_trunc('month',current_date)::date;
    if not exists(select 1 from public.member_contributions c where c.member_id=member_row.id
      and c.status='VERIFIED' and c.contribution_month=contribution_anchor) then
      contribution_anchor:=(contribution_anchor-interval '1 month')::date;
    end if;
    first_eligible_month:=date_trunc('month',member_row.approved_at)::date;
    if contribution_anchor<first_eligible_month then
      qualifying_months:=0;
    else
    select coalesce(min(period.offset_month),121) into first_missing_offset
    from generate_series(0,120) as period(offset_month)
    where (contribution_anchor-(period.offset_month*interval '1 month'))::date>=first_eligible_month
      and not exists(select 1 from public.member_contributions c
      where c.member_id=member_row.id and c.status='VERIFIED'
      and c.contribution_month=(contribution_anchor-(period.offset_month*interval '1 month'))::date);
    qualifying_months:=least(first_missing_offset,120);
    end if;
    if min_contribution_months is not null and qualifying_months<min_contribution_months then
      reasons:=array_append(reasons,format('You have completed %s qualifying verified contribution months; %s are required.',qualifying_months,min_contribution_months));
    end if;

    select count(*)::integer into active_loan_count from public.loans
      where member_id=member_row.id and status in ('APPROVED','DISBURSED','REPAYING','DEFAULTED');
    if active_loan_count>0 then reasons:=array_append(reasons,'An outstanding loan must be cleared before a new loan application.'); end if;
    if exists(select 1 from public.loans where member_id=member_row.id and status='PAID') then
      reasons:=array_append(reasons,'Previous loan repayment performance must be reviewed before another application.');
    end if;
    select exists(select 1 from public.membership_applications a where a.id=member_row.application_id
      and length(trim(a.next_of_kin_name))>=2 and a.next_of_kin_phone ~ '^[+]?[0-9 ()-]{9,20}$') into has_kin;
  end if;
  return jsonb_build_object('eligible',cardinality(reasons)=0,'reasons',to_jsonb(reasons),
    'savings_balance_kes',savings_balance,'minimum_savings_kes',min_savings,
    'membership_months',membership_months,'minimum_membership_months',min_months,
    'qualifying_contribution_months',qualifying_months,
    'minimum_verified_contribution_months',min_contribution_months,
    'active_loan_count',active_loan_count,'next_of_kin_on_file',has_kin);
end $$;
revoke all on function public.get_my_loan_eligibility() from public,anon;
grant execute on function public.get_my_loan_eligibility() to authenticated;

create or replace function public.review_chama_withdrawal(p_request uuid,p_approve boolean,p_reason text default null)
returns text language plpgsql security definer set search_path='' as $$
declare v public.chama_withdrawal_requests; v_approvers uuid[]; required_count integer;
begin
  select * into v from public.chama_withdrawal_requests where id=p_request for update;
  if not found or not private.chama_role(v.chama_id,array['OWNER','CHAIRPERSON','TREASURER']) then raise exception 'Authorized chama officer access required.' using errcode='42501'; end if;
  if v.status<>'PENDING' or v.requested_by=auth.uid() then raise exception 'A different officer must review this pending request.'; end if;
  if auth.uid()=any(v.approved_by) then raise exception 'A different officer must review this request.'; end if;
  select required_withdrawal_approvals into required_count from public.chamas where id=v.chama_id;
  if p_approve then
    v_approvers:=array_append(v.approved_by,auth.uid());
    update public.chama_withdrawal_requests set approved_by=v_approvers,
      status=case when cardinality(v_approvers)>=required_count then 'APPROVED' else 'PENDING' end,
      reviewed_at=now(),decision_reason=nullif(trim(p_reason),'') where id=p_request;
  else
    update public.chama_withdrawal_requests set status='REJECTED',decision_reason=coalesce(nullif(trim(p_reason),''),'Rejected by chama officer.'),reviewed_at=now() where id=p_request;
  end if;
  insert into public.chama_audit_events(chama_id,actor_user_id,action,resource_id,details)
  values(v.chama_id,auth.uid(),case when p_approve then 'WITHDRAWAL_APPROVED' else 'WITHDRAWAL_REJECTED' end,p_request,
    jsonb_build_object('required_approval_count',required_count,'approval_count',case when p_approve then cardinality(v_approvers) else 0 end));
  return case when p_approve and cardinality(v_approvers)>=required_count then 'APPROVED' when p_approve then 'AWAITING_MORE_APPROVALS' else 'REJECTED' end;
end $$;
revoke all on function public.review_chama_withdrawal(uuid,boolean,text) from public,anon;
grant execute on function public.review_chama_withdrawal(uuid,boolean,text) to authenticated;

create or replace function public.set_chama_withdrawal_approval_count(p_chama uuid,p_required_count integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.chama_role(p_chama,array['OWNER']) then raise exception 'Only the chama owner can configure withdrawal approvals.' using errcode='42501'; end if;
  if p_required_count is null or p_required_count<1 or p_required_count>10 then raise exception 'Approval count must be between 1 and 10.' using errcode='22023'; end if;
  update public.chamas set required_withdrawal_approvals=p_required_count where id=p_chama and status='ACTIVE';
  if not found then raise exception 'Active chama not found.' using errcode='P0002'; end if;
  insert into public.chama_audit_events(chama_id,actor_user_id,action,resource_id,details)
    values(p_chama,auth.uid(),'WITHDRAWAL_APPROVAL_POLICY_CHANGED',p_chama,jsonb_build_object('required_approval_count',p_required_count));
end $$;
revoke all on function public.set_chama_withdrawal_approval_count(uuid,integer) from public,anon;
grant execute on function public.set_chama_withdrawal_approval_count(uuid,integer) to authenticated;

create or replace function public.get_my_chamas()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'role',cm.role,'status',cm.status,
    'invite_code',case when cm.role in ('OWNER','CHAIRPERSON','TREASURER') then c.invite_code else null end,
    'contact_phone',c.contact_phone,'county_name',c.county_name,
    'shortcode',ps.mpesa_shortcode,'shortcode_type',ps.mpesa_shortcode_type,
    'account_reference',ps.account_reference,'monthly_contribution_kes',ps.monthly_contribution_kes,
    'collection_method',ps.collection_method,'stk_enabled',ps.stk_enabled,
    'required_withdrawal_approvals',c.required_withdrawal_approvals)
    order by c.name),'[]'::jsonb)
  from public.chama_memberships cm join public.chamas c on c.id=cm.chama_id
  left join public.chama_payment_settings ps on ps.chama_id=c.id
  where cm.user_id=auth.uid() and cm.status='ACTIVE'
$$;
revoke all on function public.get_my_chamas() from public,anon;
grant execute on function public.get_my_chamas() to authenticated;
