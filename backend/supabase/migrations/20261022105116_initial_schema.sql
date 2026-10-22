
-- =========================================================
-- ChargSheet: Initial Database Schema (Part 1)
-- Users, roles, groups, expenses, and charge sheets
-- =========================================================

create extension if not exists pgcrypto;

-- 1. User profiles (linked to Supabase Auth)
create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text,
    avatar_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 2. Application roles
create table public.user_roles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('admin', 'member')),
    created_at timestamptz not null default now(),
    unique (user_id, role)
);

-- 3. Groups
create table public.groups (
    id uuid primary key default gen_random_uuid(),
    name text not null check (length(trim(name)) > 0),
    description text,
    created_by uuid not null references auth.users(id),
    created_at timestamptz not null default now()
);

-- 4. Group memberships
create table public.group_members (
    group_id uuid not null references public.groups(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    joined_at timestamptz not null default now(),
    primary key (group_id, user_id)
);

-- 5. Expenses (parent records)
create table public.expenses (
    id uuid primary key default gen_random_uuid(),
    title text not null check (length(trim(title)) > 0),
    description text,
    total_amount numeric(12,2) not null check (total_amount > 0),
    currency char(3) not null default 'INR',
    expense_type text not null
        check (expense_type in ('individual', 'group')),
    group_id uuid references public.groups(id),
    created_by uuid not null references auth.users(id),
    status text not null default 'draft'
        check (status in ('draft', 'submitted', 'cancelled')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (
        (expense_type = 'individual' and group_id is null)
        or
        (expense_type = 'group' and group_id is not null)
    )
);

-- 6. People participating in an expense
create table public.expense_participants (
    expense_id uuid not null references public.expenses(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete restrict,
    included_in_split boolean not null default true,
    created_at timestamptz not null default now(),
    primary key (expense_id, user_id)
);

-- 7. Expense line items (useful for bill scanning later)
create table public.expense_items (
    id uuid primary key default gen_random_uuid(),
    expense_id uuid not null references public.expenses(id) on delete cascade,
    item_name text not null,
    quantity numeric(10,3) not null default 1 check (quantity > 0),
    unit_price numeric(12,2) not null check (unit_price >= 0),
    total_price numeric(12,2) not null check (total_price >= 0),
    created_at timestamptz not null default now()
);

-- 8. Per-person split amounts
create table public.expense_splits (
    id uuid primary key default gen_random_uuid(),
    expense_id uuid not null references public.expenses(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete restrict,
    amount numeric(12,2) not null check (amount >= 0),
    split_type text not null default 'equal'
        check (split_type in ('equal', 'custom')),
    created_at timestamptz not null default now(),
    unique (expense_id, user_id)
);

-- 9. Individual obligations (charge sheets)
create table public.charge_sheets (
    id uuid primary key default gen_random_uuid(),
    expense_id uuid not null references public.expenses(id) on delete restrict,
    payer_id uuid not null references auth.users(id) on delete restrict,
    receiver_id uuid not null references auth.users(id) on delete restrict,
    original_amount numeric(12,2) not null check (original_amount > 0),
    status text not null default 'pending'
        check (status in (
            'pending', 'partially_paid', 'paid',
            'disputed', 'cancelled', 'under_review'
        )),
    due_date date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (payer_id <> receiver_id),
    unique (expense_id, payer_id, receiver_id)
);

-- Helpful indexes
create index idx_group_members_user
    on public.group_members(user_id);

create index idx_expenses_created_by
    on public.expenses(created_by);

create index idx_expenses_group
    on public.expenses(group_id);

create index idx_expense_splits_user
    on public.expense_splits(user_id);

create index idx_charge_sheets_payer
    on public.charge_sheets(payer_id);

create index idx_charge_sheets_receiver
    on public.charge_sheets(receiver_id);

create index idx_charge_sheets_expense
    on public.charge_sheets(expense_id);



-- =========================================================
-- ChargSheet: Initial Database Schema (Part 2)
-- Repayments, payment allocations, cash payments, evidence
-- =========================================================

-- 10. Payments
create table public.payments (
    id uuid primary key default gen_random_uuid(),
    payer_id uuid not null references auth.users(id) on delete restrict,
    payment_method text not null
        check (payment_method in ('online', 'qr', 'cash')),
    amount numeric(12,2) not null check (amount > 0),
    currency char(3) not null default 'INR',
    status text not null default 'initiated'
        check (status in (
            'initiated', 'pending_verification', 'succeeded',
            'failed', 'cancelled', 'refunded'
        )),
    transaction_reference text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 11. Allocate one payment across one or more charge sheets
create table public.payment_allocations (
    id uuid primary key default gen_random_uuid(),
    payment_id uuid not null references public.payments(id) on delete restrict,
    charge_sheet_id uuid not null references public.charge_sheets(id) on delete restrict,
    amount numeric(12,2) not null check (amount > 0),
    created_at timestamptz not null default now(),
    unique (payment_id, charge_sheet_id)
);

-- 12. Payment status history
create table public.payment_status_history (
    id uuid primary key default gen_random_uuid(),
    payment_id uuid not null references public.payments(id) on delete restrict,
    previous_status text,
    new_status text not null,
    changed_by uuid references auth.users(id) on delete set null,
    reason text,
    created_at timestamptz not null default now()
);

-- 13. QR payment sessions
create table public.payment_sessions (
    id uuid primary key default gen_random_uuid(),
    payment_id uuid references public.payments(id) on delete restrict,
    payer_id uuid not null references auth.users(id) on delete restrict,
    charge_sheet_id uuid not null references public.charge_sheets(id) on delete restrict,
    token_hash text not null unique,
    expires_at timestamptz not null default (now() + interval '5 minutes'),
    status text not null default 'active'
        check (status in ('active', 'used', 'expired', 'cancelled')),
    created_at timestamptz not null default now()
);

-- 14. Cash repayment handover workflow
create table public.cash_payment_requests (
    id uuid primary key default gen_random_uuid(),
    charge_sheet_id uuid not null references public.charge_sheets(id) on delete restrict,
    payer_id uuid not null references auth.users(id) on delete restrict,
    receiver_id uuid not null references auth.users(id) on delete restrict,
    amount numeric(12,2) not null check (amount > 0),
    status text not null default 'requested'
        check (status in (
            'requested', 'receiver_ready', 'cash_handed_over',
            'confirmed', 'rejected', 'cancelled', 'expired'
        )),
    expires_at timestamptz not null default (now() + interval '15 minutes'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (payer_id <> receiver_id)
);

-- 15. Uploaded receipts and payment evidence metadata
create table public.evidence (
    id uuid primary key default gen_random_uuid(),
    payment_id uuid references public.payments(id) on delete restrict,
    expense_id uuid references public.expenses(id) on delete restrict,
    uploaded_by uuid not null references auth.users(id) on delete restrict,
    storage_path text not null,
    original_filename text,
    mime_type text,
    file_size_bytes bigint check (file_size_bytes >= 0),
    sha256_checksum text,
    evidence_type text not null default 'receipt'
        check (evidence_type in (
            'receipt', 'payment_proof', 'bill_photo', 'other'
        )),
    created_at timestamptz not null default now(),
    check (payment_id is not null or expense_id is not null)
);

create index idx_payments_payer on public.payments(payer_id);
create index idx_payments_status on public.payments(status);
create index idx_payment_allocations_charge
    on public.payment_allocations(charge_sheet_id);
create index idx_payment_sessions_expiry
    on public.payment_sessions(expires_at);
create index idx_cash_requests_charge
    on public.cash_payment_requests(charge_sheet_id);
create index idx_evidence_payment on public.evidence(payment_id);



-- =========================================================
-- ChargSheet: Initial Database Schema (Part 3)
-- Verification, bill scanning, disputes, and charge history
-- =========================================================

-- 16. Verification checks performed on a payment or evidence
create table public.verification_checks (
    id uuid primary key default gen_random_uuid(),
    payment_id uuid references public.payments(id) on delete restrict,
    evidence_id uuid references public.evidence(id) on delete restrict,
    verification_type text not null
        check (verification_type in (
            'rule_based', 'ai', 'manual'
        )),
    result text not null
        check (result in (
            'verified', 'needs_clarification', 'high_risk', 'rejected'
        )),
    confidence numeric(5,4)
        check (confidence between 0 and 1),
    findings jsonb not null default '{}'::jsonb,
    checked_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    check (payment_id is not null or evidence_id is not null)
);

-- 17. Review decisions for verification results
create table public.verification_reviews (
    id uuid primary key default gen_random_uuid(),
    verification_check_id uuid not null
        references public.verification_checks(id) on delete restrict,
    reviewer_id uuid not null references auth.users(id) on delete restrict,
    decision text not null
        check (decision in ('accepted', 'rejected', 'more_information')),
    notes text,
    created_at timestamptz not null default now()
);

-- 18. Charge status history
create table public.charge_status_history (
    id uuid primary key default gen_random_uuid(),
    charge_sheet_id uuid not null
        references public.charge_sheets(id) on delete restrict,
    previous_status text,
    new_status text not null,
    changed_by uuid references auth.users(id) on delete set null,
    reason text,
    created_at timestamptz not null default now()
);

-- 19. Charge disputes
create table public.charge_disputes (
    id uuid primary key default gen_random_uuid(),
    charge_sheet_id uuid not null
        references public.charge_sheets(id) on delete restrict,
    raised_by uuid not null references auth.users(id) on delete restrict,
    reason_code text not null
        check (reason_code in (
            'incorrect_amount',
            'payment_not_recorded',
            'duplicate_charge',
            'incorrect_split',
            'unauthorized_charge',
            'other'
        )),
    description text,
    status text not null default 'open'
        check (status in (
            'open', 'under_review', 'resolved', 'rejected', 'withdrawn'
        )),
    resolution_notes text,
    resolved_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    resolved_at timestamptz
);

-- 20. Messages and notes associated with a dispute
create table public.dispute_messages (
    id uuid primary key default gen_random_uuid(),
    dispute_id uuid not null
        references public.charge_disputes(id) on delete restrict,
    sender_id uuid not null references auth.users(id) on delete restrict,
    message text not null check (length(trim(message)) > 0),
    created_at timestamptz not null default now()
);

-- 21. Bill scans initiated by a user
create table public.bill_scans (
    id uuid primary key default gen_random_uuid(),
    uploaded_by uuid not null references auth.users(id) on delete restrict,
    evidence_id uuid references public.evidence(id) on delete restrict,
    status text not null default 'pending'
        check (status in (
            'pending', 'processing', 'completed', 'failed', 'review_required'
        )),
    extracted_data jsonb not null default '{}'::jsonb,
    bill_subtotal numeric(12,2),
    tax_amount numeric(12,2),
    bill_total numeric(12,2),
    currency char(3) not null default 'INR',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 22. Items extracted from a bill scan
create table public.bill_scan_items (
    id uuid primary key default gen_random_uuid(),
    bill_scan_id uuid not null
        references public.bill_scans(id) on delete cascade,
    item_name text not null,
    quantity numeric(10,3) not null default 1 check (quantity > 0),
    unit_price numeric(12,2) check (unit_price >= 0),
    total_price numeric(12,2) check (total_price >= 0),
    assigned_user_id uuid references auth.users(id) on delete set null,
    confidence numeric(5,4) check (confidence between 0 and 1),
    created_at timestamptz not null default now()
);

-- 23. Explicit assignments for extracted bill items
create table public.bill_item_assignments (
    id uuid primary key default gen_random_uuid(),
    bill_scan_item_id uuid not null
        references public.bill_scan_items(id) on delete cascade,
    assigned_user_id uuid not null references auth.users(id) on delete restrict,
    assigned_by uuid references auth.users(id) on delete set null,
    assignment_method text not null default 'manual'
        check (assignment_method in ('manual', 'voice', 'ai')),
    created_at timestamptz not null default now()
);

-- 24. Reconciliation results for bill totals, tax, and item splits
create table public.bill_reconciliation_results (
    id uuid primary key default gen_random_uuid(),
    bill_scan_id uuid not null
        references public.bill_scans(id) on delete cascade,
    calculated_items_total numeric(12,2) not null default 0,
    bill_subtotal numeric(12,2),
    tax_amount numeric(12,2),
    bill_total numeric(12,2),
    difference_amount numeric(12,2),
    is_reconciled boolean not null default false,
    findings jsonb not null default '{}'::jsonb,
    checked_at timestamptz not null default now()
);

create index idx_verification_checks_payment
    on public.verification_checks(payment_id);
create index idx_verification_checks_evidence
    on public.verification_checks(evidence_id);
create index idx_charge_history_charge
    on public.charge_status_history(charge_sheet_id);
create index idx_disputes_charge
    on public.charge_disputes(charge_sheet_id);
create index idx_dispute_messages_dispute
    on public.dispute_messages(dispute_id);
create index idx_bill_scans_uploader
    on public.bill_scans(uploaded_by);
create index idx_bill_items_scan
    on public.bill_scan_items(bill_scan_id);



-- =========================================================
-- ChargSheet: Initial Database Schema (Part 4)
-- Notifications, categories, audit events, and balance view
-- =========================================================

-- 25. In-app notifications
create table public.notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    notification_type text not null
        check (notification_type in (
            'charge_created',
            'payment_received',
            'payment_update',
            'cash_payment_request',
            'cash_payment_update',
            'dispute_update',
            'verification_update',
            'reminder',
            'system'
        )),
    title text not null,
    message text not null,
    related_entity_type text,
    related_entity_id uuid,
    read_at timestamptz,
    created_at timestamptz not null default now()
);

-- 26. Notification delivery attempts (email/push integrations later)
create table public.notification_deliveries (
    id uuid primary key default gen_random_uuid(),
    notification_id uuid not null
        references public.notifications(id) on delete cascade,
    channel text not null
        check (channel in ('in_app', 'email', 'push')),
    status text not null default 'pending'
        check (status in ('pending', 'sent', 'failed')),
    attempt_count integer not null default 0 check (attempt_count >= 0),
    last_error text,
    sent_at timestamptz,
    created_at timestamptz not null default now()
);

-- 27. Expense categories
create table public.expense_categories (
    id uuid primary key default gen_random_uuid(),
    name text not null unique check (length(trim(name)) > 0),
    description text,
    created_by uuid references auth.users(id) on delete set null,
    is_system boolean not null default false,
    created_at timestamptz not null default now()
);

-- 28. Append-only audit events
create table public.audit_events (
    id uuid primary key default gen_random_uuid(),
    actor_id uuid references auth.users(id) on delete set null,
    event_type text not null,
    entity_type text not null,
    entity_id uuid,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- Indexes for notifications and audit lookups
create index idx_notifications_user_created
    on public.notifications(user_id, created_at desc);

create index idx_notifications_unread
    on public.notifications(user_id)
    where read_at is null;

create index idx_notification_deliveries_status
    on public.notification_deliveries(status);

create index idx_audit_events_entity
    on public.audit_events(entity_type, entity_id, created_at desc);

create index idx_audit_events_actor
    on public.audit_events(actor_id, created_at desc);

-- 29. Balance summary view
-- Only successful payments count toward amounts paid.
create view public.charge_balance_summary
with (security_invoker = true) as
select
    cs.id as charge_sheet_id,
    cs.expense_id,
    cs.payer_id,
    cs.receiver_id,
    cs.original_amount,
    coalesce(sum(
        case
            when p.status = 'succeeded' then pa.amount
            else 0
        end
    ), 0)::numeric(12,2) as amount_paid,
    greatest(
        cs.original_amount - coalesce(sum(
            case
                when p.status = 'succeeded' then pa.amount
                else 0
            end
        ), 0),
        0
    )::numeric(12,2) as outstanding_amount,
    cs.status as charge_status
from public.charge_sheets cs
left join public.payment_allocations pa
    on pa.charge_sheet_id = cs.id
left join public.payments p
    on p.id = pa.payment_id
group by
    cs.id,
    cs.expense_id,
    cs.payer_id,
    cs.receiver_id,
    cs.original_amount,
    cs.status;



-- =========================================================
-- ChargSheet: Part 5
-- Enable Row Level Security on all application tables
-- =========================================================

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_participants enable row level security;
alter table public.expense_items enable row level security;
alter table public.expense_splits enable row level security;
alter table public.charge_sheets enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.payment_status_history enable row level security;
alter table public.payment_sessions enable row level security;
alter table public.cash_payment_requests enable row level security;
alter table public.evidence enable row level security;
alter table public.verification_checks enable row level security;
alter table public.verification_reviews enable row level security;
alter table public.charge_status_history enable row level security;
alter table public.charge_disputes enable row level security;
alter table public.dispute_messages enable row level security;
alter table public.bill_scans enable row level security;
alter table public.bill_scan_items enable row level security;
alter table public.bill_item_assignments enable row level security;
alter table public.bill_reconciliation_results enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.expense_categories enable row level security;
alter table public.audit_events enable row level security;



-- =========================================================
-- ChargSheet: Part 6
-- Initial read-access policies
-- =========================================================

-- Profiles: users can read and update their own profile.
create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Group membership: members can see their own memberships.
create policy "Users can read own group memberships"
on public.group_members
for select
to authenticated
using (user_id = (select auth.uid()));

-- Groups: members can read groups they belong to.
create policy "Members can read their groups"
on public.groups
for select
to authenticated
using (
    exists (
        select 1
        from public.group_members gm
        where gm.group_id = groups.id
          and gm.user_id = (select auth.uid())
    )
    or created_by = (select auth.uid())
);

-- Expenses: creator and participants can read an expense.
create policy "Expense creators and participants can read expenses"
on public.expenses
for select
to authenticated
using (
    created_by = (select auth.uid())
    or exists (
        select 1
        from public.expense_participants ep
        where ep.expense_id = expenses.id
          and ep.user_id = (select auth.uid())
    )
);

-- Expense participants: users can see their own participation.
create policy "Users can read own expense participation"
on public.expense_participants
for select
to authenticated
using (user_id = (select auth.uid()));

-- Charge sheets: payer and receiver can read their charges.
create policy "Charge parties can read charge sheets"
on public.charge_sheets
for select
to authenticated
using (
    payer_id = (select auth.uid())
    or receiver_id = (select auth.uid())
);

-- Notifications: users can read and update their own notifications.
create policy "Users can read own notifications"
on public.notifications
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Users can mark own notifications read"
on public.notifications
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));



-- =========================================================
-- ChargSheet: Part 7
-- Financial data read-access policies
-- =========================================================

-- Expense splits: each user can see their own split.
create policy "Users can read own expense splits"
on public.expense_splits
for select
to authenticated
using (user_id = (select auth.uid()));

-- Payments: only the payer can read their payment record.
create policy "Payers can read own payments"
on public.payments
for select
to authenticated
using (payer_id = (select auth.uid()));

-- Payment allocations: payer or charge-sheet parties can read.
create policy "Charge parties can read payment allocations"
on public.payment_allocations
for select
to authenticated
using (
    exists (
        select 1
        from public.payments p
        where p.id = payment_allocations.payment_id
          and p.payer_id = (select auth.uid())
    )
    or exists (
        select 1
        from public.charge_sheets cs
        where cs.id = payment_allocations.charge_sheet_id
          and (
              cs.payer_id = (select auth.uid())
              or cs.receiver_id = (select auth.uid())
          )
    )
);

-- Payment status history: payer can read their own history.
create policy "Payers can read own payment history"
on public.payment_status_history
for select
to authenticated
using (
    exists (
        select 1
        from public.payments p
        where p.id = payment_status_history.payment_id
          and p.payer_id = (select auth.uid())
    )
);

-- Cash requests: only the payer and receiver can read them.
create policy "Cash payment parties can read requests"
on public.cash_payment_requests
for select
to authenticated
using (
    payer_id = (select auth.uid())
    or receiver_id = (select auth.uid())
);

-- QR sessions: only the payer can read their sessions.
create policy "Payers can read own payment sessions"
on public.payment_sessions
for select
to authenticated
using (payer_id = (select auth.uid()));

-- Evidence: uploader and relevant charge parties can read evidence.
create policy "Relevant users can read evidence"
on public.evidence
for select
to authenticated
using (
    uploaded_by = (select auth.uid())
    or exists (
        select 1
        from public.payments p
        join public.payment_allocations pa on pa.payment_id = p.id
        join public.charge_sheets cs on cs.id = pa.charge_sheet_id
        where p.id = evidence.payment_id
          and (
              cs.payer_id = (select auth.uid())
              or cs.receiver_id = (select auth.uid())
          )
    )
    or exists (
        select 1
        from public.expenses e
        where e.id = evidence.expense_id
          and (
              e.created_by = (select auth.uid())
              or exists (
                  select 1
                  from public.expense_participants ep
                  where ep.expense_id = e.id
                    and ep.user_id = (select auth.uid())
              )
          )
    )
);

-- Verification checks: relevant payment parties or evidence uploader.
create policy "Relevant users can read verification checks"
on public.verification_checks
for select
to authenticated
using (
    exists (
        select 1
        from public.payments p
        where p.id = verification_checks.payment_id
          and p.payer_id = (select auth.uid())
    )
    or exists (
        select 1
        from public.evidence ev
        where ev.id = verification_checks.evidence_id
          and ev.uploaded_by = (select auth.uid())
    )
);

-- Disputes: only the person raising the dispute and charge parties.
create policy "Charge parties can read disputes"
on public.charge_disputes
for select
to authenticated
using (
    raised_by = (select auth.uid())
    or exists (
        select 1
        from public.charge_sheets cs
        where cs.id = charge_disputes.charge_sheet_id
          and (
              cs.payer_id = (select auth.uid())
              or cs.receiver_id = (select auth.uid())
          )
    )
);

-- Dispute messages: visible to parties who can read the dispute.
create policy "Dispute parties can read messages"
on public.dispute_messages
for select
to authenticated
using (
    exists (
        select 1
        from public.charge_disputes d
        join public.charge_sheets cs on cs.id = d.charge_sheet_id
        where d.id = dispute_messages.dispute_id
          and (
              d.raised_by = (select auth.uid())
              or cs.payer_id = (select auth.uid())
              or cs.receiver_id = (select auth.uid())
          )
    )
);

-- Charge status history: payer and receiver can read it.
create policy "Charge parties can read charge history"
on public.charge_status_history
for select
to authenticated
using (
    exists (
        select 1
        from public.charge_sheets cs
        where cs.id = charge_status_history.charge_sheet_id
          and (
              cs.payer_id = (select auth.uid())
              or cs.receiver_id = (select auth.uid())
          )
    )
);



-- =========================================================
-- ChargSheet: Part 8
-- Bill scanning, review, and supporting read policies
-- =========================================================

-- Expense items: creators and expense participants can read items.
create policy "Expense participants can read expense items"
on public.expense_items
for select
to authenticated
using (
    exists (
        select 1
        from public.expenses e
        where e.id = expense_items.expense_id
          and (
              e.created_by = (select auth.uid())
              or exists (
                  select 1
                  from public.expense_participants ep
                  where ep.expense_id = e.id
                    and ep.user_id = (select auth.uid())
              )
          )
    )
);

-- Verification reviews: reviewers and relevant charge parties can read.
create policy "Relevant users can read verification reviews"
on public.verification_reviews
for select
to authenticated
using (
    reviewer_id = (select auth.uid())
    or exists (
        select 1
        from public.verification_checks vc
        join public.payments p on p.id = vc.payment_id
        where vc.id = verification_reviews.verification_check_id
          and p.payer_id = (select auth.uid())
    )
);

-- Bill scans: uploader can read their scans.
create policy "Uploaders can read own bill scans"
on public.bill_scans
for select
to authenticated
using (uploaded_by = (select auth.uid()));

-- Bill scan items: visible to the scan uploader.
create policy "Uploaders can read bill scan items"
on public.bill_scan_items
for select
to authenticated
using (
    exists (
        select 1
        from public.bill_scans bs
        where bs.id = bill_scan_items.bill_scan_id
          and bs.uploaded_by = (select auth.uid())
    )
);

-- Bill item assignments: assigned user or scan uploader can read.
create policy "Relevant users can read bill item assignments"
on public.bill_item_assignments
for select
to authenticated
using (
    assigned_user_id = (select auth.uid())
    or exists (
        select 1
        from public.bill_scan_items bsi
        join public.bill_scans bs on bs.id = bsi.bill_scan_id
        where bsi.id = bill_item_assignments.bill_scan_item_id
          and bs.uploaded_by = (select auth.uid())
    )
);

-- Reconciliation results: scan uploader can read results.
create policy "Uploaders can read reconciliation results"
on public.bill_reconciliation_results
for select
to authenticated
using (
    exists (
        select 1
        from public.bill_scans bs
        where bs.id = bill_reconciliation_results.bill_scan_id
          and bs.uploaded_by = (select auth.uid())
    )
);

-- Expense categories: signed-in users can read categories.
create policy "Authenticated users can read expense categories"
on public.expense_categories
for select
to authenticated
using (true);



-- ChargSheet security baseline.
-- Client-side writes remain disabled until validated RPC workflows exist.

revoke all privileges on table
    public.profiles,
    public.user_roles,
    public.groups,
    public.group_members,
    public.expenses,
    public.expense_participants,
    public.expense_items,
    public.expense_splits,
    public.charge_sheets,
    public.payments,
    public.payment_allocations,
    public.payment_status_history,
    public.payment_sessions,
    public.cash_payment_requests,
    public.evidence,
    public.verification_checks,
    public.verification_reviews,
    public.charge_status_history,
    public.charge_disputes,
    public.dispute_messages,
    public.bill_scans,
    public.bill_scan_items,
    public.bill_item_assignments,
    public.bill_reconciliation_results,
    public.notifications,
    public.notification_deliveries,
    public.expense_categories,
    public.audit_events
from anon, authenticated;

-- RLS policies restrict which rows authenticated users can read.
grant select on table
    public.profiles,
    public.user_roles,
    public.groups,
    public.group_members,
    public.expenses,
    public.expense_participants,
    public.expense_items,
    public.expense_splits,
    public.charge_sheets,
    public.payments,
    public.payment_allocations,
    public.payment_status_history,
    public.payment_sessions,
    public.cash_payment_requests,
    public.evidence,
    public.verification_checks,
    public.verification_reviews,
    public.charge_status_history,
    public.charge_disputes,
    public.dispute_messages,
    public.bill_scans,
    public.bill_scan_items,
    public.bill_item_assignments,
    public.bill_reconciliation_results,
    public.notifications,
    public.notification_deliveries,
    public.expense_categories,
    public.audit_events
to authenticated;

revoke all privileges on table public.charge_balance_summary
from anon, authenticated;

grant select on table public.charge_balance_summary
to authenticated;
