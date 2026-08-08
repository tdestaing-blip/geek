create table public.auctions (
  id uuid primary key default gen_random_uuid(),
  copy_id uuid not null,
  seller_id uuid not null,
  starting_amount_minor bigint not null,
  currency text not null,
  min_increment_minor bigint not null,
  local_pickup boolean not null default true,
  shipping_available boolean not null default false,
  status text not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  current_amount_minor bigint,
  bid_count integer not null default 0,
  leading_bid_id uuid,
  winning_bid_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auctions_copy_id_foreign_key foreign key (copy_id)
    references public.copies (id) on delete restrict,
  constraint auctions_seller_id_foreign_key foreign key (seller_id)
    references public.profiles (id) on delete restrict,
  constraint auctions_starting_amount_nonnegative check (
    starting_amount_minor >= 0
  ),
  constraint auctions_min_increment_positive check (min_increment_minor > 0),
  constraint auctions_currency_format check (
    currency ~ '^[ABCDEFGHIJKLMNOPQRSTUVWXYZ]{3}$'
  ),
  constraint auctions_bid_count_nonnegative check (bid_count >= 0),
  constraint auctions_current_amount_nonnegative check (
    current_amount_minor is null or current_amount_minor >= 0
  ),
  constraint auctions_status_allowed check (
    status in ('draft', 'scheduled', 'won', 'ended', 'cancelled', 'sold')
  ),
  constraint auctions_scheduled_requirements check (
    status <> 'scheduled'
    or (
      starts_at is not null
      and ends_at is not null
      and ends_at > starts_at
      and (local_pickup or shipping_available)
    )
  ),
  constraint auctions_won_requirements check (
    status <> 'won'
    or (winning_bid_id is not null and (local_pickup or shipping_available))
  ),
  constraint auctions_empty_bid_amount check (
    bid_count <> 0 or current_amount_minor is null
  ),
  constraint auctions_id_copy_id_unique unique (id, copy_id)
);

create index auctions_copy_id_index on public.auctions (copy_id);
create index auctions_seller_id_index on public.auctions (seller_id);
create index auctions_status_index on public.auctions (status);
create index auctions_starts_at_index on public.auctions (starts_at);
create index auctions_ends_at_index on public.auctions (ends_at);
create index auctions_status_starts_at_ends_at_index
on public.auctions (status, starts_at, ends_at);
create index auctions_shipping_available_index
on public.auctions (shipping_available);
create index auctions_local_pickup_index on public.auctions (local_pickup);
create index auctions_current_amount_minor_index
on public.auctions (current_amount_minor);

create trigger auctions_set_updated_at
before update on public.auctions
for each row execute function public.set_updated_at();

create table public.auction_private_details (
  auction_id uuid primary key
    references public.auctions (id) on delete cascade,
  reserve_amount_minor bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auction_private_details_reserve_nonnegative check (
    reserve_amount_minor is null or reserve_amount_minor >= 0
  )
);

create trigger auction_private_details_set_updated_at
before update on public.auction_private_details
for each row execute function public.set_updated_at();

create table public.auction_bids (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null,
  bidder_id uuid not null,
  amount_minor bigint not null,
  created_at timestamptz not null default now(),
  constraint auction_bids_auction_id_foreign_key foreign key (auction_id)
    references public.auctions (id) on delete restrict,
  constraint auction_bids_bidder_id_foreign_key foreign key (bidder_id)
    references public.profiles (id) on delete restrict,
  constraint auction_bids_amount_nonnegative check (amount_minor >= 0),
  constraint auction_bids_id_auction_id_unique unique (id, auction_id)
);

create index auction_bids_auction_id_created_at_index
on public.auction_bids (auction_id, created_at);
create index auction_bids_bidder_id_created_at_index
on public.auction_bids (bidder_id, created_at);

alter table public.auctions
add constraint auctions_leading_bid_foreign_key foreign key (
  leading_bid_id,
  id
) references public.auction_bids (id, auction_id) on delete restrict,
add constraint auctions_winning_bid_foreign_key foreign key (
  winning_bid_id,
  id
) references public.auction_bids (id, auction_id) on delete restrict;

create function public.validate_auction_copy_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  referenced_owner_id uuid;
  ownership_validation_required boolean := false;
  copy_lock_required boolean := false;
