create table public.trade_offers (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null
    references public.profiles (id) on delete restrict,
  recipient_id uuid not null
    references public.profiles (id) on delete restrict,
  status text not null default 'pending',
  cash_amount_minor bigint,
  cash_currency text,
  cash_direction text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_offers_distinct_participants check (
    proposer_id <> recipient_id
  ),
  constraint trade_offers_status_allowed check (
    status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')
  ),
  constraint trade_offers_cash_fields_together check (
    (
      cash_amount_minor is null
      and cash_currency is null
      and cash_direction is null
    )
    or (
      cash_amount_minor is not null
      and cash_currency is not null
      and cash_direction is not null
    )
  ),
  constraint trade_offers_cash_amount_positive check (
    cash_amount_minor is null or cash_amount_minor > 0
  ),
  constraint trade_offers_cash_currency_format check (
    cash_currency is null
    or cash_currency ~ '^[ABCDEFGHIJKLMNOPQRSTUVWXYZ]{3}$'
  ),
  constraint trade_offers_cash_direction_allowed check (
    cash_direction is null
    or cash_direction in (
      'proposer_pays_recipient',
      'recipient_pays_proposer'
    )
  ),
  constraint trade_offers_expiration_after_creation check (
    expires_at is null or expires_at > created_at
  )
);

create index trade_offers_proposer_id_index
on public.trade_offers (proposer_id);

create index trade_offers_recipient_id_index
on public.trade_offers (recipient_id);

create trigger trade_offers_set_updated_at
before update on public.trade_offers
for each row execute function public.set_updated_at();

create table public.trade_offer_copies (
  trade_offer_id uuid not null
    references public.trade_offers (id) on delete restrict,
  copy_id uuid not null references public.copies (id) on delete restrict,
  side text not null,
  created_at timestamptz not null default now(),
  constraint trade_offer_copies_primary_key primary key (
    trade_offer_id,
    copy_id
  ),
  constraint trade_offer_copies_side_allowed check (
    side in ('proposer', 'recipient')
  )
);

create index trade_offer_copies_copy_id_index
on public.trade_offer_copies (copy_id);

alter table public.copy_commercial_commitments
add column trade_offer_id uuid;

alter table public.copy_commercial_commitments
drop constraint copy_commercial_commitments_kind_allowed,
drop constraint copy_commercial_commitments_source;

alter table public.copy_commercial_commitments
add constraint copy_commercial_commitments_kind_allowed check (
  kind in ('listing', 'auction', 'trade_offer')
),
add constraint copy_commercial_commitments_source check (
  (
    kind = 'listing'
    and listing_id is not null
    and auction_id is null
    and trade_offer_id is null
  )
  or (
    kind = 'auction'
    and auction_id is not null
    and listing_id is null
    and trade_offer_id is null
  )
  or (
    kind = 'trade_offer'
    and trade_offer_id is not null
    and listing_id is null
    and auction_id is null
  )
),
add constraint copy_commercial_commitments_trade_offer_copy_foreign_key
  foreign key (trade_offer_id, copy_id)
  references public.trade_offer_copies (trade_offer_id, copy_id)
  on delete restrict;

create function public.enforce_trade_offer_term_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.proposer_id is distinct from old.proposer_id
    or new.recipient_id is distinct from old.recipient_id
    or new.cash_amount_minor is distinct from old.cash_amount_minor
    or new.cash_currency is distinct from old.cash_currency
    or new.cash_direction is distinct from old.cash_direction
    or new.expires_at is distinct from old.expires_at
    or new.created_at is distinct from old.created_at
  then
    raise exception 'TradeOffer terms are immutable after creation.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_trade_offer_term_immutability()
from public, anon, authenticated;

create trigger trade_offers_enforce_term_immutability
before update on public.trade_offers
for each row execute function public.enforce_trade_offer_term_immutability();

create function public.enforce_trade_offer_copy_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_trade_offer_id uuid;
  parent_status text;
begin
  if tg_op = 'UPDATE' then
    raise exception 'TradeOffer Copy membership is immutable.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    parent_trade_offer_id := old.trade_offer_id;
  else
    parent_trade_offer_id := new.trade_offer_id;
  end if;

  select offer.status
  into parent_status
  from public.trade_offers as offer
  where offer.id = parent_trade_offer_id
  for update;

  if not found then
    if tg_op = 'DELETE' then
      return old;
    end if;

    raise exception 'Referenced TradeOffer does not exist.'
      using errcode = '23503';
  end if;

  if parent_status <> 'pending' then
    raise exception 'TradeOffer Copy membership is immutable once the TradeOffer is no longer pending.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_trade_offer_copy_immutability()
