alter table public.trade_offers
drop constraint trade_offers_status_allowed;

alter table public.trade_offers
add constraint trade_offers_status_allowed check (
  status in (
    'pending',
    'accepted',
    'declined',
    'cancelled',
    'expired',
    'completed'
  )
);

create table public.trade_completion_confirmations (
  trade_offer_id uuid not null
    references public.trade_offers (id) on delete restrict,
  user_id uuid not null
    references public.profiles (id) on delete restrict,
  confirmed_at timestamptz not null default now(),
  constraint trade_completion_confirmations_primary_key primary key (
    trade_offer_id,
    user_id
  )
);

create table public.trade_completions (
  id uuid primary key default gen_random_uuid(),
  trade_offer_id uuid not null
    references public.trade_offers (id) on delete restrict,
  completed_at timestamptz not null default now(),
  constraint trade_completions_trade_offer_unique unique (trade_offer_id)
);

create function public.validate_trade_completion_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_offer public.trade_offers%rowtype;
begin
  select offer.*
  into parent_offer
  from public.trade_offers as offer
  where offer.id = new.trade_offer_id;

  if not found then
    raise exception 'Referenced TradeOffer does not exist.'
      using errcode = '23503';
  end if;

  if new.user_id not in (parent_offer.proposer_id, parent_offer.recipient_id) then
    raise exception 'Only a TradeOffer participant may confirm the exchange.'
      using errcode = '23514';
  end if;

  if parent_offer.status <> 'accepted' then
    raise exception 'Only an accepted TradeOffer may be confirmed.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_trade_completion_confirmation()
from public, anon, authenticated;

create trigger trade_completion_confirmations_validate
before insert on public.trade_completion_confirmations
for each row execute function public.validate_trade_completion_confirmation();

create function public.enforce_trade_completion_confirmation_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'A TradeCompletion confirmation is immutable after creation.'
    using errcode = '23514';
end;
$$;

revoke all on function public.enforce_trade_completion_confirmation_immutability()
from public, anon, authenticated;

create trigger trade_completion_confirmations_enforce_immutability
before update on public.trade_completion_confirmations
for each row
execute function public.enforce_trade_completion_confirmation_immutability();

create function public.enforce_trade_completion_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'A TradeCompletion is immutable after creation.'
    using errcode = '23514';
end;
$$;

revoke all on function public.enforce_trade_completion_immutability()
from public, anon, authenticated;

create trigger trade_completions_enforce_immutability
before update on public.trade_completions
for each row execute function public.enforce_trade_completion_immutability();

create function public.validate_trade_completion_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject_trade_offer_ids uuid[];
  subject_trade_offer_id uuid;
  subject_offer public.trade_offers%rowtype;
  confirmation_count integer;
  proposer_confirmed boolean;
  recipient_confirmed boolean;
  foreign_confirmation_count integer;
  completion_count integer;
  commitment_count integer;
  membership_count integer;
  proposer_side_count integer;
  recipient_side_count integer;
  untransferred_count integer;