begin
  if tg_op = 'INSERT' then
    ownership_validation_required := true;
    copy_lock_required := true;
  else
    ownership_validation_required :=
      new.copy_id is distinct from old.copy_id
      or new.seller_id is distinct from old.seller_id
      or new.status in ('draft', 'scheduled', 'won')
      or (old.status = 'draft' and new.status = 'cancelled');

    copy_lock_required := ownership_validation_required
      or old.status in ('scheduled', 'won')
      or new.status in ('scheduled', 'won');
  end if;

  if not copy_lock_required then
    return new;
  end if;

  select referenced_copy.owner_id
  into referenced_owner_id
  from public.copies as referenced_copy
  where referenced_copy.id = new.copy_id
  for update;

  if ownership_validation_required
    and referenced_owner_id is distinct from new.seller_id then
    raise exception 'Auction seller must own the referenced Copy.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_auction_copy_ownership()
from public, anon, authenticated;

create trigger auctions_validate_copy_ownership
before insert or update on public.auctions
for each row execute function public.validate_auction_copy_ownership();

create function public.validate_auction_private_details()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  referenced_auction public.auctions%rowtype;
  referenced_owner_id uuid;
  referenced_auction_id uuid;
begin
  if tg_op = 'DELETE' then
    referenced_auction_id := old.auction_id;
  else
    referenced_auction_id := new.auction_id;
  end if;

  select auction.*
  into referenced_auction
  from public.auctions as auction
  where auction.id = referenced_auction_id
  for update;

  if not found then
    raise exception 'Referenced Auction does not exist.' using errcode = '23503';
  end if;

  select referenced_copy.owner_id
  into referenced_owner_id
  from public.copies as referenced_copy
  where referenced_copy.id = referenced_auction.copy_id
  for update;

  if referenced_auction.status <> 'draft'
    or referenced_owner_id is distinct from referenced_auction.seller_id then
    raise exception 'Auction reserve may be edited only for a currently-owned draft Auction.'
      using errcode = '23514';
  end if;

  if tg_op <> 'DELETE'
    and new.reserve_amount_minor is not null
    and new.reserve_amount_minor < referenced_auction.starting_amount_minor then
    raise exception 'Auction reserve must be at least the starting amount.'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_auction_private_details()
from public, anon, authenticated;

create trigger auction_private_details_validate
before insert or update or delete on public.auction_private_details
for each row execute function public.validate_auction_private_details();

create function public.validate_auction_starting_amount_against_reserve()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  existing_reserve_amount bigint;
begin
  if new.starting_amount_minor is not distinct from old.starting_amount_minor then
    return new;
  end if;

  select private_details.reserve_amount_minor
  into existing_reserve_amount
  from public.auction_private_details as private_details
  where private_details.auction_id = new.id;

  if existing_reserve_amount is not null
    and existing_reserve_amount < new.starting_amount_minor then
    raise exception 'Auction reserve must be at least the starting amount.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_auction_starting_amount_against_reserve()
from public, anon, authenticated;

create trigger auctions_validate_reserve_floor
before update of starting_amount_minor on public.auctions
for each row
execute function public.validate_auction_starting_amount_against_reserve();

alter table public.listings
add constraint listings_id_copy_id_unique unique (id, copy_id);

create table public.copy_commercial_commitments (
  copy_id uuid primary key
    references public.copies (id) on delete restrict,
  kind text not null,
  listing_id uuid,
  auction_id uuid,
  created_at timestamptz not null default now(),
  constraint copy_commercial_commitments_kind_allowed check (
    kind in ('listing', 'auction')
  ),
  constraint copy_commercial_commitments_source check (
    (
      kind = 'listing'
      and listing_id is not null
      and auction_id is null
    )
    or (
      kind = 'auction'
      and auction_id is not null
      and listing_id is null
    )
  ),
  constraint copy_commercial_commitments_listing_unique unique (listing_id),
  constraint copy_commercial_commitments_auction_unique unique (auction_id),
  constraint copy_commercial_commitments_listing_copy_foreign_key foreign key (
    listing_id,
    copy_id
  ) references public.listings (id, copy_id) on delete restrict,
  constraint copy_commercial_commitments_auction_copy_foreign_key foreign key (
    auction_id,
    copy_id
  ) references public.auctions (id, copy_id) on delete restrict
);

create function public.sync_listing_commercial_commitment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_holds_commitment boolean := false;
  new_holds_commitment boolean;