from public, anon, authenticated;

create trigger trade_offer_copies_enforce_immutability
before insert or update or delete on public.trade_offer_copies
for each row execute function public.enforce_trade_offer_copy_immutability();

create function public.validate_trade_offer_reservation_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject_trade_offer_ids uuid[];
  subject_trade_offer_id uuid;
  subject_status text;
  membership_count integer;
  commitment_count integer;
begin
  if tg_table_name = 'trade_offers' then
    subject_trade_offer_ids := array[new.id];
  elsif tg_table_name = 'trade_offer_copies' then
    if tg_op = 'DELETE' then
      subject_trade_offer_ids := array[old.trade_offer_id];
    else
      subject_trade_offer_ids := array[new.trade_offer_id];
    end if;
  elsif tg_op = 'INSERT' then
    subject_trade_offer_ids := array[new.trade_offer_id];
  elsif tg_op = 'DELETE' then
    subject_trade_offer_ids := array[old.trade_offer_id];
  else
    subject_trade_offer_ids := array[new.trade_offer_id, old.trade_offer_id];
  end if;

  foreach subject_trade_offer_id in array subject_trade_offer_ids loop
    if subject_trade_offer_id is null then
      continue;
    end if;

    select offer.status
    into subject_status
    from public.trade_offers as offer
    where offer.id = subject_trade_offer_id;

    if not found then
      continue;
    end if;

    select pg_catalog.count(*)::integer
    into membership_count
    from public.trade_offer_copies as membership
    where membership.trade_offer_id = subject_trade_offer_id;

    select pg_catalog.count(*)::integer
    into commitment_count
    from public.copy_commercial_commitments as commitment
    where commitment.kind = 'trade_offer'
      and commitment.trade_offer_id = subject_trade_offer_id;

    if subject_status = 'accepted' then
      if membership_count = 0 or commitment_count <> membership_count then
        raise exception 'An accepted TradeOffer must reserve every included Copy.'
          using errcode = '23514';
      end if;
    elsif commitment_count <> 0 then
      raise exception 'Only an accepted TradeOffer may hold Copy commercial commitments.'
        using errcode = '23514';
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function public.validate_trade_offer_reservation_integrity()
from public, anon, authenticated;

create constraint trigger trade_offers_validate_reservation_integrity
after insert or update on public.trade_offers
deferrable initially deferred
for each row
execute function public.validate_trade_offer_reservation_integrity();

create constraint trigger trade_offer_copies_validate_reservation_integrity
after insert or delete on public.trade_offer_copies
deferrable initially deferred
for each row
execute function public.validate_trade_offer_reservation_integrity();

create constraint trigger copy_commercial_commitments_validate_trade_offer_insert
after insert on public.copy_commercial_commitments
deferrable initially deferred
for each row
when (new.kind = 'trade_offer')
execute function public.validate_trade_offer_reservation_integrity();

create constraint trigger copy_commercial_commitments_validate_trade_offer_update
after update on public.copy_commercial_commitments
deferrable initially deferred
for each row
when (new.kind = 'trade_offer' or old.kind = 'trade_offer')
execute function public.validate_trade_offer_reservation_integrity();

create constraint trigger copy_commercial_commitments_validate_trade_offer_delete
after delete on public.copy_commercial_commitments
deferrable initially deferred
for each row
when (old.kind = 'trade_offer')
execute function public.validate_trade_offer_reservation_integrity();

