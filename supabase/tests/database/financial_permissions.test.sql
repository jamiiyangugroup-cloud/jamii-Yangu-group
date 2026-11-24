begin;
select plan(9);

select ok((
  select count(*)=10 and bool_and(c.relrowsecurity)
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in (
    'payments','payment_transactions','member_contributions','member_savings',
    'savings_transactions','loans','loan_repayments','financial_assistance_applications',
    'journal_entries','journal_lines'
  )
), 'all member money and ledger tables enforce row-level security');

select ok(not has_table_privilege('authenticated','public.payments','INSERT'), 'clients cannot create verified payment rows directly');
select ok(not has_table_privilege('authenticated','public.payments','UPDATE'), 'clients cannot change payment verification status directly');
select ok(not has_table_privilege('authenticated','public.member_contributions','INSERT'), 'clients cannot create contribution rows directly');
select ok(not has_table_privilege('authenticated','public.savings_transactions','INSERT'), 'clients cannot create savings ledger rows directly');
select ok(not has_table_privilege('authenticated','public.loan_repayments','INSERT'), 'clients cannot fabricate repayment rows directly');
select ok(not has_table_privilege('authenticated','public.journal_entries','INSERT'), 'clients cannot post journal entries directly');

select ok(exists(
  select 1 from pg_constraint
  where conrelid='public.member_contributions'::regclass and contype='u'
    and pg_get_constraintdef(oid) ilike '%member_id, contribution_month%'
), 'a member can have no more than one contribution per month');
select ok(exists(
  select 1 from pg_constraint
  where conrelid='public.payment_transactions'::regclass and contype='u'
    and pg_get_constraintdef(oid) ilike '%idempotency_key%'
), 'provider callback idempotency keys are unique');

select * from finish();
rollback;
