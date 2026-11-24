-- Central staff provisioning and region governance. Privileged actions require MFA.

create table public.staff_access_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  requested_role text not null check (requested_role in ('REGIONAL_ADMIN','MEMBERSHIP_OFFICER','SUPER_FINANCE','REGIONAL_FINANCE')),
  region_id uuid references public.regions(id),
  reason text not null check (length(trim(reason)) between 10 and 500),
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  decision_note text,
  check ((requested_role in ('SUPER_FINANCE','MEMBERSHIP_OFFICER') and region_id is null) or
         (requested_role in ('REGIONAL_ADMIN','REGIONAL_FINANCE','MEMBERSHIP_OFFICER') and region_id is not null)),
  check ((status='PENDING' and reviewed_by is null and reviewed_at is null) or
         (status<>'PENDING' and reviewed_by is not null and reviewed_at is not null))
);
alter table public.membership_applications drop constraint if exists membership_applications_status_check;
alter table public.membership_applications add constraint membership_applications_status_check check
  (status in ('SUBMITTED','PAYMENT_PENDING','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','FORWARDED','APPROVED','REJECTED'));
create unique index staff_access_one_pending_idx on public.staff_access_requests
  (requester_id,requested_role,coalesce(region_id,'00000000-0000-0000-0000-000000000000'::uuid))
  where status='PENDING';
create index staff_access_queue_idx on public.staff_access_requests(status,requested_at);
alter table public.staff_access_requests enable row level security;
revoke all on public.staff_access_requests from anon,authenticated;
create trigger audit_staff_access_requests after insert or update or delete on public.staff_access_requests
  for each row execute function public.audit_sensitive_write();

create or replace function private.is_global_super_admin()
returns boolean language sql stable security definer set search_path=''
as $$
  select auth.uid() is not null and auth.jwt()->>'aal'='aal2'
    and exists(select 1 from public.user_profiles p where p.user_id=auth.uid() and p.account_status='ACTIVE')
    and exists(select 1 from public.user_roles ur join public.roles r on r.role_key=ur.role_key and r.active
      join public.administrative_assignments a on a.user_id=ur.user_id and a.role_key=ur.role_key
      where ur.user_id=auth.uid() and ur.role_key='SUPER_ADMIN' and ur.active and a.active
        and a.scope_level='GLOBAL' and a.region_id is null and a.county_id is null
        and a.sub_county_id is null and a.branch_id is null and (a.expires_at is null or a.expires_at>now()))
$$;
revoke all on function private.is_global_super_admin() from public,anon;
grant execute on function private.is_global_super_admin() to authenticated;

