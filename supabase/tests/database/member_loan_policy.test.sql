begin;
select plan(7);

insert into public.organization_settings(setting_key,setting_value) values('loan_minimum_verified_contribution_months','3'::jsonb)
on conflict(setting_key) do update set setting_value=excluded.setting_value;

select is((select setting_value #>> '{}' from public.organization_settings where setting_key='registration_fee_kes'),'500','registration fee uses the cooperative-provided starting policy');
select is((select setting_value #>> '{}' from public.organization_settings where setting_key='monthly_contribution_kes'),'300','monthly contribution uses the cooperative-provided starting policy');
select ok(not has_column_privilege('authenticated','public.loan_applications','member_id','INSERT'),'members cannot bypass server-side loan eligibility with a direct insert');

insert into public.regions(id,code,name) values('71000000-0000-0000-0000-000000000001','LOAN_TEST','Loan test region');
insert into public.counties(id,region_id,code,name) values('72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','LOAN_TEST_COUNTY','Loan test county');
insert into public.sub_counties(id,county_id,code,name) values('73000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','LOAN_TEST_SUB','Loan test sub-county');
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('74000000-0000-0000-0000-000000000001','authenticated','authenticated','loan-member@example.test','',now(),'{}','{}',now(),now());
insert into public.user_roles(user_id,role_key,active) values('74000000-0000-0000-0000-000000000001','MEMBER',true);
insert into public.membership_applications(id,user_id,full_legal_name,date_of_birth,phone_number,email_address,county_id,sub_county_id,physical_address,occupation,next_of_kin_name,next_of_kin_phone,registration_fee_kes,terms_accepted,privacy_accepted,consented_at)
values('75000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000001','Loan Test Member','1990-01-01','0712345678','loan-member@example.test','72000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001','Test address','Test work','Next of Kin','0723456789',500,true,true,now());
insert into public.members(id,user_id,application_id,membership_number,county_id,sub_county_id,status,approved_by,approved_at)
values('76000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000001','LOAN-TEST-001','72000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000001','ACTIVE','74000000-0000-0000-0000-000000000001',now()-interval '3 months');
insert into public.payments(id,user_id,purpose,amount_kes,status) values
('79000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000001','MONTHLY_CONTRIBUTION',100,'VERIFIED'),
('79000000-0000-0000-0000-000000000002','74000000-0000-0000-0000-000000000001','MONTHLY_CONTRIBUTION',100,'VERIFIED'),
('79000000-0000-0000-0000-000000000003','74000000-0000-0000-0000-000000000001','MONTHLY_CONTRIBUTION',100,'VERIFIED');
insert into public.member_contributions(id,member_id,payment_id,contribution_month,amount_kes,status) values
('79100000-0000-0000-0000-000000000001','76000000-0000-0000-0000-000000000001','79000000-0000-0000-0000-000000000001',(date_trunc('month',current_date)-interval '2 months')::date,100,'VERIFIED'),
('79100000-0000-0000-0000-000000000002','76000000-0000-0000-0000-000000000001','79000000-0000-0000-0000-000000000002',(date_trunc('month',current_date)-interval '1 month')::date,100,'VERIFIED'),
('79100000-0000-0000-0000-000000000003','76000000-0000-0000-0000-000000000001','79000000-0000-0000-0000-000000000003',date_trunc('month',current_date)::date,100,'VERIFIED');
insert into public.member_savings(id,member_id,account_reference,status)
values('77000000-0000-0000-0000-000000000001','76000000-0000-0000-0000-000000000001','LOAN-TEST-SAVINGS','ACTIVE');
insert into public.savings_transactions(id,savings_account_id,transaction_type,amount_kes)
values('78000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000001','DEPOSIT',2000);

select set_config('request.jwt.claim.sub','74000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"74000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1","email":"loan-member@example.test"}',true);
set local role authenticated;
select is((public.get_my_loan_eligibility()->>'eligible')::boolean,true,'member meeting tenure and savings thresholds passes server eligibility');
select lives_ok($$select public.submit_member_loan_application(1000,'Emergency home repair',6,'Salary','Loan Contact','0723456789')$$,'eligible member can submit a loan request with next-of-kin details');
select is((select count(*)::integer from public.loan_applications where member_id='76000000-0000-0000-0000-000000000001' and next_of_kin_name='Loan Contact'),1,'loan application stores the supplied next-of-kin details');
reset role;

insert into public.savings_transactions(id,savings_account_id,transaction_type,amount_kes)
values('78000000-0000-0000-0000-000000000002','77000000-0000-0000-0000-000000000001','WITHDRAWAL',1);
select set_config('request.jwt.claim.sub','74000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"74000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1","email":"loan-member@example.test"}',true);
set local role authenticated;
select is((public.get_my_loan_eligibility()->>'eligible')::boolean,false,'member below the configured savings minimum is ineligible');
reset role;
select * from finish();
rollback;