begin
  if tg_op = 'UPDATE' then
    old_holds_commitment := old.status in ('active', 'reserved');
  end if;

  new_holds_commitment := new.status in ('active', 'reserved');

  if new_holds_commitment and not old_holds_commitment then
    insert into public.copy_commercial_commitments (
      copy_id,
      kind,
      listing_id
    ) values (
      new.copy_id,
      'listing',
      new.id
    );
  elsif new_holds_commitment then
    perform 1
    from public.copy_commercial_commitments as commitment
    where commitment.copy_id = new.copy_id
      and commitment.kind = 'listing'
      and commitment.listing_id = new.id;

    if not found then
      raise exception 'Listing commercial commitment is inconsistent.'
        using errcode = '23514';
    end if;
  elsif old_holds_commitment then
    delete from public.copy_commercial_commitments as commitment
    where commitment.copy_id = old.copy_id
      and commitment.kind = 'listing'
      and commitment.listing_id = old.id;

    if not found then
      raise exception 'Listing commercial commitment is inconsistent.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_listing_commercial_commitment()
from public, anon, authenticated;

create trigger listings_sync_commercial_commitment
after insert or update of status on public.listings
for each row execute function public.sync_listing_commercial_commitment();

create function public.sync_auction_commercial_commitment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_holds_commitment boolean := false;
  new_holds_commitment boolean;
begin
  if tg_op = 'UPDATE' then
    old_holds_commitment := old.status in ('scheduled', 'won');
  end if;

  new_holds_commitment := new.status in ('scheduled', 'won');

  if new_holds_commitment and not old_holds_commitment then
    insert into public.copy_commercial_commitments (
      copy_id,
      kind,
      auction_id
    ) values (
      new.copy_id,
      'auction',
      new.id
    );
  elsif new_holds_commitment then
    perform 1
    from public.copy_commercial_commitments as commitment
    where commitment.copy_id = new.copy_id
      and commitment.kind = 'auction'
      and commitment.auction_id = new.id;

    if not found then
      raise exception 'Auction commercial commitment is inconsistent.'
        using errcode = '23514';
    end if;
  elsif old_holds_commitment then
    delete from public.copy_commercial_commitments as commitment
    where commitment.copy_id = old.copy_id
      and commitment.kind = 'auction'
      and commitment.auction_id = old.id;

    if not found then
      raise exception 'Auction commercial commitment is inconsistent.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_auction_commercial_commitment()
from public, anon, authenticated;

create trigger auctions_sync_commercial_commitment
after insert or update of status on public.auctions
for each row execute function public.sync_auction_commercial_commitment();

insert into public.copy_commercial_commitments (copy_id, kind, listing_id)
select listing.copy_id, 'listing', listing.id
from public.listings as listing
where listing.status in ('active', 'reserved');

create or replace function public.validate_listing_copy_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  referenced_owner_id uuid;
  ownership_validation_required boolean := false;
  copy_lock_required boolean := false;
begin
  if tg_op = 'INSERT' then
    ownership_validation_required := true;
    copy_lock_required := true;
  else
    ownership_validation_required :=
      new.copy_id is distinct from old.copy_id
      or new.seller_id is distinct from old.seller_id
      or new.status in ('draft', 'active', 'paused', 'withdrawn', 'reserved');

    copy_lock_required := ownership_validation_required
      or old.status in ('active', 'reserved')
      or new.status in ('active', 'reserved');
  end if;

  if not copy_lock_required then
    return new;
  end if;

  select referenced_copy.owner_id
  into referenced_owner_id
  from public.copies as referenced_copy
  where referenced_copy.id = new.copy_id
  for update;

  if ownership_validation_required
    and referenced_owner_id is distinct from new.seller_id then
    raise exception 'Listing seller must own the referenced Copy.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger copies_prevent_open_listing_ownership_transfer on public.copies;
drop function public.prevent_open_listing_copy_ownership_transfer();

create function public.prevent_committed_copy_ownership_transfer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id
    and exists (
      select 1
      from public.copy_commercial_commitments as commitment
      where commitment.copy_id = old.id
    ) then
    raise exception 'Copy ownership cannot transfer while it has an open commercial commitment.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_committed_copy_ownership_transfer()
from public, anon, authenticated;

create trigger copies_prevent_committed_ownership_transfer
before update of owner_id on public.copies
for each row execute function public.prevent_committed_copy_ownership_transfer();

