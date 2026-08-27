create or replace function public.create_auction(
  request_auction_id uuid,
  target_copy_id uuid,
  requested_starting_amount_minor bigint
)
returns table (
  auction_id uuid,
  copy_id uuid,
  seller_id uuid,
  starting_amount_minor bigint,
  currency text,
  min_increment_minor bigint,
  local_pickup boolean,
  shipping_available boolean,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  current_amount_minor bigint,
  bid_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  copy_owner_id uuid;
  existing_auction public.auctions%rowtype;
  existing_auction_found boolean := false;
  canonical_starts_at timestamptz;
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if request_auction_id is null
    or target_copy_id is null
    or requested_starting_amount_minor is null
    or requested_starting_amount_minor < 0
    or requested_starting_amount_minor > 9007199254740991
  then
    raise exception 'Auction creation input is invalid.' using errcode = '22023';
  end if;

  -- A committed request may be retried after its response was lost. Resolve it
  -- before re-checking current ownership because the canonical Auction may have
  -- legitimately become historical since the original request.
  select auction.*
  into existing_auction
  from public.auctions as auction
  where auction.id = request_auction_id;

  existing_auction_found := found;

  if not existing_auction_found then
    -- The Copy is the repository-wide serialization boundary for commercial
    -- commitment establishment and ownership transfer.
    select copy.owner_id
    into copy_owner_id
    from public.copies as copy
    where copy.id = target_copy_id
    for update;

    if not found then
      raise exception 'Copy does not exist.' using errcode = 'P0002';
    end if;

    if copy_owner_id is distinct from caller_user_id then
      raise exception 'Auction seller must own the referenced Copy.' using errcode = '42501';
    end if;

    -- A concurrent retry with the same request identity may have committed
    -- while this transaction waited on the Copy lock.
    select auction.*
    into existing_auction
    from public.auctions as auction
    where auction.id = request_auction_id
    for update;

    existing_auction_found := found;
  end if;

  if existing_auction_found then
    if existing_auction.seller_id is distinct from caller_user_id
      or existing_auction.copy_id is distinct from target_copy_id
      or existing_auction.starting_amount_minor is distinct from requested_starting_amount_minor
      or existing_auction.currency is distinct from 'EUR'
      or existing_auction.min_increment_minor is distinct from 100
      or existing_auction.local_pickup is distinct from true
      or existing_auction.shipping_available is distinct from false
      or existing_auction.status = 'draft'
      or existing_auction.starts_at is null
      or existing_auction.ends_at is distinct from existing_auction.starts_at + interval '7 days'
    then
      raise exception 'Auction request identity conflicts with an existing Auction.'
        using errcode = '23505';
    end if;

    return query
    select
      auction.id,
      auction.copy_id,
      auction.seller_id,
      auction.starting_amount_minor,
      auction.currency,
      auction.min_increment_minor,
      auction.local_pickup,
      auction.shipping_available,
      auction.status,
      auction.starts_at,
      auction.ends_at,
      auction.current_amount_minor,
      auction.bid_count,
      auction.created_at,
      auction.updated_at
    from public.auctions as auction
    where auction.id = request_auction_id;
    return;
  end if;

  if exists (
    select 1
    from public.copy_commercial_commitments as commitment
    where commitment.copy_id = target_copy_id
  ) then
    raise exception 'Copy already has an open commercial commitment.' using errcode = '23514';
  end if;

  canonical_starts_at := pg_catalog.transaction_timestamp();

  insert into public.auctions (
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
    ends_at
  )
  values (
    request_auction_id,
    target_copy_id,
    caller_user_id,
    requested_starting_amount_minor,
    'EUR',
    100,
    true,
    false,
    'scheduled',
    canonical_starts_at,
    canonical_starts_at + interval '7 days'
  );

  return query
  select
    auction.id,
    auction.copy_id,
    auction.seller_id,
    auction.starting_amount_minor,
    auction.currency,
    auction.min_increment_minor,
    auction.local_pickup,
    auction.shipping_available,
    auction.status,
    auction.starts_at,
    auction.ends_at,
    auction.current_amount_minor,
    auction.bid_count,
    auction.created_at,
    auction.updated_at
  from public.auctions as auction
  where auction.id = request_auction_id;
end;
$$;

revoke all on function public.create_auction(uuid, uuid, bigint)
from public, anon, authenticated;

grant execute on function public.create_auction(uuid, uuid, bigint)
to authenticated;
