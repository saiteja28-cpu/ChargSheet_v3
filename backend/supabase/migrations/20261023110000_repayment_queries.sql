-- ChargSheet Stage 2.2: Repayment balances and pending confirmations

-- 1. Get charge sheets with confirmed and pending repayment totals.
create or replace function public.get_my_charge_sheets_with_balances()
returns table (
  id uuid,
  title text,
  original_amount numeric,
  paid_amount numeric,
  pending_amount numeric,
  remaining_amount numeric,
  available_amount numeric,
  status text,
  created_at timestamptz,
  other_person_name text,
  direction text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    cs.id,
    e.title::text,
    cs.original_amount::numeric,
    coalesce(t.paid_amount, 0)::numeric,
    coalesce(t.pending_amount, 0)::numeric,
    greatest(
      cs.original_amount - coalesce(t.paid_amount, 0), 0
    )::numeric,
    greatest(
      cs.original_amount
        - coalesce(t.paid_amount, 0)
        - coalesce(t.pending_amount, 0),
      0
    )::numeric,
    cs.status::text,
    cs.created_at,
    coalesce(other_profile.full_name, 'Unknown user')::text,
    case
      when cs.receiver_id = auth.uid() then 'receivable'
      else 'payable'
    end::text
  from public.charge_sheets cs
  join public.expenses e on e.id = cs.expense_id
  left join public.profiles other_profile
    on other_profile.id = case
      when cs.payer_id = auth.uid() then cs.receiver_id
      else cs.payer_id
    end
  left join lateral (
    select
      coalesce(
        sum(pa.amount) filter (where p.status = 'succeeded'), 0
      ) as paid_amount,
      coalesce(
        sum(pa.amount) filter (
          where p.status = 'pending_verification'
        ), 0
      ) as pending_amount
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    where pa.charge_sheet_id = cs.id
  ) t on true
  where auth.uid() in (cs.payer_id, cs.receiver_id)
  order by cs.created_at desc;
$$;


-- 2. List repayments awaiting confirmation by the receiver.
create or replace function public.get_pending_repayments()
returns table (
  payment_id uuid,
  charge_sheet_id uuid,
  title text,
  amount numeric,
  payer_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    cs.id,
    e.title::text,
    pa.amount::numeric,
    coalesce(payer_profile.full_name, 'Unknown user')::text,
    p.created_at
  from public.payments p
  join public.payment_allocations pa
    on pa.payment_id = p.id
  join public.charge_sheets cs
    on cs.id = pa.charge_sheet_id
  join public.expenses e
    on e.id = cs.expense_id
  left join public.profiles payer_profile
    on payer_profile.id = p.payer_id
  where cs.receiver_id = auth.uid()
    and p.status = 'pending_verification'
  order by p.created_at desc;
$$;


-- Restrict execution to signed-in users.
revoke all on function
  public.get_my_charge_sheets_with_balances()
  from public, anon;

revoke all on function
  public.get_pending_repayments()
  from public, anon;

grant execute on function
  public.get_my_charge_sheets_with_balances()
  to authenticated;

grant execute on function
  public.get_pending_repayments()
  to authenticated;