create or replace function public.request_staff_access(p_role_key text,p_region_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); request_key uuid;
begin
  if actor is null or coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'MFA session required' using errcode='42501'; end if;
  if not exists(select 1 from public.user_profiles where user_id=actor and account_status='ACTIVE') then
    raise exception 'active verified account required' using errcode='42501'; end if;
  if p_role_key not in ('REGIONAL_ADMIN','MEMBERSHIP_OFFICER','SUPER_FINANCE','REGIONAL_FINANCE') then
    raise exception 'role cannot be requested through this workflow' using errcode='22023'; end if;
  if p_role_key in ('SUPER_FINANCE','REGIONAL_FINANCE') and exists(select 1 from public.user_roles where user_id=actor and active
    and role_key=case p_role_key when 'SUPER_FINANCE' then 'REGIONAL_FINANCE' else 'SUPER_FINANCE' end) then
    raise exception 'General Finance and Regional Finance are separate staff assignments' using errcode='23514'; end if;
  if length(trim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'provide a reason between 10 and 500 characters' using errcode='22023'; end if;
  if (p_role_key='SUPER_FINANCE' and p_region_id is not null) or
     (p_role_key in ('REGIONAL_ADMIN','REGIONAL_FINANCE') and (p_region_id is null or not exists(select 1 from public.regions where id=p_region_id and active))) or
     (p_role_key='MEMBERSHIP_OFFICER' and p_region_id is not null and not exists(select 1 from public.regions where id=p_region_id and active)) then
    raise exception 'select an active region for regional roles' using errcode='22023'; end if;
  if exists(select 1 from public.user_roles ur join public.administrative_assignments a on a.user_id=ur.user_id and a.role_key=ur.role_key
    where ur.user_id=actor and ur.role_key=p_role_key and ur.active and a.active
      and (((p_role_key in ('SUPER_FINANCE','MEMBERSHIP_OFFICER')) and p_region_id is null and a.scope_level='GLOBAL')
        or (p_region_id is not null and a.scope_level='REGION' and a.region_id=p_region_id))) then
    raise exception 'this role is already assigned' using errcode='23505'; end if;
  select id into request_key from public.staff_access_requests where requester_id=actor and requested_role=p_role_key
    and region_id is not distinct from p_region_id and status='PENDING';
  if request_key is not null then return request_key; end if;
  insert into public.staff_access_requests(requester_id,requested_role,region_id,reason)
    values(actor,p_role_key,p_region_id,trim(p_reason)) returning id into request_key;
  insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
    values(actor,'staff.access.requested','staff_access_requests',request_key::text,jsonb_build_object('role',p_role_key,'region_id',p_region_id));
  return request_key;
end $$;
revoke all on function public.request_staff_access(text,uuid,text) from public,anon;
grant execute on function public.request_staff_access(text,uuid,text) to authenticated;

create or replace function public.get_my_staff_access_requests()
returns table(request_id uuid,requested_role text,region_id uuid,region_name text,status text,reason text,requested_at timestamptz,decision_note text)
language sql stable security definer set search_path=''
as $$ select q.id,q.requested_role,q.region_id,r.name,q.status,q.reason,q.requested_at,q.decision_note
  from public.staff_access_requests q left join public.regions r on r.id=q.region_id
  where q.requester_id=auth.uid() order by q.requested_at desc $$;
revoke all on function public.get_my_staff_access_requests() from public,anon;
grant execute on function public.get_my_staff_access_requests() to authenticated;

create or replace function public.get_pending_staff_access_requests()
returns table(request_id uuid,requester_id uuid,email_address text,display_name text,requested_role text,region_id uuid,region_name text,reason text,requested_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$ begin
  if not private.is_global_super_admin() then raise exception 'global super admin MFA session required' using errcode='42501'; end if;
  return query select q.id,q.requester_id,lower(u.email),coalesce(p.display_name,''),q.requested_role,q.region_id,r.name,q.reason,q.requested_at
    from public.staff_access_requests q join auth.users u on u.id=q.requester_id
    left join public.user_profiles p on p.user_id=u.id left join public.regions r on r.id=q.region_id
    where q.status='PENDING' order by q.requested_at;
end $$;
revoke all on function public.get_pending_staff_access_requests() from public,anon;
grant execute on function public.get_pending_staff_access_requests() to authenticated;

create or replace function public.review_staff_access_request(p_request_id uuid,p_approve boolean,p_note text default null)
returns void language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); req public.staff_access_requests%rowtype; scope text;
begin
  if not private.is_global_super_admin() then raise exception 'global super admin MFA session required' using errcode='42501'; end if;
  if length(coalesce(p_note,''))>500 then raise exception 'decision note is too long' using errcode='22023'; end if;
  select * into req from public.staff_access_requests where id=p_request_id and status='PENDING' for update;
  if not found then raise exception 'pending request not found' using errcode='P0002'; end if;
  if req.requester_id=actor then raise exception 'you cannot approve your own staff access request' using errcode='42501'; end if;
  if p_approve then
    if not exists(select 1 from auth.users u join public.user_profiles p on p.user_id=u.id
      where u.id=req.requester_id and u.email_confirmed_at is not null and p.account_status='ACTIVE') then
      raise exception 'requester must have a verified active account' using errcode='42501'; end if;
    if req.region_id is not null and not exists(select 1 from public.regions where id=req.region_id and active) then
      raise exception 'requested region is no longer active' using errcode='22023'; end if;
    if req.requested_role in ('SUPER_FINANCE','REGIONAL_FINANCE') and exists(select 1 from public.user_roles where user_id=req.requester_id and active
      and role_key=case req.requested_role when 'SUPER_FINANCE' then 'REGIONAL_FINANCE' else 'SUPER_FINANCE' end) then
      raise exception 'General Finance and Regional Finance are separate staff assignments' using errcode='23514'; end if;
    scope:=case when req.requested_role in ('SUPER_FINANCE','MEMBERSHIP_OFFICER') and req.region_id is null then 'GLOBAL' else 'REGION' end;
    insert into public.user_roles(user_id,role_key,active,assigned_by)
      values(req.requester_id,req.requested_role,true,actor)
      on conflict(user_id,role_key) do update set active=true,assigned_by=excluded.assigned_by,assigned_at=now();
    if not exists(select 1 from public.administrative_assignments a where a.user_id=req.requester_id and a.role_key=req.requested_role and a.active
      and a.scope_level=scope and a.region_id is not distinct from req.region_id) then
      insert into public.administrative_assignments(user_id,role_key,scope_level,region_id,assigned_by)
        values(req.requester_id,req.requested_role,scope,req.region_id,actor);
    end if;
  end if;
  update public.staff_access_requests set status=case when p_approve then 'APPROVED' else 'REJECTED' end,
    reviewed_by=actor,reviewed_at=now(),decision_note=nullif(trim(coalesce(p_note,'')),'') where id=req.id;
  insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
    values(actor,case when p_approve then 'staff.access.approved' else 'staff.access.rejected' end,
      'staff_access_requests',req.id::text,jsonb_build_object('requester_id',req.requester_id,'role',req.requested_role,'region_id',req.region_id,'note',p_note));
end $$;
revoke all on function public.review_staff_access_request(uuid,boolean,text) from public,anon;
grant execute on function public.review_staff_access_request(uuid,boolean,text) to authenticated;

create or replace function public.get_admin_regions()
returns table(region_id uuid,code text,name text,active boolean,county_count bigint)
language plpgsql stable security definer set search_path=''
as $$ begin
  if not private.is_global_super_admin() then raise exception 'global super admin MFA session required' using errcode='42501'; end if;
  return query select r.id,r.code,r.name,r.active,count(c.id) from public.regions r left join public.counties c on c.region_id=r.id
    group by r.id order by r.name;
end $$;
revoke all on function public.get_admin_regions() from public,anon;
grant execute on function public.get_admin_regions() to authenticated;

create or replace function public.create_region(p_code text,p_name text)
returns uuid language plpgsql security definer set search_path=''
as $$ declare actor uuid:=auth.uid(); region_key uuid;
begin
  if not private.is_global_super_admin() then raise exception 'global super admin MFA session required' using errcode='42501'; end if;
  if length(trim(coalesce(p_code,''))) not between 2 and 16 or p_code !~ '^[A-Za-z0-9_-]+$' or length(trim(coalesce(p_name,''))) not between 2 and 100 then
    raise exception 'enter a valid region code and name' using errcode='22023'; end if;
  insert into public.regions(code,name) values(upper(trim(p_code)),trim(p_name)) returning id into region_key;
  insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
    values(actor,'region.created','regions',region_key::text,jsonb_build_object('code',upper(trim(p_code)),'name',trim(p_name)));
  return region_key;
end $$;
revoke all on function public.create_region(text,text) from public,anon;
grant execute on function public.create_region(text,text) to authenticated;

create or replace function public.set_region_active(p_region_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path=''
as $$ declare actor uuid:=auth.uid(); region_name text;
begin
  if not private.is_global_super_admin() then raise exception 'global super admin MFA session required' using errcode='42501'; end if;
  if not p_active and exists(select 1 from public.administrative_assignments where region_id=p_region_id and active
    and role_key in ('REGIONAL_ADMIN','REGIONAL_FINANCE')) then
    raise exception 'remove active regional staff assignments before deactivating this region' using errcode='23514'; end if;
  update public.regions set active=p_active where id=p_region_id returning name into region_name;
  if not found then raise exception 'region not found' using errcode='P0002'; end if;
  insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
    values(actor,case when p_active then 'region.activated' else 'region.deactivated' end,'regions',p_region_id::text,jsonb_build_object('name',region_name));
end $$;
revoke all on function public.set_region_active(uuid,boolean) from public,anon;
grant execute on function public.set_region_active(uuid,boolean) to authenticated;

create or replace function public.get_super_admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path=''
as $$ declare result jsonb;
begin
  if not private.is_global_super_admin() then raise exception 'global super admin MFA session required' using errcode='42501'; end if;
  select jsonb_build_object(
    'registered_accounts',(select count(*) from auth.users),
    'active_members',(select count(*) from public.members where status='ACTIVE'),
    'pending_applications',(select count(*) from public.membership_applications where status in ('SUBMITTED','PAYMENT_PENDING','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','FORWARDED')),
    'active_regions',(select count(*) from public.regions where active),
    'pending_staff_requests',(select count(*) from public.staff_access_requests where status='PENDING'),
    'open_support_cases',(select count(*) from public.complaints where status in ('OPEN','IN_PROGRESS'))
  ) into result;
  return result;
end $$;
revoke all on function public.get_super_admin_dashboard() from public,anon;
grant execute on function public.get_super_admin_dashboard() to authenticated;

create or replace function public.get_membership_review_queue()
returns table(application_id uuid,user_id uuid,full_legal_name text,date_of_birth date,gender text,phone_number text,
  email_address text,county_name text,sub_county_name text,physical_address text,occupation text,next_of_kin_name text,
  next_of_kin_phone text,status text,payment_status text,registration_fee_kes numeric,created_at timestamptz,
  region_id uuid,region_name text)
language plpgsql stable security definer set search_path=''
as $$ begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'MFA session required' using errcode='42501'; end if;
  if not exists(select 1 from public.user_profiles where user_id=auth.uid() and account_status='ACTIVE') then raise exception 'active account required' using errcode='42501'; end if;
  if not exists(select 1 from public.user_roles where user_id=auth.uid() and role_key in ('REGIONAL_ADMIN','MEMBERSHIP_OFFICER') and active) then
    raise exception 'membership reviewer role required' using errcode='42501'; end if;
  return query select a.id,a.user_id,a.full_legal_name,a.date_of_birth,a.gender,a.phone_number,a.email_address,
    c.name,sc.name,a.physical_address,a.occupation,a.next_of_kin_name,a.next_of_kin_phone,a.status,
    a.registration_payment_status,a.registration_fee_kes,a.created_at,r.id,r.name
  from public.membership_applications a join public.counties c on c.id=a.county_id
  join public.sub_counties sc on sc.id=a.sub_county_id and sc.county_id=c.id
  join public.regions r on r.id=c.region_id
  where a.status in ('SUBMITTED','PAYMENT_PENDING','UNDER_REVIEW','MORE_INFORMATION_REQUIRED','FORWARDED')
    and private.application_access(a.id,'application.read')
  order by a.created_at asc limit 250;
end $$;
revoke all on function public.get_membership_review_queue() from public,anon;
grant execute on function public.get_membership_review_queue() to authenticated;

create or replace function public.review_membership_application(p_application_id uuid,p_action text,p_reason text)
returns void language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid(); app public.membership_applications%rowtype; is_regional_admin boolean;
  is_membership_officer boolean; member_number text; number_prefix text;
begin
  if actor is null or coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'MFA session required' using errcode='42501'; end if;
  if not exists(select 1 from public.user_profiles where user_id=actor and account_status='ACTIVE') then raise exception 'active account required' using errcode='42501'; end if;
  if length(coalesce(p_reason,''))>500 then raise exception 'review note is too long' using errcode='22023'; end if;
  select exists(select 1 from public.user_roles where user_id=actor and role_key='REGIONAL_ADMIN' and active),
         exists(select 1 from public.user_roles where user_id=actor and role_key='MEMBERSHIP_OFFICER' and active)
    into is_regional_admin,is_membership_officer;
  if not (is_regional_admin or is_membership_officer) then raise exception 'membership reviewer role required' using errcode='42501'; end if;
  select * into app from public.membership_applications where id=p_application_id for update;
  if not found or app.status in ('APPROVED','REJECTED') then raise exception 'open membership application not found' using errcode='P0002'; end if;
  if app.user_id=actor then raise exception 'you cannot review your own membership application' using errcode='42501'; end if;
  if not private.application_access(app.id,'application.review') then raise exception 'application is outside your assigned scope' using errcode='42501'; end if;
  if not exists(select 1 from public.counties c join public.regions r on r.id=c.region_id where c.id=app.county_id and r.active) then
    raise exception 'application region is inactive' using errcode='22023'; end if;
  if is_regional_admin and not is_membership_officer and p_action not in ('UNDER_REVIEW','MORE_INFORMATION_REQUIRED','FORWARDED') then
    raise exception 'regional admins can review or forward applications but cannot make final membership decisions' using errcode='42501'; end if;
  if p_action not in ('UNDER_REVIEW','MORE_INFORMATION_REQUIRED','FORWARDED','APPROVED','REJECTED') then raise exception 'unsupported application decision' using errcode='22023'; end if;
  if p_action in ('APPROVED','REJECTED') and not is_membership_officer then raise exception 'membership officer approval required for final decisions' using errcode='42501'; end if;
  if p_action='APPROVED' then
    if app.registration_payment_status<>'VERIFIED' then raise exception 'registration payment must be verified before membership approval' using errcode='23514'; end if;
    select coalesce((setting_value #>> '{}'),'JYG') into number_prefix from public.organization_settings where setting_key='membership_number_prefix';
    member_number:=coalesce(number_prefix,'JYG')||'-'||upper(substr(replace(app.id::text,'-',''),1,12));
    insert into public.members(user_id,application_id,membership_number,category_id,county_id,sub_county_id,status,approved_by,approved_at)
      values(app.user_id,app.id,member_number,app.category_id,app.county_id,app.sub_county_id,'ACTIVE',actor,now());
  end if;
  update public.membership_applications set status=p_action,
    reviewed_by=actor,reviewed_at=now(),decision_reason=nullif(trim(coalesce(p_reason,'')),'') where id=app.id;
  insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
    values(actor,'membership.application.'||lower(p_action),'membership_applications',app.id::text,
      jsonb_build_object('user_id',app.user_id,'reason',p_reason,'previous_status',app.status));
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

create or replace function public.create_county(p_region_id uuid,p_code text,p_name text)
returns uuid language plpgsql security definer set search_path=''
as $$ declare actor uuid:=auth.uid(); county_key uuid;
begin
  if not private.is_global_super_admin() then raise exception 'global super admin MFA session required' using errcode='42501'; end if;
  if not exists(select 1 from public.regions where id=p_region_id and active) then raise exception 'active region required' using errcode='22023'; end if;
  if length(trim(coalesce(p_code,''))) not between 1 and 16 or p_code !~ '^[A-Za-z0-9_-]+$' or length(trim(coalesce(p_name,''))) not between 2 and 100 then
    raise exception 'enter a valid county code and name' using errcode='22023'; end if;
  insert into public.counties(region_id,code,name) values(p_region_id,upper(trim(p_code)),trim(p_name)) returning id into county_key;
  insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
    values(actor,'county.created','counties',county_key::text,jsonb_build_object('region_id',p_region_id,'code',upper(trim(p_code)),'name',trim(p_name)));
  return county_key;
end $$;
revoke all on function public.create_county(uuid,text,text) from public,anon;
grant execute on function public.create_county(uuid,text,text) to authenticated;

create or replace function public.create_sub_county(p_county_id uuid,p_code text,p_name text)
returns uuid language plpgsql security definer set search_path=''
as $$ declare actor uuid:=auth.uid(); sub_county_key uuid;
begin
  if not private.is_global_super_admin() then raise exception 'global super admin MFA session required' using errcode='42501'; end if;
  if not exists(select 1 from public.counties where id=p_county_id and active) then raise exception 'active county required' using errcode='22023'; end if;
  if length(trim(coalesce(p_code,''))) not between 1 and 16 or p_code !~ '^[A-Za-z0-9_-]+$' or length(trim(coalesce(p_name,''))) not between 2 and 100 then
    raise exception 'enter a valid sub-county code and name' using errcode='22023'; end if;
  insert into public.sub_counties(county_id,code,name) values(p_county_id,upper(trim(p_code)),trim(p_name)) returning id into sub_county_key;
  insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
    values(actor,'sub_county.created','sub_counties',sub_county_key::text,jsonb_build_object('county_id',p_county_id,'code',upper(trim(p_code)),'name',trim(p_name)));
  return sub_county_key;
end $$;
revoke all on function public.create_sub_county(uuid,text,text) from public,anon;
grant execute on function public.create_sub_county(uuid,text,text) to authenticated;

create or replace function public.get_admin_location_tree()
returns jsonb language plpgsql stable security definer set search_path=''
as $$ declare result jsonb;
begin
  if not private.is_global_super_admin() then raise exception 'global super admin MFA session required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'code',r.code,'name',r.name,'active',r.active,'counties',coalesce(c.items,'[]'::jsonb)) order by r.name),'[]'::jsonb)
  into result from public.regions r left join lateral (
    select jsonb_agg(jsonb_build_object('id',co.id,'code',co.code,'name',co.name,'active',co.active,'sub_counties',coalesce(sc.items,'[]'::jsonb)) order by co.name) items
    from public.counties co left join lateral (
      select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'name',s.name,'active',s.active) order by s.name) items
      from public.sub_counties s where s.county_id=co.id
    ) sc on true where co.region_id=r.id
  ) c on true;
  return result;
end $$;
revoke all on function public.get_admin_location_tree() from public,anon;
grant execute on function public.get_admin_location_tree() to authenticated;

create or replace function public.get_staff_directory()
returns table(user_id uuid,email_address text,display_name text,account_status text,role_key text,region_id uuid,region_name text,assignment_active boolean)
language plpgsql stable security definer set search_path=''
as $$ begin
  if not private.is_global_super_admin() then raise exception 'global super admin MFA session required' using errcode='42501'; end if;
  return query select distinct u.id,lower(u.email),coalesce(p.display_name,''),p.account_status,ur.role_key,a.region_id,r.name,a.active
    from public.user_roles ur join auth.users u on u.id=ur.user_id
    join public.user_profiles p on p.user_id=u.id
    left join public.administrative_assignments a on a.user_id=ur.user_id and a.role_key=ur.role_key
    left join public.regions r on r.id=a.region_id
    where ur.active or a.active order by lower(u.email),ur.role_key,r.name;
end $$;
revoke all on function public.get_staff_directory() from public,anon;
grant execute on function public.get_staff_directory() to authenticated;

create or replace function public.set_staff_account_status(p_user_id uuid,p_status text)
returns void language plpgsql security definer set search_path=''
as $$ declare actor uuid:=auth.uid(); old_status text;
begin
  if not private.is_global_super_admin() then raise exception 'global super admin MFA session required' using errcode='42501'; end if;
  if p_status not in ('ACTIVE','SUSPENDED') then raise exception 'unsupported staff account status' using errcode='22023'; end if;
  select account_status into old_status from public.user_profiles where user_id=p_user_id for update;
  if not found then raise exception 'user account not found' using errcode='P0002'; end if;
  if not exists(select 1 from public.user_roles ur join public.roles r on r.role_key=ur.role_key
    where ur.user_id=p_user_id and r.privileged and ur.active) then raise exception 'target is not an assigned staff account' using errcode='42501'; end if;
  if p_status='SUSPENDED' and exists(select 1 from public.user_roles where user_id=p_user_id and role_key='SUPER_ADMIN' and active)
     and (select count(distinct ur.user_id) from public.user_roles ur join public.administrative_assignments a on a.user_id=ur.user_id and a.role_key=ur.role_key
       where ur.role_key='SUPER_ADMIN' and ur.active and a.active and a.scope_level='GLOBAL')<=1 then
    raise exception 'cannot suspend the last active global super admin' using errcode='23514'; end if;
  update public.user_profiles set account_status=p_status where user_id=p_user_id;
  insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
    values(actor,'staff.account.status.changed','user_profiles',p_user_id::text,jsonb_build_object('from',old_status,'to',p_status));
end $$;
revoke all on function public.set_staff_account_status(uuid,text) from public,anon;
grant execute on function public.set_staff_account_status(uuid,text) to authenticated;

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

-- A deactivated region is immediately removed from regional portal discovery.
create or replace function public.get_my_staff_portals()
returns table(portal_key text,role_key text,region_id uuid,region_name text)
language sql stable security definer set search_path=''
as $$
  select distinct case ur.role_key when 'SUPER_ADMIN' then 'super-admin' when 'SUPER_FINANCE' then 'super-finance'
      when 'REGIONAL_ADMIN' then 'regional-admin' when 'REGIONAL_FINANCE' then 'regional-finance'
      when 'MEMBERSHIP_OFFICER' then 'membership-review' end,
    ur.role_key,a.region_id,r.name
  from public.user_roles ur join public.roles ro on ro.role_key=ur.role_key and ro.active and ro.privileged
  join public.user_profiles up on up.user_id=ur.user_id and up.account_status='ACTIVE'
  join public.administrative_assignments a on a.user_id=ur.user_id and a.role_key=ur.role_key
    and a.active and (a.expires_at is null or a.expires_at>now())
  left join public.regions r on r.id=a.region_id
  where ur.user_id=auth.uid() and ur.active and auth.jwt()->>'aal'='aal2'
    and ((ur.role_key in ('SUPER_ADMIN','SUPER_FINANCE','MEMBERSHIP_OFFICER') and a.scope_level='GLOBAL'
      and a.region_id is null and a.county_id is null and a.sub_county_id is null and a.branch_id is null)
      or (ur.role_key in ('REGIONAL_ADMIN','REGIONAL_FINANCE','MEMBERSHIP_OFFICER') and a.scope_level='REGION'
      and a.region_id is not null and a.county_id is null and a.sub_county_id is null and a.branch_id is null and r.active))
  order by 1,3
$$;
revoke all on function public.get_my_staff_portals() from public,anon;
grant execute on function public.get_my_staff_portals() to authenticated;

-- Preserve the existing portal summary implementation while adding a database-enforced active-region guard.
alter function public.get_staff_portal_summary(text,uuid) rename to get_staff_portal_summary_before_region_guard;
revoke all on function public.get_staff_portal_summary_before_region_guard(text,uuid) from public,anon,authenticated;
create function public.get_staff_portal_summary(p_portal_key text,p_region_id uuid default null)
returns jsonb language plpgsql security definer set search_path=''
as $$ begin
  if p_portal_key in ('regional-admin','regional-finance') and not exists(
    select 1 from public.regions where id=p_region_id and active
  ) then raise exception 'region is inactive or unavailable' using errcode='42501'; end if;
  return public.get_staff_portal_summary_before_region_guard(p_portal_key,p_region_id);
end $$;
revoke all on function public.get_staff_portal_summary(text,uuid) from public,anon;
grant execute on function public.get_staff_portal_summary(text,uuid) to authenticated;
