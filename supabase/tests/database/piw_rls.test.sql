begin;
select plan(9);

insert into public.regions(id,code,name) values ('10000000-0000-0000-0000-000000000001','TEST','Test region');
insert into public.counties(id,region_id,code,name) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','T1','Test county one'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','T2','Test county two');
insert into public.sub_counties(id,county_id,code,name) values
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','S1','Sub county one'),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','S2','Sub county two');
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('40000000-0000-0000-0000-000000000001','authenticated','authenticated','member1@example.test','',now(),'{}','{}',now(),now()),
 ('40000000-0000-0000-0000-000000000002','authenticated','authenticated','member2@example.test','',now(),'{}','{}',now(),now()),
 ('40000000-0000-0000-0000-000000000003','authenticated','authenticated','admin@example.test','',now(),'{}','{}',now(),now());
insert into public.user_roles(user_id,role_key) values
 ('40000000-0000-0000-0000-000000000001','MEMBER'),('40000000-0000-0000-0000-000000000002','MEMBER'),
 ('40000000-0000-0000-0000-000000000003','COUNTY_ADMIN');
insert into public.administrative_assignments(user_id,role_key,scope_level,county_id,assigned_by) values
 ('40000000-0000-0000-0000-000000000003','COUNTY_ADMIN','COUNTY','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003');
insert into public.membership_applications(id,user_id,full_legal_name,date_of_birth,phone_number,email_address,county_id,sub_county_id,physical_address,occupation,next_of_kin_name,next_of_kin_phone,consented_at) values
 ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Member One','1990-01-01','+254700000001','member1@example.test','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Road','Worker','Kin One','+254711000001',now()),
 ('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','Member Two','1990-01-02','+254700000002','member2@example.test','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','Road','Worker','Kin Two','+254711000002',now());
insert into public.members(id,user_id,application_id,membership_number,county_id,sub_county_id,approved_by,approved_at) values
 ('60000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','JYG-TEST-001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003',now()),
 ('60000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','JYG-TEST-002','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000003',now());
insert into public.private_documents(id,owner_user_id,member_id,bucket_id,object_path,category,mime_type,byte_size)
values ('70000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','member-kyc','40000000-0000-0000-0000-000000000001/id.pdf','NATIONAL_ID_FRONT','application/pdf',100);

select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select is((select count(*)::int from public.members),1,'member sees only own membership');
select is((select count(*)::int from public.members where user_id='40000000-0000-0000-0000-000000000002'),0,'member cannot read another member by id');
select is(public.get_my_member_workspace() #>> '{member,membership_number}','JYG-TEST-001','member workspace is bound to the authenticated member');
reset role;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select is((select count(*)::int from public.private_documents),0,'member cannot read another member KYC metadata');
reset role;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000003',true);
set local role authenticated;
select is((select count(*)::int from public.membership_applications),1,'county administrator sees only applications in assigned county');
select is((select count(*)::int from public.membership_applications where county_id='20000000-0000-0000-0000-000000000002'),0,'county administrator cannot read another county application');
select is((select count(*)::int from public.get_my_staff_portals()),0,'county staff without an MFA-backed regional/global assignment receives no privileged portal');
select throws_ok($$select public.get_staff_portal_summary('super-admin',null)$$,'42501','privileged MFA session required','staff summary requires an aal2 MFA session');
reset role;
select ok(not has_table_privilege('authenticated','public.user_roles','INSERT'),'client cannot assign itself a role');
select * from finish();
rollback;
