revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
grant usage on schema public to anon, authenticated;

create or replace function private.has_permission(p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(
  select 1 from public.user_roles ur
  join public.roles r on r.role_key=ur.role_key and r.active
  join public.role_permissions rp on rp.role_key=ur.role_key and rp.permission_key=p_permission
  where ur.user_id=auth.uid() and ur.active
    and (not r.privileged or auth.jwt()->>'aal'='aal2')
) $$;

create or replace function private.can_access_scope(p_region uuid,p_county uuid,p_sub_county uuid,p_branch uuid,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$ select private.has_permission(p_permission) and exists(
  select 1 from public.administrative_assignments a
  join public.user_roles ur on ur.user_id=a.user_id and ur.role_key=a.role_key and ur.active
  join public.roles r on r.role_key=a.role_key and r.active
  where a.user_id=auth.uid() and a.active and (a.expires_at is null or a.expires_at>now())
  and ((a.scope_level='GLOBAL') or (a.scope_level='REGION' and a.region_id=p_region)
    or (a.scope_level='COUNTY' and a.county_id=p_county)
    or (a.scope_level='SUB_COUNTY' and a.sub_county_id=p_sub_county)
    or (a.scope_level='BRANCH' and a.branch_id=p_branch))
) $$;

create or replace function private.member_access(p_member uuid,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(
  select 1 from public.members m join public.counties c on c.id=m.county_id
  where m.id=p_member and (
    (m.user_id=auth.uid() and private.has_permission(p_permission)) or
    private.can_access_scope(c.region_id,m.county_id,m.sub_county_id,m.branch_id,p_permission)
  )
) $$;

create or replace function private.application_access(p_application uuid,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(
  select 1 from public.membership_applications a join public.counties c on c.id=a.county_id
  where a.id=p_application and (a.user_id=auth.uid() or
    private.can_access_scope(c.region_id,a.county_id,a.sub_county_id,null,p_permission))
) $$;

create or replace function private.document_access(p_document uuid,p_permission text)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(
  select 1 from public.private_documents d
  where d.id=p_document and (
    d.owner_user_id=auth.uid() or
    (d.member_id is not null and private.member_access(d.member_id,p_permission)) or
    (d.application_id is not null and private.application_access(d.application_id,p_permission))
  )
) $$;

create or replace function private.assistance_eligible(p_member uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(
  select 1 from public.members m where m.id=p_member and m.status='ACTIVE'
  and exists(
    select 1 from public.member_contributions first_month
    where first_month.member_id=p_member and first_month.status='VERIFIED'
    and (first_month.contribution_month + interval '5 months')::date <= date_trunc('month',current_date)::date
    and not exists(
      select 1 from generate_series(0,5) as offsets(month_offset)
      where not exists(
        select 1 from public.member_contributions c
        where c.member_id=p_member and c.status='VERIFIED'
        and c.contribution_month=(first_month.contribution_month + (month_offset*interval '1 month'))::date
      )
    )
  )
) $$;

revoke all on function private.has_permission(text) from public, anon;
revoke all on function private.can_access_scope(uuid,uuid,uuid,uuid,text) from public, anon;
revoke all on function private.member_access(uuid,text) from public, anon;
revoke all on function private.application_access(uuid,text) from public, anon;
revoke all on function private.document_access(uuid,text) from public, anon;
revoke all on function private.assistance_eligible(uuid) from public, anon;
grant execute on function private.has_permission(text) to authenticated;
grant execute on function private.can_access_scope(uuid,uuid,uuid,uuid,text) to authenticated;
grant execute on function private.member_access(uuid,text) to authenticated;
grant execute on function private.application_access(uuid,text) to authenticated;
grant execute on function private.document_access(uuid,text) to authenticated;
grant execute on function private.assistance_eligible(uuid) to authenticated;
revoke all on function public.set_updated_at() from public,anon,authenticated;
revoke all on function public.handle_new_auth_user() from public,anon,authenticated;
revoke all on function public.handle_auth_user_updated() from public,anon,authenticated;
revoke all on function public.prevent_audit_log_mutation() from public,anon,authenticated;
revoke all on function public.audit_sensitive_write() from public,anon,authenticated;

do $$ declare t text; begin
  foreach t in array array['regions','counties','sub_counties','branches','departments','membership_categories','user_profiles','roles','permissions','role_permissions','user_roles','administrative_assignments','membership_applications','members','employee_profiles','payments','payment_transactions','member_contributions','member_savings','savings_transactions','share_capital','welfare_funds','loan_applications','loans','loan_repayments','financial_assistance_applications','rent_assistance','school_fees_assistance','medical_assistance','business_profiles','business_financing_applications','investment_projects','investment_records','private_documents','document_verification','notifications','complaints','approval_workflows','approval_steps','approval_records','audit_logs','ledger_accounts','journal_entries','journal_lines','organization_settings'] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;

grant select on public.regions,public.counties,public.sub_counties,public.branches,public.membership_categories to anon,authenticated;
create policy active_regions_read on public.regions for select to anon,authenticated using(active);
create policy active_counties_read on public.counties for select to anon,authenticated using(active);
create policy active_sub_counties_read on public.sub_counties for select to anon,authenticated using(active);
create policy active_branches_read on public.branches for select to anon,authenticated using(active);
create policy active_categories_read on public.membership_categories for select to anon,authenticated using(active);

grant select on public.user_profiles to authenticated;
grant update(display_name,phone_number) on public.user_profiles to authenticated;
create policy profile_self_read on public.user_profiles for select to authenticated using(user_id=auth.uid());
create policy profile_self_update on public.user_profiles for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

grant select on public.membership_applications to authenticated;
grant insert(user_id,full_legal_name,date_of_birth,gender,phone_number,email_address,county_id,sub_county_id,physical_address,occupation,next_of_kin_name,next_of_kin_phone,category_id,terms_accepted,privacy_accepted,consented_at) on public.membership_applications to authenticated;
create policy application_owner_read on public.membership_applications for select to authenticated using(user_id=auth.uid() or private.application_access(id,'application.read'));
create policy application_owner_insert on public.membership_applications for insert to authenticated with check(user_id=auth.uid() and lower(email_address)=lower(auth.jwt()->>'email') and status='SUBMITTED' and registration_payment_status='UNPAID' and registration_fee_kes=300 and terms_accepted and privacy_accepted and consented_at<=now() and reviewed_by is null and reviewed_at is null and exists(select 1 from public.user_profiles p where p.user_id=auth.uid() and p.account_status='ACTIVE'));

grant select on public.members to authenticated;
create policy member_self_or_scoped_read on public.members for select to authenticated using(user_id=auth.uid() or private.member_access(id,'member.self.read'));
grant select on public.employee_profiles to authenticated;
create policy employee_self_or_scoped_read on public.employee_profiles for select to authenticated using(user_id=auth.uid() or private.can_access_scope(null,county_id,null,branch_id,'staff.read'));

grant select on public.payments to authenticated;
create policy payments_owner_or_finance_read on public.payments for select to authenticated using(user_id=auth.uid() or (private.has_permission('finance.payment.read') and exists(select 1 from public.members m where m.user_id=payments.user_id and private.member_access(m.id,'finance.payment.read'))));
grant select on public.member_contributions to authenticated;
create policy contributions_member_or_finance_read on public.member_contributions for select to authenticated using(private.member_access(member_id,'member.contribution.read') or private.member_access(member_id,'finance.contribution.read'));
grant select on public.member_savings,public.savings_transactions,public.share_capital,public.welfare_funds to authenticated;
create policy savings_member_or_staff_read on public.member_savings for select to authenticated using(private.member_access(member_id,'member.savings.read') or private.member_access(member_id,'finance.savings.read'));
create policy savings_txn_member_or_staff_read on public.savings_transactions for select to authenticated using(exists(select 1 from public.member_savings s where s.id=savings_account_id and (private.member_access(s.member_id,'member.savings.read') or private.member_access(s.member_id,'finance.savings.read'))));
create policy shares_member_or_staff_read on public.share_capital for select to authenticated using(private.member_access(member_id,'member.self.read') or private.member_access(member_id,'finance.share_capital.read'));
create policy welfare_member_or_staff_read on public.welfare_funds for select to authenticated using(private.member_access(member_id,'member.self.read') or private.member_access(member_id,'finance.welfare.read'));

grant select on public.loan_applications to authenticated;
grant insert(member_id,amount_requested_kes,purpose,repayment_months,income_source) on public.loan_applications to authenticated;
create policy loan_apps_read on public.loan_applications for select to authenticated using(private.member_access(member_id,'member.loan.read') or private.member_access(member_id,'credit.application.read'));
create policy loan_apps_owner_create on public.loan_applications for insert to authenticated with check(status='SUBMITTED' and private.member_access(member_id,'member.loan.apply'));
grant select on public.loans,public.loan_repayments to authenticated;
create policy loans_read on public.loans for select to authenticated using(private.member_access(member_id,'member.loan.read') or private.member_access(member_id,'credit.application.read'));
create policy loan_repayments_read on public.loan_repayments for select to authenticated using(exists(select 1 from public.loans l where l.id=loan_id and (private.member_access(l.member_id,'member.loan.read') or private.member_access(l.member_id,'credit.application.read'))));

grant select on public.financial_assistance_applications to authenticated;
grant insert(member_id,assistance_type,arrangement,amount_requested_kes,reason) on public.financial_assistance_applications to authenticated;
create policy assistance_read on public.financial_assistance_applications for select to authenticated using(private.member_access(member_id,'member.assistance.read') or private.member_access(member_id,'assistance.application.read'));
create policy assistance_owner_create on public.financial_assistance_applications for insert to authenticated with check(status='SUBMITTED' and private.member_access(member_id,'member.assistance.apply') and private.assistance_eligible(member_id));
grant select,insert on public.rent_assistance,public.school_fees_assistance,public.medical_assistance,public.business_financing_applications to authenticated;
create policy rent_owner_read_insert on public.rent_assistance for all to authenticated using(exists(select 1 from public.financial_assistance_applications a where a.id=application_id and private.member_access(a.member_id,'member.assistance.read'))) with check(exists(select 1 from public.financial_assistance_applications a where a.id=application_id and a.status='SUBMITTED' and private.member_access(a.member_id,'member.assistance.apply')));
create policy school_owner_read_insert on public.school_fees_assistance for all to authenticated using(exists(select 1 from public.financial_assistance_applications a where a.id=application_id and private.member_access(a.member_id,'member.assistance.read'))) with check(exists(select 1 from public.financial_assistance_applications a where a.id=application_id and a.status='SUBMITTED' and private.member_access(a.member_id,'member.assistance.apply')));
create policy medical_owner_read_insert on public.medical_assistance for all to authenticated using(exists(select 1 from public.financial_assistance_applications a where a.id=application_id and private.member_access(a.member_id,'member.assistance.read'))) with check(exists(select 1 from public.financial_assistance_applications a where a.id=application_id and a.status='SUBMITTED' and private.member_access(a.member_id,'member.assistance.apply')));
create policy business_owner_read_insert on public.business_financing_applications for all to authenticated using(exists(select 1 from public.financial_assistance_applications a where a.id=application_id and private.member_access(a.member_id,'member.assistance.read'))) with check(exists(select 1 from public.financial_assistance_applications a where a.id=application_id and a.status='SUBMITTED' and private.member_access(a.member_id,'member.assistance.apply')));

grant select on public.investment_projects to anon,authenticated;
create policy public_approved_investments on public.investment_projects for select to anon,authenticated using(status in ('APPROVED','OPEN','CLOSED','COMPLETED'));
grant select on public.investment_records to authenticated;
grant insert(project_id,investor_user_id,amount_kes) on public.investment_records to authenticated;
create policy investment_owner_read_create on public.investment_records for all to authenticated using(investor_user_id=auth.uid() or private.has_permission('investment.manage')) with check(investor_user_id=auth.uid() and status='INTERESTED');

grant select on public.private_documents to authenticated;
create policy documents_owner_or_reviewer_read on public.private_documents for select to authenticated using(private.document_access(id,'kyc.read'));

grant select,update(read_at) on public.notifications to authenticated;
create policy notifications_owner_read on public.notifications for select to authenticated using(user_id=auth.uid());
create policy notifications_owner_update on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant select on public.complaints to authenticated;
grant insert(user_id,subject,description) on public.complaints to authenticated;
create policy complaints_owner_or_support_read on public.complaints for select to authenticated using(user_id=auth.uid() or private.has_permission('support.manage'));
create policy complaints_owner_create on public.complaints for insert to authenticated with check(user_id=auth.uid() and status='OPEN');
grant select on public.audit_logs to authenticated;
create policy audit_read_global on public.audit_logs for select to authenticated using(private.has_permission('audit.read') and private.can_access_scope(null,null,null,null,'audit.read'));

-- Tables without explicit grants/policies remain inaccessible to client roles.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('member-kyc','member-kyc',false,10485760,array['application/pdf','image/jpeg','image/png']),
 ('identity-documents','identity-documents',false,10485760,array['application/pdf','image/jpeg','image/png']),
 ('membership-documents','membership-documents',false,10485760,array['application/pdf','image/jpeg','image/png']),
 ('loan-documents','loan-documents',false,10485760,array['application/pdf','image/jpeg','image/png']),
 ('rent-documents','rent-documents',false,10485760,array['application/pdf','image/jpeg','image/png']),
 ('school-fees-documents','school-fees-documents',false,10485760,array['application/pdf','image/jpeg','image/png']),
 ('medical-documents','medical-documents',false,10485760,array['application/pdf','image/jpeg','image/png']),
 ('business-documents','business-documents',false,10485760,array['application/pdf','image/jpeg','image/png']),
 ('employee-documents','employee-documents',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- No user INSERT/SELECT/DELETE policy: uploads are content-sniffed by the Edge Function,
-- and downloads are only issued through its audited, 60-second signed URL.