create function public.create_trade_offer(
  recipient_user_id uuid,
  offered_copy_ids uuid[],
  requested_copy_ids uuid[],
  cash_amount_minor bigint default null,
  cash_currency text default null,
  cash_direction text default null,
  expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  involved_copy_ids uuid[];
  locked_copy_count integer;
  decision_at timestamptz;
  created_trade_offer_id uuid;
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if recipient_user_id is null then
    raise exception 'recipient_user_id is required.' using errcode = '22023';
  end if;

  if recipient_user_id = caller_user_id then
    raise exception 'TradeOffer participants must be different.'
      using errcode = '23514';
  end if;

  if offered_copy_ids is null
    or pg_catalog.cardinality(offered_copy_ids) < 1
  then
    raise exception 'offered_copy_ids must contain at least one Copy.'
      using errcode = '22023';
  end if;

  if requested_copy_ids is null
    or pg_catalog.cardinality(requested_copy_ids) < 1
  then
    raise exception 'requested_copy_ids must contain at least one Copy.'
      using errcode = '22023';
  end if;

  if pg_catalog.cardinality(offered_copy_ids) > 20 then
    raise exception 'offered_copy_ids may contain at most 20 Copies.'
      using errcode = '22023';
  end if;

  if pg_catalog.cardinality(requested_copy_ids) > 20 then
    raise exception 'requested_copy_ids may contain at most 20 Copies.'
      using errcode = '22023';
  end if;

  if pg_catalog.array_position(offered_copy_ids, null::uuid) is not null then
    raise exception 'offered_copy_ids cannot contain null.'
      using errcode = '22023';
  end if;

  if pg_catalog.array_position(requested_copy_ids, null::uuid) is not null then
    raise exception 'requested_copy_ids cannot contain null.'
      using errcode = '22023';
  end if;

  if (
    select pg_catalog.count(*) <> pg_catalog.count(distinct copy_id)
    from pg_catalog.unnest(offered_copy_ids) as offered(copy_id)
  ) then
    raise exception 'offered_copy_ids cannot contain duplicates.'
      using errcode = '22023';
  end if;

  if (
    select pg_catalog.count(*) <> pg_catalog.count(distinct copy_id)
    from pg_catalog.unnest(requested_copy_ids) as requested(copy_id)
  ) then
    raise exception 'requested_copy_ids cannot contain duplicates.'
      using errcode = '22023';
  end if;

  if offered_copy_ids && requested_copy_ids then
    raise exception 'A Copy cannot appear on both sides of a TradeOffer.'
      using errcode = '23514';
  end if;

  if not (
    (
      cash_amount_minor is null
      and cash_currency is null
      and cash_direction is null
    )
    or (
      cash_amount_minor is not null
      and cash_currency is not null
      and cash_direction is not null
    )
  ) then
    raise exception 'Cash amount, currency, and direction must be all present or all null.'
      using errcode = '22023';
  end if;

  if cash_amount_minor is not null and cash_amount_minor <= 0 then
    raise exception 'cash_amount_minor must be greater than zero.'
      using errcode = '22023';
  end if;

  if cash_currency is not null
    and cash_currency !~ '^[ABCDEFGHIJKLMNOPQRSTUVWXYZ]{3}$'
  then
    raise exception 'cash_currency must be exactly three uppercase ASCII letters.'
      using errcode = '22023';
  end if;

  if cash_direction is not null
    and cash_direction not in (
      'proposer_pays_recipient',
      'recipient_pays_proposer'
    )
  then
    raise exception 'cash_direction is invalid.' using errcode = '22023';
  end if;

  involved_copy_ids := offered_copy_ids || requested_copy_ids;

  perform copy.id
  from public.copies as copy
  where copy.id = any(involved_copy_ids)
  order by copy.id
  for update;

  get diagnostics locked_copy_count = row_count;

  if locked_copy_count <> pg_catalog.cardinality(involved_copy_ids) then
    raise exception 'Every involved Copy must exist.' using errcode = '23503';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(offered_copy_ids) as offered(copy_id)
    join public.copies as copy on copy.id = offered.copy_id
    where copy.owner_id <> caller_user_id
      or copy.trade_availability <> 'open_to_trade'
  ) then
    raise exception 'Every offered Copy must be owned by the proposer and open to trade.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(requested_copy_ids) as requested(copy_id)
    join public.copies as copy on copy.id = requested.copy_id
    where copy.owner_id <> recipient_user_id
      or copy.trade_availability <> 'open_to_trade'
  ) then
    raise exception 'Every requested Copy must be owned by the recipient and open to trade.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.copy_commercial_commitments as commitment
    where commitment.copy_id = any(involved_copy_ids)
  ) then
    raise exception 'An involved Copy already has a commercial commitment.'
      using errcode = '23514';
  end if;

  decision_at := pg_catalog.clock_timestamp();

  if expires_at is not null and expires_at <= decision_at then
    raise exception 'expires_at must be in the future.'
      using errcode = '22023';
  end if;

  insert into public.trade_offers (
    proposer_id,
    recipient_id,
    status,
    cash_amount_minor,
    cash_currency,
    cash_direction,
    expires_at
  ) values (
    caller_user_id,
    recipient_user_id,
    'pending',
    cash_amount_minor,
    cash_currency,
    cash_direction,
    expires_at
  )
  returning id into created_trade_offer_id;

  insert into public.trade_offer_copies (
    trade_offer_id,
    copy_id,
    side
  )
  select
    created_trade_offer_id,
    offered.copy_id,
    'proposer'
  from pg_catalog.unnest(offered_copy_ids) as offered(copy_id);

  insert into public.trade_offer_copies (
    trade_offer_id,
    copy_id,
    side
  )
  select
    created_trade_offer_id,
    requested.copy_id,
    'recipient'
  from pg_catalog.unnest(requested_copy_ids) as requested(copy_id);

  return created_trade_offer_id;
