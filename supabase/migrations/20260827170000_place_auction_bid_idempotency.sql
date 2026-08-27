revoke all on function public.place_auction_bid(uuid, bigint)
from public, anon, authenticated;

drop function public.place_auction_bid(uuid, bigint);

create function public.place_auction_bid(
  request_bid_id uuid,
  target_auction_id uuid,
  bid_amount_minor bigint
)
returns table (
  result_code text,
  bid_id uuid,
  auction_id uuid,
  accepted_amount_minor bigint,
  current_amount_minor bigint,
  bid_count integer,
  min_increment_minor bigint,
  minimum_bid_minor bigint,
  currency text,
  ends_at timestamptz,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  target_auction public.auctions%rowtype;
  existing_bid public.auction_bids%rowtype;
  current_copy_owner_id uuid;
  required_amount_minor bigint;
  decision_at timestamptz;
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if request_bid_id is null
    or target_auction_id is null
    or bid_amount_minor is null
    or bid_amount_minor < 0
    or bid_amount_minor > 9007199254740991
  then
    raise exception 'Bid input is invalid.' using errcode = '22023';
  end if;

  -- A committed Bid must remain retryable after later Bids or lifecycle
  -- transitions. Resolve the stable request identity before validating the
  -- Auction's current state.
  select bid.*
  into existing_bid
  from public.auction_bids as bid
  where bid.id = request_bid_id;

  if found then
    if existing_bid.bidder_id is distinct from caller_user_id
      or existing_bid.auction_id is distinct from target_auction_id
      or existing_bid.amount_minor is distinct from bid_amount_minor
    then
      raise exception 'Bid request identity conflicts with an existing Bid.'
        using errcode = '23505';
    end if;

    select auction.*
    into strict target_auction
    from public.auctions as auction
    where auction.id = existing_bid.auction_id;

    required_amount_minor := case
      when target_auction.bid_count = 0 then target_auction.starting_amount_minor
      else target_auction.current_amount_minor + target_auction.min_increment_minor
    end;

    return query
    select
      'accepted'::text,
      existing_bid.id,
      existing_bid.auction_id,
      existing_bid.amount_minor,
      coalesce(target_auction.current_amount_minor, target_auction.starting_amount_minor),
      target_auction.bid_count,
      target_auction.min_increment_minor,
      required_amount_minor,
      target_auction.currency,
      target_auction.ends_at,
      target_auction.status,
      existing_bid.created_at;
    return;
  end if;

  -- Auction locking serializes all genuinely new Bid decisions.
  select auction.*
  into target_auction
  from public.auctions as auction
  where auction.id = target_auction_id
  for update;

  decision_at := pg_catalog.clock_timestamp();

  if not found then
    raise exception 'Auction does not exist.' using errcode = 'P0002';
  end if;

  -- A concurrent retry may have committed while this transaction waited for
  -- the Auction lock.
  select bid.*
  into existing_bid
  from public.auction_bids as bid
  where bid.id = request_bid_id;

  if found then
    if existing_bid.bidder_id is distinct from caller_user_id
      or existing_bid.auction_id is distinct from target_auction_id
      or existing_bid.amount_minor is distinct from bid_amount_minor
    then
      raise exception 'Bid request identity conflicts with an existing Bid.'
        using errcode = '23505';
    end if;

    required_amount_minor := case
      when target_auction.bid_count = 0 then target_auction.starting_amount_minor
      else target_auction.current_amount_minor + target_auction.min_increment_minor
    end;

    return query
    select
      'accepted'::text,
      existing_bid.id,
      existing_bid.auction_id,
      existing_bid.amount_minor,
      coalesce(target_auction.current_amount_minor, target_auction.starting_amount_minor),
      target_auction.bid_count,
      target_auction.min_increment_minor,
      required_amount_minor,
      target_auction.currency,
      target_auction.ends_at,
      target_auction.status,
      existing_bid.created_at;
    return;
  end if;

  if target_auction.bid_count > 0 and target_auction.current_amount_minor is null then
    raise exception 'Auction bid aggregate is inconsistent.' using errcode = '23514';
  end if;

  required_amount_minor := case
    when target_auction.bid_count = 0 then target_auction.starting_amount_minor
    else target_auction.current_amount_minor + target_auction.min_increment_minor
  end;

  if target_auction.seller_id = caller_user_id then
    return query
    select
      'seller_forbidden'::text,
      null::uuid,
      target_auction.id,
      null::bigint,
      coalesce(target_auction.current_amount_minor, target_auction.starting_amount_minor),
      target_auction.bid_count,
      target_auction.min_increment_minor,
      required_amount_minor,
      target_auction.currency,
      target_auction.ends_at,
      target_auction.status,
      null::timestamptz;
    return;
  end if;

  select referenced_copy.owner_id
  into current_copy_owner_id
  from public.copies as referenced_copy
  where referenced_copy.id = target_auction.copy_id;

  if current_copy_owner_id is distinct from target_auction.seller_id then
    raise exception 'Auction seller must own the referenced Copy.'
      using errcode = '23514';
  end if;

  if target_auction.status <> 'scheduled'
    or target_auction.starts_at is null
    or target_auction.ends_at is null
  then
    return query
    select
      'auction_unavailable'::text,
      null::uuid,
      target_auction.id,
      null::bigint,
      coalesce(target_auction.current_amount_minor, target_auction.starting_amount_minor),
      target_auction.bid_count,
      target_auction.min_increment_minor,
      required_amount_minor,
      target_auction.currency,
      target_auction.ends_at,
      target_auction.status,
      null::timestamptz;
    return;
  end if;

  if target_auction.starts_at > decision_at then
    return query
    select
      'auction_upcoming'::text,
      null::uuid,
      target_auction.id,
      null::bigint,
      coalesce(target_auction.current_amount_minor, target_auction.starting_amount_minor),
      target_auction.bid_count,
      target_auction.min_increment_minor,
      required_amount_minor,
      target_auction.currency,
      target_auction.ends_at,
      target_auction.status,
      null::timestamptz;
    return;
  end if;

  if decision_at >= target_auction.ends_at then
    return query
    select
      'auction_ended'::text,
      null::uuid,
      target_auction.id,
      null::bigint,
      coalesce(target_auction.current_amount_minor, target_auction.starting_amount_minor),
      target_auction.bid_count,
      target_auction.min_increment_minor,
      required_amount_minor,
      target_auction.currency,
      target_auction.ends_at,
      target_auction.status,
      null::timestamptz;
    return;
  end if;

  if bid_amount_minor < required_amount_minor then
    return query
    select
      'bid_too_low'::text,
      null::uuid,
      target_auction.id,
      null::bigint,
      coalesce(target_auction.current_amount_minor, target_auction.starting_amount_minor),
      target_auction.bid_count,
      target_auction.min_increment_minor,
      required_amount_minor,
      target_auction.currency,
      target_auction.ends_at,
      target_auction.status,
      null::timestamptz;
    return;
  end if;

  insert into public.auction_bids (
    id,
    auction_id,
    bidder_id,
    amount_minor,
    created_at
  ) values (
    request_bid_id,
    target_auction.id,
    caller_user_id,
    bid_amount_minor,
    decision_at
  );

  update public.auctions
  set current_amount_minor = bid_amount_minor,
      bid_count = target_auction.bid_count + 1,
      leading_bid_id = request_bid_id
  where id = target_auction.id;

  return query
  select
    'accepted'::text,
    request_bid_id,
    target_auction.id,
    bid_amount_minor,
    bid_amount_minor,
    target_auction.bid_count + 1,
    target_auction.min_increment_minor,
    bid_amount_minor + target_auction.min_increment_minor,
    target_auction.currency,
    target_auction.ends_at,
    target_auction.status,
    decision_at;
end;
$$;

revoke all on function public.place_auction_bid(uuid, uuid, bigint)
from public, anon, authenticated;

grant execute on function public.place_auction_bid(uuid, uuid, bigint)
to authenticated;
