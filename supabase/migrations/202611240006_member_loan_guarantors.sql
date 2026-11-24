-- Store optional guarantor contact details with the member's private loan request.
-- The previous request RPC remains available for older clients during rollout.

alter table public.loan_applications
  add column if not exists guarantor_name text,
  add column if not exists guarantor_phone text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.loan_applications'::regclass
      and conname='loan_application_guarantor_details_check'
  ) then
    alter table public.loan_applications
      add constraint loan_application_guarantor_details_check check (
        (guarantor_name is null and guarantor_phone is null) or
        (guarantor_name is not null and guarantor_phone is not null and
         length(trim(guarantor_name)) between 2 and 160 and
         guarantor_phone ~ '^[+]?[0-9 ()-]{9,20}$')
      );
  end if;
end $$;

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
  p_extra jsonb default '{}'::jsonb,
  p_guarantor_name text default null,
  p_guarantor_phone text default null
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  application_key uuid;
  guarantor_name_value text:=nullif(trim(coalesce(p_guarantor_name,'')),'');
  guarantor_phone_value text:=nullif(trim(coalesce(p_guarantor_phone,'')),'');
begin
  if upper(trim(coalesce(p_request_kind,'')))<>'LOAN' and
     (guarantor_name_value is not null or guarantor_phone_value is not null) then
    raise exception 'Guarantor details can only be attached to a loan request.' using errcode='22023';
  end if;
  if (guarantor_name_value is null)<>(guarantor_phone_value is null) or
     (guarantor_name_value is not null and
       (length(guarantor_name_value) not between 2 and 160 or guarantor_phone_value !~ '^[+]?[0-9 ()-]{9,20}$')) then
    raise exception 'Enter both valid guarantor details or leave both blank.' using errcode='22023';
  end if;

  application_key:=public.submit_member_support_request(
    p_request_kind,p_support_type,p_arrangement,p_amount_requested_kes,p_reason,
    p_repayment_months,p_income_source,p_next_of_kin_name,p_next_of_kin_phone,
    p_payout_method,p_payout_destination,p_recipient_name,p_recipient_phone,
    p_payment_details,p_location,p_due_date,p_extra
  );

  if guarantor_name_value is not null then
    update public.loan_applications
      set guarantor_name=guarantor_name_value,guarantor_phone=guarantor_phone_value
      where id=application_key;
  end if;
  return application_key;
end $$;

revoke all on function public.submit_member_support_request(text,text,text,numeric,text,integer,text,text,text,text,text,text,text,text,text,date,jsonb,text,text) from public,anon;
grant execute on function public.submit_member_support_request(text,text,text,numeric,text,integer,text,text,text,text,text,text,text,text,text,date,jsonb,text,text) to authenticated;
