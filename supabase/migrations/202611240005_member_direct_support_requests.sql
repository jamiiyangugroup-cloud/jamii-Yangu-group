-- One secure member intake for cash loans and direct bill support requests.
-- Submission records a request only; it never approves or pays a request.

alter table public.loan_applications
  add column if not exists request_category text not null default 'PERSONAL_LOAN',
  add column if not exists payout_method text,
  add column if not exists payout_destination text;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='loan_application_payout_details_check') then
    alter table public.loan_applications add constraint loan_application_payout_details_check check(
      (payout_method is null and payout_destination is null) or
      (payout_method in ('MPESA','BANK') and length(trim(payout_destination)) between 5 and 180)
    );
  end if;
end $$;

create table if not exists public.financial_assistance_details(
  application_id uuid primary key references public.financial_assistance_applications(id) on delete cascade,
  request_category text not null,
  recipient_name text not null,
  recipient_phone text,
  payment_details text not null,
  location text,
  due_date date,
  extra jsonb not null default '{}'::jsonb check(jsonb_typeof(extra)='object'),
  created_at timestamptz not null default now()
);
alter table public.financial_assistance_details enable row level security;
revoke all on public.financial_assistance_details from public,anon,authenticated;
grant select on public.financial_assistance_details to authenticated;
create policy financial_assistance_details_owner_or_reviewer_read
  on public.financial_assistance_details for select to authenticated
  using(exists(
    select 1 from public.financial_assistance_applications a
    where a.id=application_id and
      (private.member_access(a.member_id,'member.assistance.read') or
       private.member_access(a.member_id,'assistance.application.read'))
  ));