begin
  if tg_table_name = 'trade_offers' then
    subject_trade_offer_ids := array[new.id];
  elsif tg_op = 'DELETE' then
    subject_trade_offer_ids := array[old.trade_offer_id];
  elsif tg_op = 'UPDATE' then
    subject_trade_offer_ids := array[new.trade_offer_id, old.trade_offer_id];
  else
    subject_trade_offer_ids := array[new.trade_offer_id];
  end if;

  foreach subject_trade_offer_id in array subject_trade_offer_ids loop
    if subject_trade_offer_id is null then
      continue;
    end if;

    select offer.*
    into subject_offer
    from public.trade_offers as offer
    where offer.id = subject_trade_offer_id;

    if not found then
      continue;
    end if;

    select
      pg_catalog.count(*)::integer,
      pg_catalog.count(*) filter (
        where confirmation.user_id = subject_offer.proposer_id
      ) > 0,
      pg_catalog.count(*) filter (
        where confirmation.user_id = subject_offer.recipient_id
      ) > 0,
      pg_catalog.count(*) filter (
        where confirmation.user_id not in (
          subject_offer.proposer_id,
          subject_offer.recipient_id
        )
      )::integer
    into
      confirmation_count,
      proposer_confirmed,
      recipient_confirmed,
      foreign_confirmation_count
    from public.trade_completion_confirmations as confirmation
    where confirmation.trade_offer_id = subject_trade_offer_id;

    select pg_catalog.count(*)::integer
    into completion_count
    from public.trade_completions as completion
    where completion.trade_offer_id = subject_trade_offer_id;

    if foreign_confirmation_count <> 0 then
      raise exception 'Only a TradeOffer participant may confirm the exchange.'
        using errcode = '23514';
    end if;

    if subject_offer.status = 'completed' then
      select
        pg_catalog.count(*)::integer,
        pg_catalog.count(*) filter (
          where membership.side = 'proposer'
        )::integer,
        pg_catalog.count(*) filter (
          where membership.side = 'recipient'
        )::integer
      into membership_count, proposer_side_count, recipient_side_count
      from public.trade_offer_copies as membership
      where membership.trade_offer_id = subject_trade_offer_id;

      if membership_count = 0
        or proposer_side_count = 0
        or recipient_side_count = 0
      then
        raise exception 'A completed TradeOffer must retain Copies on both sides.'
          using errcode = '23514';
      end if;

      if not proposer_confirmed
        or not recipient_confirmed
        or confirmation_count <> 2
      then
        raise exception 'A completed TradeOffer requires exactly one confirmation from each participant.'
          using errcode = '23514';
      end if;

      if completion_count <> 1 then
        raise exception 'A completed TradeOffer requires exactly one TradeCompletion.'
          using errcode = '23514';
      end if;

      select pg_catalog.count(*)::integer
      into commitment_count
      from public.copy_commercial_commitments as commitment
      where commitment.trade_offer_id = subject_trade_offer_id;

      if commitment_count <> 0 then
        raise exception 'A completed TradeOffer must hold no Copy commercial commitment.'
          using errcode = '23514';
      end if;

      select pg_catalog.count(*)::integer
      into untransferred_count
      from public.trade_offer_copies as membership
      join public.copies as copy on copy.id = membership.copy_id
      where membership.trade_offer_id = subject_trade_offer_id
        and copy.owner_id is distinct from case membership.side
          when 'proposer' then subject_offer.recipient_id
          else subject_offer.proposer_id
        end;

      if untransferred_count <> 0 then
        raise exception 'A completed TradeOffer must have transferred every included Copy.'
          using errcode = '23514';
      end if;
    elsif subject_offer.status = 'accepted' then
      if completion_count <> 0 then
        raise exception 'Only a completed TradeOffer may have a TradeCompletion.'
          using errcode = '23514';
      end if;

      if confirmation_count > 1 then
        raise exception 'Two TradeCompletion confirmations must complete the TradeOffer.'
          using errcode = '23514';
      end if;
    else
      if confirmation_count <> 0 then
        raise exception 'Only an accepted or completed TradeOffer may hold completion confirmations.'
          using errcode = '23514';
      end if;

      if completion_count <> 0 then
        raise exception 'Only a completed TradeOffer may have a TradeCompletion.'
          using errcode = '23514';
      end if;
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function public.validate_trade_completion_integrity()
from public, anon, authenticated;

create constraint trigger trade_offers_validate_completion_integrity
after insert or update on public.trade_offers
deferrable initially deferred
for each row
execute function public.validate_trade_completion_integrity();

create constraint trigger trade_completion_confirmations_validate_integrity
after insert or update or delete on public.trade_completion_confirmations
deferrable initially deferred
for each row
execute function public.validate_trade_completion_integrity();

create constraint trigger trade_completions_validate_integrity
after insert or update or delete on public.trade_completions
deferrable initially deferred
for each row
execute function public.validate_trade_completion_integrity();