create function public.place_auction_bid(
  target_auction_id uuid,
  bid_amount_minor bigint
)
returns table (
  bid_id uuid,
  auction_id uuid,
  accepted_amount_minor bigint,
  current_amount_minor bigint,
  bid_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  target_auction public.auctions%rowtype;
  current_copy_owner_id uuid;
  required_amount_minor bigint;
  accepted_bid_id uuid;
  accepted_bid_created_at timestamptz;
  accepted_at timestamptz := clock_timestamp();
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select auction.*
  into target_auction
  from public.auctions as auction
  where auction.id = target_auction_id
  for update;

  if not found then
    raise exception 'Auction does not exist.' using errcode = 'P0002';
  end if;

  if target_auction.status <> 'scheduled' then
    raise exception 'Auction is not scheduled.' using errcode = '23514';
  end if;

  if target_auction.starts_at is null
    or target_auction.ends_at is null
    or target_auction.starts_at > accepted_at
    or accepted_at >= target_auction.ends_at then
    raise exception 'Auction is not currently accepting Bids.'
      using errcode = '23514';
  end if;

  if target_auction.seller_id = caller_user_id then
    raise exception 'Auction seller cannot bid on their own Auction.'
      using errcode = '23514';
  end if;

  select referenced_copy.owner_id
  into current_copy_owner_id
  from public.copies as referenced_copy
  where referenced_copy.id = target_auction.copy_id;

  if current_copy_owner_id is distinct from target_auction.seller_id then
    raise exception 'Auction seller must own the referenced Copy.'
      using errcode = '23514';
  end if;

  if target_auction.bid_count = 0 then
    required_amount_minor := target_auction.starting_amount_minor;
  else
    required_amount_minor :=
      target_auction.current_amount_minor + target_auction.min_increment_minor;
  end if;

  if bid_amount_minor < required_amount_minor then
    raise exception 'Bid does not meet the required minimum amount.'
      using errcode = '23514';
  end if;

  insert into public.auction_bids (
    auction_id,
    bidder_id,
    amount_minor,
    created_at
  ) values (
    target_auction.id,
    caller_user_id,
    bid_amount_minor,
    accepted_at
  )
  returning id, auction_bids.created_at
  into accepted_bid_id, accepted_bid_created_at;

  update public.auctions
  set current_amount_minor = bid_amount_minor,
      bid_count = target_auction.bid_count + 1,
      leading_bid_id = accepted_bid_id
  where id = target_auction.id;

  return query
  select
    accepted_bid_id,
    target_auction.id,
    bid_amount_minor,
    bid_amount_minor,
    target_auction.bid_count + 1,
    accepted_bid_created_at;
end;
$$;

revoke all on function public.place_auction_bid(uuid, bigint)
from public, anon, authenticated;
grant execute on function public.place_auction_bid(uuid, bigint)
to authenticated;

create function public.finalize_auction(target_auction_id uuid)
returns public.auctions
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_auction public.auctions%rowtype;
  reserve_amount_minor bigint;
  finalized_auction public.auctions%rowtype;
  finalized_at timestamptz := clock_timestamp();
begin
  select auction.*
  into target_auction
  from public.auctions as auction
  where auction.id = target_auction_id
  for update;

  if not found then
    raise exception 'Auction does not exist.' using errcode = 'P0002';
  end if;

  if target_auction.status <> 'scheduled' then
    raise exception 'Auction is not scheduled.' using errcode = '23514';
  end if;

  if target_auction.ends_at is null or finalized_at < target_auction.ends_at then
    raise exception 'Auction bidding window has not ended.' using errcode = '23514';
  end if;

  select private_details.reserve_amount_minor
  into reserve_amount_minor
  from public.auction_private_details as private_details
  where private_details.auction_id = target_auction.id;

  if target_auction.bid_count = 0
    or (
      reserve_amount_minor is not null
      and target_auction.current_amount_minor < reserve_amount_minor
    ) then
    update public.auctions
    set status = 'ended',
        winning_bid_id = null
    where id = target_auction.id
    returning * into finalized_auction;
  else
    update public.auctions
    set status = 'won',
        winning_bid_id = target_auction.leading_bid_id
    where id = target_auction.id
    returning * into finalized_auction;
  end if;

  return finalized_auction;
end;
$$;

revoke all on function public.finalize_auction(uuid)
from public, anon, authenticated;
grant execute on function public.finalize_auction(uuid) to service_role;

alter table public.auctions enable row level security;
alter table public.auction_private_details enable row level security;
alter table public.auction_bids enable row level security;
alter table public.copy_commercial_commitments enable row level security;

revoke all privileges on table public.auctions from anon, authenticated;
revoke all privileges on table public.auction_private_details
from anon, authenticated;
revoke all privileges on table public.auction_bids from anon, authenticated;
revoke all privileges on table public.copy_commercial_commitments
from anon, authenticated;

grant select (
  id,
  copy_id,
  seller_id,
  starting_amount_minor,
  currency,
  min_increment_minor,
  local_pickup,
  shipping_available,
  status,
  starts_at,
  ends_at,
  current_amount_minor,
  bid_count,
  created_at,
  updated_at
)
on table public.auctions to anon, authenticated;

grant insert (
  copy_id,
  seller_id,
  starting_amount_minor,
  currency,
  min_increment_minor,
  local_pickup,
  shipping_available,
  status,
  starts_at,
  ends_at
)
on table public.auctions to authenticated;

grant update (
  starting_amount_minor,
  currency,
  min_increment_minor,
  local_pickup,
  shipping_available,
  status,
  starts_at,
  ends_at
)
on table public.auctions to authenticated;

grant select on table public.auction_private_details to authenticated;
grant insert (auction_id, reserve_amount_minor)
on table public.auction_private_details to authenticated;
grant update (reserve_amount_minor)
on table public.auction_private_details to authenticated;
grant delete on table public.auction_private_details to authenticated;

grant select on table public.auction_bids to authenticated;

grant all privileges on table public.auctions to service_role;
grant all privileges on table public.auction_private_details to service_role;
grant all privileges on table public.auction_bids to service_role;
grant all privileges on table public.copy_commercial_commitments to service_role;

create policy auctions_anonymous_read_scheduled
on public.auctions
for select
to anon
using (status = 'scheduled');

create policy auctions_authenticated_read_visible
on public.auctions
for select
to authenticated
using (status = 'scheduled' or seller_id = (select auth.uid()));

create policy auctions_insert_own_draft
on public.auctions
for insert
to authenticated
with check (
  seller_id = (select auth.uid())
  and status = 'draft'
  and exists (
    select 1
    from public.copies
    where copies.id = auctions.copy_id
      and copies.owner_id = (select auth.uid())
  )
);

create policy auctions_update_own_draft
on public.auctions
for update
to authenticated
using (
  seller_id = (select auth.uid())
  and status = 'draft'
  and exists (
    select 1
    from public.copies
    where copies.id = auctions.copy_id
      and copies.owner_id = (select auth.uid())
  )
)
with check (
  seller_id = (select auth.uid())
  and status in ('draft', 'scheduled', 'cancelled')
  and exists (
    select 1
    from public.copies
    where copies.id = auctions.copy_id
      and copies.owner_id = (select auth.uid())
  )
);

create policy auction_private_details_read_own
on public.auction_private_details
for select
to authenticated
using (
  exists (
    select 1
    from public.auctions
    where auctions.id = auction_private_details.auction_id
      and auctions.seller_id = (select auth.uid())
  )
);

create policy auction_private_details_insert_own_draft
on public.auction_private_details
for insert
to authenticated
with check (
  exists (
    select 1
    from public.auctions
    join public.copies on copies.id = auctions.copy_id
    where auctions.id = auction_private_details.auction_id
      and auctions.seller_id = (select auth.uid())
      and auctions.status = 'draft'
      and copies.owner_id = (select auth.uid())
  )
);

create policy auction_private_details_update_own_draft
on public.auction_private_details
for update
to authenticated
using (
  exists (
    select 1
    from public.auctions
    join public.copies on copies.id = auctions.copy_id
    where auctions.id = auction_private_details.auction_id
      and auctions.seller_id = (select auth.uid())
      and auctions.status = 'draft'
      and copies.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.auctions
    join public.copies on copies.id = auctions.copy_id
    where auctions.id = auction_private_details.auction_id
      and auctions.seller_id = (select auth.uid())
      and auctions.status = 'draft'
      and copies.owner_id = (select auth.uid())
  )
);

create policy auction_private_details_delete_own_draft
on public.auction_private_details
for delete
to authenticated
using (
  exists (
    select 1
    from public.auctions
    join public.copies on copies.id = auctions.copy_id
    where auctions.id = auction_private_details.auction_id
      and auctions.seller_id = (select auth.uid())
      and auctions.status = 'draft'
      and copies.owner_id = (select auth.uid())
  )
);

create policy auction_bids_read_own
on public.auction_bids
for select
to authenticated
using (bidder_id = (select auth.uid()));
