
-- ChargSheet Stage 2.1: Secure partial repayment workflow

-- Allow repayments reported manually outside the app.
alter table public.payments
  drop constraint if exists payments_payment_method_check;

alter table public.payments
  add constraint payments_payment_method_check
  check (payment_method in ('online', 'qr', 'cash', 'manual'));


-- 1. Payer requests a repayment.
-- Pending requests reserve balance so multiple requests cannot overpay.
create or replace function public.request_repayment(
  p_charge_sheet_id uuid,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_charge public.charge_sheets%rowtype;
  v_reserved numeric(12,2);
  v_payment_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if p_amount is null
     or p_amount <= 0
     or p_amount <> round(p_amount, 2) then
    raise exception 'Enter a valid amount with at most two decimal places.';
  end if;

  -- Lock the charge sheet to serialize competing repayment requests.
  select *
    into v_charge
    from public.charge_sheets
   where id = p_charge_sheet_id
   for update;

  if not found then
    raise exception 'Charge sheet not found.';
  end if;

  if v_charge.payer_id <> v_user_id then
    raise exception 'Only the payer can request repayment.';
  end if;

  if v_charge.status not in ('pending', 'partially_paid') then
    raise exception 'This charge sheet cannot accept repayments.';
  end if;

  -- Count confirmed and pending amounts already allocated.
  select coalesce(sum(pa.amount), 0)
    into v_reserved
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
   where pa.charge_sheet_id = p_charge_sheet_id
     and p.status in ('pending_verification', 'succeeded');

  if p_amount > v_charge.original_amount - v_reserved then
    raise exception 'Amount exceeds the remaining available balance of %.',
      greatest(v_charge.original_amount - v_reserved, 0);
  end if;

  insert into public.payments (
    payer_id, payment_method, amount, status
  )
  values (
    v_user_id, 'manual', p_amount, 'pending_verification'
  )
  returning id into v_payment_id;

  insert into public.payment_allocations (
    payment_id, charge_sheet_id, amount
  )
  values (
    v_payment_id, p_charge_sheet_id, p_amount
  );

  insert into public.payment_status_history (
    payment_id, previous_status, new_status, changed_by, reason
  )
  values (
    v_payment_id, null, 'pending_verification', v_user_id,
    'Repayment reported by payer; awaiting receiver confirmation'
  );

  return v_payment_id;
end;
$$;


-- 2. Receiver confirms the repayment was actually received.
create or replace function public.confirm_repayment(
  p_payment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_charge_sheet_id uuid;
  v_payment public.payments%rowtype;
  v_charge public.charge_sheets%rowtype;
  v_paid numeric(12,2);
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  -- Find the allocation, then lock the charge sheet first.
  select pa.charge_sheet_id
    into v_charge_sheet_id
    from public.payment_allocations pa
   where pa.payment_id = p_payment_id;

  if not found then
    raise exception 'Repayment not found.';
  end if;

  select *
    into v_charge
    from public.charge_sheets
   where id = v_charge_sheet_id
   for update;

  if not found then
    raise exception 'Charge sheet not found.';
  end if;

  if v_charge.receiver_id <> v_user_id then
    raise exception 'Only the receiver can confirm this repayment.';
  end if;

  select *
    into v_payment
    from public.payments
   where id = p_payment_id
   for update;

  if not found then
    raise exception 'Payment not found.';
  end if;

  if v_payment.status <> 'pending_verification' then
    raise exception 'This repayment is no longer awaiting confirmation.';
  end if;

  if v_charge.status not in ('pending', 'partially_paid') then
    raise exception 'This charge sheet cannot be updated.';
  end if;

  update public.payments
     set status = 'succeeded',
         updated_at = now()
   where id = p_payment_id;

  insert into public.payment_status_history (
    payment_id, previous_status, new_status, changed_by, reason
  )
  values (
    p_payment_id, 'pending_verification', 'succeeded', v_user_id,
    'Confirmed by receiver'
  );

  select coalesce(sum(pa.amount), 0)
    into v_paid
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
   where pa.charge_sheet_id = v_charge_sheet_id
     and p.status = 'succeeded';

  update public.charge_sheets
     set status = case
       when v_paid >= original_amount then 'paid'
       when v_paid > 0 then 'partially_paid'
       else 'pending'
     end,
         updated_at = now()
   where id = v_charge_sheet_id;
end;
$$;


-- Only signed-in users may invoke these functions.
revoke all on function public.request_repayment(uuid, numeric)
  from public, anon;

revoke all on function public.confirm_repayment(uuid)
  from public, anon;

grant execute on function public.request_repayment(uuid, numeric)
  to authenticated;

grant execute on function public.confirm_repayment(uuid)
  to authenticated;