end;
$$;

revoke all on function public.create_trade_offer(
  uuid,
  uuid[],
  uuid[],
  bigint,
  text,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.create_trade_offer(
  uuid,
  uuid[],
  uuid[],
  bigint,
  text,
  text,
  timestamptz
) to authenticated;

create function public.accept_trade_offer(target_trade_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  preliminary_offer public.trade_offers%rowtype;
  locked_offer public.trade_offers%rowtype;
  preliminary_copy_ids uuid[];
  locked_copy_ids uuid[];
  locked_copy_count integer;
  proposer_copy_count integer;
  recipient_copy_count integer;
  decision_at timestamptz;
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select offer.*
  into preliminary_offer
  from public.trade_offers as offer
  where offer.id = target_trade_offer_id;

  if not found then
    raise exception 'TradeOffer does not exist.' using errcode = 'P0002';
  end if;

  if preliminary_offer.recipient_id <> caller_user_id then
    raise exception 'Only the TradeOffer recipient may accept.'
      using errcode = '42501';
  end if;

  select pg_catalog.array_agg(membership.copy_id order by membership.copy_id)
  into preliminary_copy_ids
  from public.trade_offer_copies as membership
  where membership.trade_offer_id = preliminary_offer.id;

  if preliminary_copy_ids is null then
    raise exception 'TradeOffer must contain Copies.' using errcode = '23514';
  end if;

  perform copy.id
  from public.copies as copy
  where copy.id = any(preliminary_copy_ids)
  order by copy.id
  for update;

  get diagnostics locked_copy_count = row_count;

  if locked_copy_count <> pg_catalog.cardinality(preliminary_copy_ids) then
    raise exception 'Every involved Copy must exist.' using errcode = '23503';
  end if;

  select offer.*
  into locked_offer
  from public.trade_offers as offer
  where offer.id = target_trade_offer_id
  for update;

  if not found then
    raise exception 'TradeOffer does not exist.' using errcode = 'P0002';
  end if;

  if locked_offer.recipient_id <> caller_user_id then
    raise exception 'Only the TradeOffer recipient may accept.'
      using errcode = '42501';
  end if;

  select
    pg_catalog.array_agg(membership.copy_id order by membership.copy_id),
    pg_catalog.count(*) filter (
      where membership.side = 'proposer'
    )::integer,
    pg_catalog.count(*) filter (
      where membership.side = 'recipient'
    )::integer
  into locked_copy_ids, proposer_copy_count, recipient_copy_count
  from public.trade_offer_copies as membership
  where membership.trade_offer_id = locked_offer.id;

  if locked_copy_ids is distinct from preliminary_copy_ids then
    raise exception 'TradeOffer Copy terms changed during acceptance.'
      using errcode = '40001';
  end if;

  decision_at := pg_catalog.clock_timestamp();

  if locked_offer.status <> 'pending' then
    raise exception 'Only a pending TradeOffer may be accepted.'
      using errcode = '23514';
  end if;

  if locked_offer.expires_at is not null
    and decision_at >= locked_offer.expires_at
  then
    raise exception 'TradeOffer has expired and cannot be accepted.'
      using errcode = '23514';
  end if;

  if proposer_copy_count < 1 or recipient_copy_count < 1 then
    raise exception 'TradeOffer must contain at least one Copy on each side.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.trade_offer_copies as membership
    join public.copies as copy on copy.id = membership.copy_id
    where membership.trade_offer_id = locked_offer.id
      and membership.side = 'proposer'
      and (
        copy.owner_id <> locked_offer.proposer_id
        or copy.trade_availability <> 'open_to_trade'
      )
  ) then
    raise exception 'Every offered Copy must remain owned by the proposer and open to trade.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.trade_offer_copies as membership
    join public.copies as copy on copy.id = membership.copy_id
    where membership.trade_offer_id = locked_offer.id
      and membership.side = 'recipient'
      and (
        copy.owner_id <> locked_offer.recipient_id
        or copy.trade_availability <> 'open_to_trade'
      )
  ) then
    raise exception 'Every requested Copy must remain owned by the recipient and open to trade.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.copy_commercial_commitments as commitment
    where commitment.copy_id = any(locked_copy_ids)
  ) then
    raise exception 'An involved Copy already has a commercial commitment.'
      using errcode = '23514';
  end if;

  insert into public.copy_commercial_commitments (
    copy_id,
    kind,
    trade_offer_id
  )
  select
    membership.copy_id,
    'trade_offer',
    membership.trade_offer_id
  from public.trade_offer_copies as membership
  where membership.trade_offer_id = locked_offer.id
  order by membership.copy_id;

  update public.trade_offers
  set status = 'accepted'
  where id = locked_offer.id;