create function public.confirm_trade_completion(target_trade_offer_id uuid)
returns table (
  trade_offer_id uuid,
  completed boolean,
  caller_confirmed_at timestamptz,
  counterpart_confirmed boolean,
  trade_completion_id uuid,
  completed_at timestamptz
)
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
  membership_count integer;
  proposer_side_count integer;
  recipient_side_count integer;
  commitment_count integer;
  counterpart_user_id uuid;
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

  if caller_user_id not in (
    preliminary_offer.proposer_id,
    preliminary_offer.recipient_id
  ) then
    raise exception 'Only a TradeOffer participant may confirm the exchange.'
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

  select
    pg_catalog.array_agg(membership.copy_id order by membership.copy_id),
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where membership.side = 'proposer'
    )::integer,
    pg_catalog.count(*) filter (
      where membership.side = 'recipient'
    )::integer
  into
    locked_copy_ids,
    membership_count,
    proposer_side_count,
    recipient_side_count
  from public.trade_offer_copies as membership
  where membership.trade_offer_id = locked_offer.id;

  if locked_copy_ids is distinct from preliminary_copy_ids then
    raise exception 'TradeOffer Copy terms changed during confirmation.'
      using errcode = '40001';
  end if;

  if caller_user_id not in (
    locked_offer.proposer_id,
    locked_offer.recipient_id
  ) then
    raise exception 'Only a TradeOffer participant may confirm the exchange.'
      using errcode = '42501';
  end if;

  if caller_user_id = locked_offer.proposer_id then
    counterpart_user_id := locked_offer.recipient_id;
  else
    counterpart_user_id := locked_offer.proposer_id;
  end if;

  decision_at := pg_catalog.clock_timestamp();

  if locked_offer.status = 'completed' then
    select confirmation.confirmed_at
    into caller_confirmed_at
    from public.trade_completion_confirmations as confirmation
    where confirmation.trade_offer_id = locked_offer.id
      and confirmation.user_id = caller_user_id;

    if not found then
      raise exception 'TradeOffer completion state is inconsistent.'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.trade_completion_confirmations as confirmation
      where confirmation.trade_offer_id = locked_offer.id
        and confirmation.user_id = counterpart_user_id
    ) then
      raise exception 'TradeOffer completion state is inconsistent.'
        using errcode = '23514';
    end if;

    select completion.id, completion.completed_at
    into trade_completion_id, completed_at
    from public.trade_completions as completion
    where completion.trade_offer_id = locked_offer.id;

    if not found then
      raise exception 'TradeOffer completion state is inconsistent.'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.copy_commercial_commitments as commitment
      where commitment.trade_offer_id = locked_offer.id
    ) then
      raise exception 'TradeOffer completion state is inconsistent.'
        using errcode = '23514';
    end if;

    trade_offer_id := locked_offer.id;
    completed := true;
    counterpart_confirmed := true;
    return next;
    return;
  end if;

  if locked_offer.status <> 'accepted' then
    raise exception 'Only an accepted TradeOffer may be confirmed.'
      using errcode = '23514';
  end if;

  insert into public.trade_completion_confirmations (
    trade_offer_id,
    user_id,
    confirmed_at
  ) values (
    locked_offer.id,
    caller_user_id,
    decision_at
  )
  on conflict on constraint trade_completion_confirmations_primary_key
  do nothing;

  select confirmation.confirmed_at
  into caller_confirmed_at
  from public.trade_completion_confirmations as confirmation
  where confirmation.trade_offer_id = locked_offer.id
    and confirmation.user_id = caller_user_id;

  if not found then
    raise exception 'Confirmation could not be recorded. Retry the operation.'
      using errcode = '40001';
  end if;

  counterpart_confirmed := exists (
    select 1
    from public.trade_completion_confirmations as confirmation
    where confirmation.trade_offer_id = locked_offer.id
      and confirmation.user_id = counterpart_user_id
  );

  trade_offer_id := locked_offer.id;

  if not counterpart_confirmed then
    completed := false;
    return next;
    return;
  end if;

  if proposer_side_count = 0 or recipient_side_count = 0 then
    raise exception 'A TradeOffer must contain at least one Copy on each side.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.trade_offer_copies as membership
    join public.copies as copy on copy.id = membership.copy_id
    where membership.trade_offer_id = locked_offer.id
      and copy.owner_id is distinct from case membership.side
        when 'proposer' then locked_offer.proposer_id
        else locked_offer.recipient_id
      end
  ) then
    raise exception 'Every included Copy must still be owned by the participant who offered it.'
      using errcode = '23514';
  end if;

  select pg_catalog.count(*)::integer
  into commitment_count
  from public.copy_commercial_commitments as commitment
  where commitment.kind = 'trade_offer'
    and commitment.trade_offer_id = locked_offer.id;

  if commitment_count <> membership_count then
    raise exception 'An accepted TradeOffer must reserve every included Copy.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.trade_offer_copies as membership
    left join public.copy_commercial_commitments as commitment
      on commitment.copy_id = membership.copy_id
    where membership.trade_offer_id = locked_offer.id
      and (
        commitment.copy_id is null
        or commitment.kind <> 'trade_offer'
        or commitment.trade_offer_id is distinct from locked_offer.id
      )
  ) then
    raise exception 'Every included Copy must be reserved by this TradeOffer.'
      using errcode = '23514';
  end if;

  delete from public.copy_commercial_commitments as commitment
  where commitment.kind = 'trade_offer'
    and commitment.trade_offer_id = locked_offer.id;

  update public.trade_offers as offer
  set status = 'completed'
  where offer.id = locked_offer.id;

  update public.copies as copy
  set owner_id = locked_offer.recipient_id,
      visibility = 'private',
      trade_availability = 'not_open'
  where copy.id in (
    select membership.copy_id
    from public.trade_offer_copies as membership
    where membership.trade_offer_id = locked_offer.id
      and membership.side = 'proposer'
  );

  update public.copies as copy
  set owner_id = locked_offer.proposer_id,
      visibility = 'private',
      trade_availability = 'not_open'
  where copy.id in (
    select membership.copy_id
    from public.trade_offer_copies as membership
    where membership.trade_offer_id = locked_offer.id
      and membership.side = 'recipient'
  );

  insert into public.trade_completions (
    trade_offer_id,
    completed_at
  ) values (
    locked_offer.id,
    decision_at
  )
  returning id into trade_completion_id;

  completed_at := decision_at;
  completed := true;
  return next;
