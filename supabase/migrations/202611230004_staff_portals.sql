-- Privileged portal access requires an MFA-authenticated Supabase session (aal2).
insert into public.roles(role_key,display_name,privileged) values
 ('SUPER_FINANCE','Super Finance',true),('REGIONAL_FINANCE','Regional Finance',true)
on conflict(role_key) do update set display_name=excluded.display_name,privileged=true;

insert into public.permissions(permission_key,description) values
 ('finance.reports.read','Read financial summary reports within assigned scope'),
 ('membership.dashboard.read','Read membership dashboard counts within assigned scope')
on conflict(permission_key) do nothing;

insert into public.role_permissions(role_key,permission_key) values
 ('SUPER_FINANCE','finance.payment.read'),('SUPER_FINANCE','finance.contribution.read'),
 ('SUPER_FINANCE','finance.savings.read'),('SUPER_FINANCE','finance.share_capital.read'),
 ('SUPER_FINANCE','finance.welfare.read'),('SUPER_FINANCE','finance.reports.read'),
 ('REGIONAL_FINANCE','finance.payment.read'),('REGIONAL_FINANCE','finance.contribution.read'),
 ('REGIONAL_FINANCE','finance.savings.read'),('REGIONAL_FINANCE','finance.share_capital.read'),
 ('REGIONAL_FINANCE','finance.welfare.read'),('REGIONAL_FINANCE','finance.reports.read'),
 ('REGIONAL_ADMIN','membership.dashboard.read'),('SUPER_ADMIN','membership.dashboard.read') on conflict do nothing;

create or replace function public.get_my_staff_portals()
returns table(portal_key text, role_key text, region_id uuid, region_name text)
language sql stable security definer set search_path=''
as $$
  select distinct
    case ur.role_key when 'SUPER_ADMIN' then 'super-admin' when 'SUPER_FINANCE' then 'super-finance'
      when 'REGIONAL_ADMIN' then 'regional-admin' when 'REGIONAL_FINANCE' then 'regional-finance' end,
    ur.role_key, a.region_id, r.name
  from public.user_roles ur
  join public.roles ro on ro.role_key=ur.role_key and ro.active and ro.privileged
  join public.user_profiles up on up.user_id=ur.user_id and up.account_status='ACTIVE'
  join public.administrative_assignments a on a.user_id=ur.user_id and a.role_key=ur.role_key
    and a.active and (a.expires_at is null or a.expires_at>now())
  left join public.regions r on r.id=a.region_id
  where ur.user_id=auth.uid() and ur.active and auth.jwt()->>'aal'='aal2'
    and ((ur.role_key in ('SUPER_ADMIN','SUPER_FINANCE') and a.scope_level='GLOBAL'
      and a.region_id is null and a.county_id is null and a.sub_county_id is null and a.branch_id is null)
      or (ur.role_key in ('REGIONAL_ADMIN','REGIONAL_FINANCE') and a.scope_level='REGION'
      and a.region_id is not null and a.county_id is null and a.sub_county_id is null and a.branch_id is null))
  order by 1,3
$$;
revoke all on function public.get_my_staff_portals() from public,anon;
grant execute on function public.get_my_staff_portals() to authenticated;