end;
$$;

revoke all on function public.accept_trade_offer(uuid)
from public, anon, authenticated;
grant execute on function public.accept_trade_offer(uuid) to authenticated;

create function public.cancel_trade_offer(target_trade_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  locked_offer public.trade_offers%rowtype;
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select offer.*
  into locked_offer
  from public.trade_offers as offer
  where offer.id = target_trade_offer_id
  for update;

  if not found then
    raise exception 'TradeOffer does not exist.' using errcode = 'P0002';
  end if;

  if locked_offer.proposer_id <> caller_user_id then
    raise exception 'Only the TradeOffer proposer may cancel.'
      using errcode = '42501';
  end if;

  if locked_offer.status <> 'pending' then
    raise exception 'Only a pending TradeOffer may be cancelled.'
      using errcode = '23514';
  end if;

  update public.trade_offers
  set status = 'cancelled'
  where id = locked_offer.id;
end;
$$;

revoke all on function public.cancel_trade_offer(uuid)
from public, anon, authenticated;
grant execute on function public.cancel_trade_offer(uuid) to authenticated;

create function public.decline_trade_offer(target_trade_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  locked_offer public.trade_offers%rowtype;
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select offer.*
  into locked_offer
  from public.trade_offers as offer
  where offer.id = target_trade_offer_id
  for update;

  if not found then
    raise exception 'TradeOffer does not exist.' using errcode = 'P0002';
  end if;

  if locked_offer.recipient_id <> caller_user_id then
    raise exception 'Only the TradeOffer recipient may decline.'
      using errcode = '42501';
  end if;

  if locked_offer.status <> 'pending' then
    raise exception 'Only a pending TradeOffer may be declined.'
      using errcode = '23514';
  end if;

  update public.trade_offers
  set status = 'declined'
  where id = locked_offer.id;
end;
$$;

revoke all on function public.decline_trade_offer(uuid)
from public, anon, authenticated;
grant execute on function public.decline_trade_offer(uuid) to authenticated;

create function public.expire_trade_offer(target_trade_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_offer public.trade_offers%rowtype;
  decision_at timestamptz;
begin
  select offer.*
  into locked_offer
  from public.trade_offers as offer
  where offer.id = target_trade_offer_id
  for update;

  decision_at := pg_catalog.clock_timestamp();

  if not found then
    raise exception 'TradeOffer does not exist.' using errcode = 'P0002';
  end if;

  if locked_offer.status <> 'pending' then
    raise exception 'Only a pending TradeOffer may expire.'
      using errcode = '23514';
  end if;

  if locked_offer.expires_at is null then
    raise exception 'TradeOffer has no expiration time.'
      using errcode = '23514';
  end if;

  if decision_at < locked_offer.expires_at then
    raise exception 'TradeOffer expiration time has not passed.'
      using errcode = '23514';
  end if;

  update public.trade_offers
  set status = 'expired'
  where id = locked_offer.id;
end;
$$;

revoke all on function public.expire_trade_offer(uuid)
from public, anon, authenticated;
grant execute on function public.expire_trade_offer(uuid) to service_role;

alter table public.trade_offers enable row level security;
alter table public.trade_offer_copies enable row level security;

revoke all privileges on table public.trade_offers from anon, authenticated;
revoke all privileges on table public.trade_offer_copies
from anon, authenticated;

grant select on table public.trade_offers to authenticated;
grant select on table public.trade_offer_copies to authenticated;

grant all privileges on table public.trade_offers to service_role;
grant all privileges on table public.trade_offer_copies to service_role;

create policy trade_offers_participant_read
on public.trade_offers
for select
to authenticated
using (
  proposer_id = (select auth.uid())
  or recipient_id = (select auth.uid())
);

create policy trade_offer_copies_participant_read
on public.trade_offer_copies
for select
to authenticated
using (
  exists (
    select 1
    from public.trade_offers as parent_offer
    where parent_offer.id = trade_offer_copies.trade_offer_id
      and (
        parent_offer.proposer_id = (select auth.uid())
        or parent_offer.recipient_id = (select auth.uid())
      )
  )
);