end;
$$;

revoke all on function public.confirm_trade_completion(uuid)
from public, anon, authenticated;
grant execute on function public.confirm_trade_completion(uuid) to authenticated;

alter table public.trade_completion_confirmations enable row level security;
alter table public.trade_completions enable row level security;

revoke all privileges on table public.trade_completion_confirmations
from anon, authenticated;
revoke all privileges on table public.trade_completions
from anon, authenticated;

grant select on table public.trade_completion_confirmations to authenticated;
grant select on table public.trade_completions to authenticated;

grant all privileges on table public.trade_completion_confirmations
to service_role;
grant all privileges on table public.trade_completions to service_role;

create policy trade_completion_confirmations_participant_read
on public.trade_completion_confirmations
for select
to authenticated
using (
  exists (
    select 1
    from public.trade_offers as parent_offer
    where parent_offer.id = trade_completion_confirmations.trade_offer_id
      and (
        parent_offer.proposer_id = (select auth.uid())
        or parent_offer.recipient_id = (select auth.uid())
      )
  )
);

create policy trade_completions_participant_read
on public.trade_completions
for select
to authenticated
using (
  exists (
    select 1
    from public.trade_offers as parent_offer
    where parent_offer.id = trade_completions.trade_offer_id
      and (
        parent_offer.proposer_id = (select auth.uid())
        or parent_offer.recipient_id = (select auth.uid())
      )
  )
);