create or replace function public.submit_member_support_request(
  p_request_kind text,
  p_support_type text,
  p_arrangement text,
  p_amount_requested_kes numeric,
  p_reason text,
  p_repayment_months integer default null,
  p_income_source text default null,
  p_next_of_kin_name text default null,
  p_next_of_kin_phone text default null,
  p_payout_method text default null,
  p_payout_destination text default null,
  p_recipient_name text default null,
  p_recipient_phone text default null,
  p_payment_details text default null,
  p_location text default null,
  p_due_date date default null,
  p_extra jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  actor uuid:=auth.uid(); member_key uuid; application_key uuid; eligibility jsonb;
  recipient text:=nullif(trim(coalesce(p_recipient_name,'')),''); recipient_phone text:=nullif(trim(coalesce(p_recipient_phone,'')),'');
  payment_details text:=nullif(trim(coalesce(p_payment_details,'')),''); location_text text:=nullif(trim(coalesce(p_location,'')),'');
  reason_text text:=nullif(trim(coalesce(p_reason,'')),''); extra_values jsonb:=coalesce(p_extra,'{}'::jsonb);
  support_kind text:=upper(trim(coalesce(p_support_type,''))); request_kind text:=upper(trim(coalesce(p_request_kind,'')));
begin
  if actor is null then raise exception 'Sign in to submit a support request.' using errcode='42501'; end if;
  if p_amount_requested_kes is null or p_amount_requested_kes<=0 or p_amount_requested_kes>1000000000 or
     reason_text is null or length(reason_text) not between 5 and 1000 or jsonb_typeof(extra_values) is distinct from 'object' then
    raise exception 'Enter a valid amount and explain your request.' using errcode='22023';
  end if;
  select id into member_key from public.members where user_id=actor and status='ACTIVE';
  if member_key is null then raise exception 'An approved active membership is required.' using errcode='42501'; end if;

  if request_kind='LOAN' then
    if not private.has_permission('member.loan.apply') then raise exception 'Loan application access is required.' using errcode='42501'; end if;
    if upper(trim(coalesce(p_arrangement,'')))<>'RECOVERABLE_LOAN' or support_kind not in ('RENT','BASIC_NEEDS','ELECTRICITY','WATER','COOKING_GAS','TRANSPORT','SCHOOL_FEES','MEDICAL','BUSINESS','PERSONAL_LOAN') or
       p_repayment_months is null or p_repayment_months not between 1 and 120 or length(trim(coalesce(p_income_source,''))) not between 2 and 160 or
       length(trim(coalesce(p_next_of_kin_name,''))) not between 2 and 160 or coalesce(p_next_of_kin_phone,'') !~ '^[+]?[0-9 ()-]{9,20}$' or
       p_payout_method not in ('MPESA','BANK') or length(trim(coalesce(p_payout_destination,''))) not between 5 and 180 then
      raise exception 'Complete the loan and payment destination details.' using errcode='22023';
    end if;
    eligibility:=public.get_my_loan_eligibility();
    if coalesce((eligibility->>'eligible')::boolean,false) is not true then
      raise exception 'Loan eligibility requirements are not met: %',coalesce(eligibility->'reasons','[]'::jsonb)::text using errcode='23514';
    end if;
    insert into public.loan_applications(member_id,amount_requested_kes,purpose,repayment_months,income_source,next_of_kin_name,next_of_kin_phone,request_category,payout_method,payout_destination)
    values(member_key,p_amount_requested_kes,support_kind||': '||reason_text,p_repayment_months,trim(p_income_source),trim(p_next_of_kin_name),trim(p_next_of_kin_phone),support_kind,p_payout_method,trim(p_payout_destination))
    returning id into application_key;
    insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
    values(actor,'loan.application.submitted','loan_applications',application_key::text,
      jsonb_build_object('amount_requested_kes',p_amount_requested_kes,'request_category',support_kind,'payout_method',p_payout_method,'repayment_months_requested',p_repayment_months));
    return application_key;
  end if;

  if request_kind<>'ASSISTANCE' or not private.has_permission('member.assistance.apply') then
    raise exception 'Member support application access is required.' using errcode='42501';
  end if;
  if upper(trim(coalesce(p_arrangement,'')))<>'DIRECT_BILL_PAYMENT' or support_kind not in ('RENT','MEDICAL','SCHOOL_FEES','BASIC_NEEDS') then
    raise exception 'Choose a supported direct bill request. Grant programmes are not configured.' using errcode='22023';
  end if;
  if private.assistance_eligible(member_key) is not true then
    raise exception 'The configured support eligibility checks are not met or are unavailable.' using errcode='23514';
  end if;
  if payment_details is null or recipient is null then raise exception 'Provide the recipient and their payment details.' using errcode='22023'; end if;
  if support_kind='RENT' and (recipient_phone is null or location_text is null or p_due_date is null) then
    raise exception 'Provide the landlord phone, property location and rent due date.' using errcode='22023';
  end if;
  if support_kind='MEDICAL' and length(trim(coalesce(extra_values->>'patient_name',''))) not between 2 and 160 then
    raise exception 'Provide the patient name.' using errcode='22023';
  end if;
  if support_kind='SCHOOL_FEES' and (length(trim(coalesce(extra_values->>'student_name',''))) not between 2 and 160 or p_due_date is null) then
    raise exception 'Provide the student name and school fee due date.' using errcode='22023';
  end if;
  if support_kind='BASIC_NEEDS' and coalesce(extra_values->>'service_category','') not in ('FOOD','ELECTRICITY','WATER','COOKING_GAS','TRANSPORT','OTHER_ESSENTIAL') then
    raise exception 'Choose the essential bill or need category.' using errcode='22023';
  end if;

  insert into public.financial_assistance_applications(member_id,assistance_type,arrangement,amount_requested_kes,reason)
  values(member_key,support_kind,'DIRECT_BILL_PAYMENT',p_amount_requested_kes,reason_text)
  returning id into application_key;
  insert into public.financial_assistance_details(application_id,request_category,recipient_name,recipient_phone,payment_details,location,due_date,extra)
  values(application_key,support_kind,recipient,recipient_phone,payment_details,location_text,p_due_date,extra_values);
  if support_kind='RENT' then
    insert into public.rent_assistance(application_id,landlord_name,landlord_phone,property_location,payment_deadline)
    values(application_key,recipient,recipient_phone,location_text,p_due_date);
  elsif support_kind='MEDICAL' then
    insert into public.medical_assistance(application_id,provider_name,patient_name,payment_deadline)
    values(application_key,recipient,extra_values->>'patient_name',p_due_date);
  elsif support_kind='SCHOOL_FEES' then
    insert into public.school_fees_assistance(application_id,student_name,institution_name,admission_number,payment_deadline)
    values(application_key,extra_values->>'student_name',recipient,nullif(trim(coalesce(extra_values->>'admission_number','')),''),p_due_date);
  end if;
  insert into public.audit_logs(actor_user_id,action_key,resource_type,resource_id,details)
  values(actor,'assistance.application.submitted','financial_assistance_applications',application_key::text,
    jsonb_build_object('assistance_type',support_kind,'arrangement','DIRECT_BILL_PAYMENT','amount_requested_kes',p_amount_requested_kes));
  return application_key;
end $$;
revoke all on function public.submit_member_support_request(text,text,text,numeric,text,integer,text,text,text,text,text,text,text,text,text,date,jsonb) from public,anon;
grant execute on function public.submit_member_support_request(text,text,text,numeric,text,integer,text,text,text,text,text,text,text,text,text,date,jsonb) to authenticated;
