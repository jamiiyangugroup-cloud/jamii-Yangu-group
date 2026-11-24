begin;
select plan(13);

insert into public.regions(id,code,name) values
 ('11000000-0000-0000-0000-000000000001','TESTA','Test region A'),
 ('11000000-0000-0000-0000-000000000002','TESTB','Test region B');
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('41000000-0000-0000-0000-000000000001','authenticated','authenticated','staff-requester@example.test','',now(),'{}','{}',now(),now()),
 ('41000000-0000-0000-0000-000000000002','authenticated','authenticated','staff-super@example.test','',now(),'{}','{}',now(),now()),
 ('41000000-0000-0000-0000-000000000003','authenticated','authenticated','staff-regional@example.test','',now(),'{}','{}',now(),now());
insert into public.user_roles(user_id,role_key,active) values
 ('41000000-0000-0000-0000-000000000002','SUPER_ADMIN',true),
 ('41000000-0000-0000-0000-000000000003','REGIONAL_FINANCE',true);
insert into public.administrative_assignments(user_id,role_key,scope_level,region_id,assigned_by) values
 ('41000000-0000-0000-0000-000000000002','SUPER_ADMIN','GLOBAL',null,'41000000-0000-0000-0000-000000000002'),
 ('41000000-0000-0000-0000-000000000003','REGIONAL_FINANCE','REGION','11000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000002');

select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"41000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2","email":"staff-super@example.test"}',true);
set local role authenticated;
select ok(private.is_global_super_admin(),'MFA-backed global Super Admin is recognized');
select ok(public.create_region('TESTC','Test region C') is not null,'Super Admin can create and audit a region');
select ok(not has_table_privilege('authenticated','public.staff_access_requests','INSERT'),'clients cannot insert staff requests directly');
select is((select count(*)::int from public.get_pending_staff_access_requests()),0,'Super Admin can read the pending staff queue');
reset role;

select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2","email":"staff-requester@example.test"}',true);
set local role authenticated;
select is(private.is_global_super_admin(),false,'ordinary account is not a Super Admin');
select throws_ok($$select public.create_region('BAD','Not allowed')$$,'42501','global super admin MFA session required','ordinary account cannot create a region');
select ok(public.request_staff_access('SUPER_FINANCE',null,'Central financial oversight role') is not null,'verified user can request General Finance access');
select is(public.request_staff_access('SUPER_FINANCE',null,'Central financial oversight role'),(select id from public.staff_access_requests where requester_id=auth.uid() and requested_role='SUPER_FINANCE' and status='PENDING'),'duplicate request reuses the pending record');
select throws_ok($$select public.request_staff_access('SUPER_ADMIN',null,'Attempt privilege escalation')$$,'22023','role cannot be requested through this workflow','public request cannot escalate to Super Admin');
reset role;

select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"41000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2","email":"staff-super@example.test"}',true);
set local role authenticated;
select lives_ok($$select public.review_staff_access_request((select id from public.staff_access_requests where requester_id='41000000-0000-0000-0000-000000000001'),true,'Approved for central finance')$$,'Super Admin can approve a staff request');
select is((select count(*)::int from public.user_roles where user_id='41000000-0000-0000-0000-000000000001' and role_key='SUPER_FINANCE' and active),1,'approval activates only the requested finance role');
select is((select count(*)::int from public.administrative_assignments where user_id='41000000-0000-0000-0000-000000000001' and role_key='SUPER_FINANCE' and scope_level='GLOBAL' and active),1,'General Finance assignment is organization-wide');
reset role;

select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"41000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal2","email":"staff-regional@example.test"}',true);
set local role authenticated;
select throws_ok($$select public.get_staff_portal_summary('regional-finance','11000000-0000-0000-0000-000000000002')$$,'42501','portal or regional scope access denied','Regional Finance cannot read another region summary');
reset role;

select * from finish();
rollback;