create or replace function public.get_staff_portal_summary(p_portal_key text,p_region_id uuid default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare actor uuid := auth.uid(); scoped boolean; region_scope uuid := p_region_id; result jsonb;
begin
  if actor is null or coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'privileged MFA session required' using errcode='42501'; end if;
  if not exists(select 1 from public.user_profiles where user_id=actor and account_status='ACTIVE') then
    raise exception 'active staff account required' using errcode='42501'; end if;
  if p_portal_key='super-admin' then
    if not exists(select 1 from public.user_roles ur join public.roles ro on ro.role_key=ur.role_key and ro.active
      join public.administrative_assignments a on a.user_id=ur.user_id and a.role_key=ur.role_key
      where ur.user_id=actor and ur.role_key='SUPER_ADMIN' and ur.active and a.active and a.scope_level='GLOBAL' and (a.expires_at is null or a.expires_at>now()))
      then raise exception 'portal access denied' using errcode='42501'; end if;
    scoped := false;
  elsif p_portal_key='super-finance' then
    if not exists(select 1 from public.user_roles ur join public.roles ro on ro.role_key=ur.role_key and ro.active
      join public.administrative_assignments a on a.user_id=ur.user_id and a.role_key=ur.role_key
      where ur.user_id=actor and ur.role_key='SUPER_FINANCE' and ur.active and a.active and a.scope_level='GLOBAL' and (a.expires_at is null or a.expires_at>now()))
      then raise exception 'portal access denied' using errcode='42501'; end if;
    scoped := false;
  elsif p_portal_key in ('regional-admin','regional-finance') then
    if region_scope is null or not exists(select 1 from public.user_roles ur join public.roles ro on ro.role_key=ur.role_key and ro.active
      join public.administrative_assignments a on a.user_id=ur.user_id and a.role_key=ur.role_key
      where ur.user_id=actor and ur.active and a.active and a.region_id=region_scope
      and a.scope_level='REGION' and (a.expires_at is null or a.expires_at>now())
      and ur.role_key=case p_portal_key when 'regional-admin' then 'REGIONAL_ADMIN' else 'REGIONAL_FINANCE' end)
      then raise exception 'portal or regional scope access denied' using errcode='42501'; end if;
    scoped := true;
  else raise exception 'unknown portal' using errcode='22023'; end if;

  if p_portal_key in ('super-finance','regional-finance') then
    select jsonb_build_object(
      'active_members', count(distinct m.id) filter(where m.status='ACTIVE'),
      'pending_applications', count(distinct ma.id) filter(where ma.status in ('SUBMITTED','PAYMENT_PENDING','UNDER_REVIEW','MORE_INFORMATION_REQUIRED')),
      'contributions_this_month_kes', coalesce((select sum(mc.amount_kes) from public.member_contributions mc
        join public.members cm on cm.id=mc.member_id join public.counties cc on cc.id=cm.county_id
        where mc.status='VERIFIED' and mc.contribution_month=date_trunc('month',current_date)::date and (not scoped or cc.region_id=region_scope)),0),
      'verified_payments_this_month_kes', coalesce((select sum(p.amount_kes) from public.payments p
        left join public.members pm on pm.user_id=p.user_id left join public.counties pc on pc.id=pm.county_id
        where p.status='VERIFIED' and p.created_at>=date_trunc('month',now()) and (not scoped or pc.region_id=region_scope)),0),
      'pending_loans', (select count(*) from public.loan_applications la join public.members lm on lm.id=la.member_id
        join public.counties lc on lc.id=lm.county_id where la.status in ('SUBMITTED','UNDER_REVIEW') and (not scoped or lc.region_id=region_scope)),
      'pending_assistance', (select count(*) from public.financial_assistance_applications fa join public.members fm on fm.id=fa.member_id
        join public.counties fc on fc.id=fm.county_id where fa.status in ('SUBMITTED','UNDER_REVIEW','MORE_INFORMATION_REQUIRED') and (not scoped or fc.region_id=region_scope))
    ) into result from public.members m join public.counties c on c.id=m.county_id
      left join public.membership_applications ma on ma.user_id=m.user_id where not scoped or c.region_id=region_scope;
  else
    select jsonb_build_object(
      'active_members', (select count(*) from public.members m join public.counties c on c.id=m.county_id where m.status='ACTIVE' and (not scoped or c.region_id=region_scope)),
      'pending_applications', (select count(*) from public.membership_applications a join public.counties c on c.id=a.county_id
        where a.status in ('SUBMITTED','PAYMENT_PENDING','UNDER_REVIEW','MORE_INFORMATION_REQUIRED') and (not scoped or c.region_id=region_scope)),
      'pending_kyc', (select count(*) from public.private_documents d where d.status in ('UPLOADED','UNDER_REVIEW','MORE_INFORMATION_REQUIRED') and
        (not scoped or exists(select 1 from public.members m join public.counties c on c.id=m.county_id where m.id=d.member_id and c.region_id=region_scope)
        or exists(select 1 from public.membership_applications a join public.counties c on c.id=a.county_id where a.id=d.application_id and c.region_id=region_scope))),
      'pending_loans', (select count(*) from public.loan_applications la join public.members m on m.id=la.member_id join public.counties c on c.id=m.county_id
        where la.status in ('SUBMITTED','UNDER_REVIEW') and (not scoped or c.region_id=region_scope)),
      'pending_assistance', (select count(*) from public.financial_assistance_applications fa join public.members m on m.id=fa.member_id join public.counties c on c.id=m.county_id
        where fa.status in ('SUBMITTED','UNDER_REVIEW','MORE_INFORMATION_REQUIRED') and (not scoped or c.region_id=region_scope))
    ) into result;
  end if;
  insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
  values(actor,'portal.summary.read',p_portal_key,coalesce(region_scope::text,'GLOBAL'),
    jsonb_build_object('portal',p_portal_key,'regional_scope',region_scope));
  return result;
end;
$$;
revoke all on function public.get_staff_portal_summary(text,uuid) from public,anon;
grant execute on function public.get_staff_portal_summary(text,uuid) to authenticated;

-- Member PIW summary is always bound to auth.uid(); it accepts no client-supplied member id.
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
    contribution_info := jsonb_build_object('verified_months',0,'verified_total_kes',0,'current_month_paid',false,'assistance_eligible',false);
    loan_count := 0; assistance_count := 0; investment_count := 0;
  end if;
  select coalesce((setting_value #>> '{}')::numeric,100) into monthly_due from public.organization_settings where setting_key='monthly_contribution_kes';
  monthly_due := coalesce(monthly_due,100);
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
