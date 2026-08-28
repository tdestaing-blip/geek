create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.finalize_auction(target_auction_id uuid)
returns public.auctions
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_auction public.auctions%rowtype;
  reserve_amount_minor bigint;
  leading_bid_amount_minor bigint;
  finalized_auction public.auctions%rowtype;
  decision_at timestamptz;
begin
  if target_auction_id is null then
    raise exception 'target_auction_id is required.' using errcode = '22023';
  end if;

  select auction.*
  into target_auction
  from public.auctions as auction
  where auction.id = target_auction_id
  for update;

  decision_at := pg_catalog.clock_timestamp();

  if not found then
    raise exception 'Auction does not exist.' using errcode = 'P0002';
  end if;

  -- A lost scheduler response is safe to retry. The canonical resolved row is
  -- returned without changing its winner, aggregates, commitment, or Copy.
  if target_auction.status in ('ended', 'won') then
    return target_auction;
  end if;

  if target_auction.status <> 'scheduled' then
    raise exception 'Auction is not finalizable.' using errcode = '23514';
  end if;

  if target_auction.ends_at is null or decision_at < target_auction.ends_at then
    raise exception 'Auction bidding window has not ended.' using errcode = '23514';
  end if;

  if target_auction.bid_count = 0 then
    if target_auction.current_amount_minor is not null
      or target_auction.leading_bid_id is not null
    then
      raise exception 'Auction bid aggregate is inconsistent.' using errcode = '23514';
    end if;
  else
    if target_auction.current_amount_minor is null
      or target_auction.leading_bid_id is null
    then
      raise exception 'Auction bid aggregate is inconsistent.' using errcode = '23514';
    end if;

    select bid.amount_minor
    into leading_bid_amount_minor
    from public.auction_bids as bid
    where bid.id = target_auction.leading_bid_id
      and bid.auction_id = target_auction.id;

    if not found
      or leading_bid_amount_minor is distinct from target_auction.current_amount_minor
    then
      raise exception 'Auction leading Bid is inconsistent.' using errcode = '23514';
    end if;
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

comment on function public.finalize_auction(uuid) is
  'Trusted idempotent Auction resolution boundary. It serializes with bidding on the Auction row and uses database time.';

create or replace function public.finalize_due_auctions(requested_batch_size integer default 100)
returns table (
  processed_count integer,
  resolved_count integer,
  failed_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_size integer;
  reference_time timestamptz := pg_catalog.clock_timestamp();
  due_auction record;
  processed integer := 0;
  resolved integer := 0;
  failed integer := 0;
begin
  if requested_batch_size is null or requested_batch_size < 1 then
    raise exception 'requested_batch_size must be positive.' using errcode = '22023';
  end if;

  batch_size := least(requested_batch_size, 100);

  for due_auction in
    select auction.id
    from public.auctions as auction
    where auction.status = 'scheduled'
      and auction.ends_at is not null
      and auction.ends_at <= reference_time
    order by auction.ends_at, auction.id
    limit batch_size
    for update skip locked
  loop
    processed := processed + 1;

    begin
      perform public.finalize_auction(due_auction.id);
      resolved := resolved + 1;
    exception
      when others then
        -- The exception block is a subtransaction: one malformed Auction rolls
        -- back independently and cannot prevent unrelated due Auctions from
        -- resolving. The next cron run may safely retry it after repair.
        failed := failed + 1;
        raise warning 'Auction resolution failed for Auction % (SQLSTATE %).',
          due_auction.id,
          sqlstate;
    end;
  end loop;

  return query select processed, resolved, failed;
end;
$$;

revoke all on function public.finalize_due_auctions(integer)
from public, anon, authenticated;
grant execute on function public.finalize_due_auctions(integer) to service_role;

comment on function public.finalize_due_auctions(integer) is
  'Trusted bounded cron batch for due scheduled Auctions. Overlapping runs skip rows already being resolved.';

create or replace function public.get_auction_result(target_auction_id uuid)
returns table (
  auction_id uuid,
  status text,
  final_amount_minor bigint,
  currency text,
  bid_count integer,
  ends_at timestamptz,
  caller_outcome text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_auction public.auctions%rowtype;
  outcome text;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if target_auction_id is null then
    raise exception 'target_auction_id is required.' using errcode = '22023';
  end if;

  select auction.*
  into target_auction
  from public.auctions as auction
  where auction.id = target_auction_id
    and auction.status in ('ended', 'won');

  if not found then
    return;
  end if;

  if target_auction.seller_id = caller_id then
    outcome := case
      when target_auction.status = 'won' then 'seller_won'
      else 'seller_no_sale'
    end;
  elsif target_auction.status = 'won'
    and exists (
      select 1
      from public.auction_bids as winning_bid
      where winning_bid.id = target_auction.winning_bid_id
        and winning_bid.auction_id = target_auction.id
        and winning_bid.bidder_id = caller_id
    ) then
    outcome := 'won';
  elsif exists (
    select 1
    from public.auction_bids as caller_bid
    where caller_bid.auction_id = target_auction.id
      and caller_bid.bidder_id = caller_id
  ) then
    outcome := 'lost';
  else
    return;
  end if;

  return query
  select
    target_auction.id,
    target_auction.status,
    target_auction.current_amount_minor,
    target_auction.currency,
    target_auction.bid_count,
    target_auction.ends_at,
    outcome;
end;
$$;

revoke all on function public.get_auction_result(uuid)
from public, anon, authenticated;
grant execute on function public.get_auction_result(uuid) to authenticated;

comment on function public.get_auction_result(uuid) is
  'Caller-relative resolved Auction result for the seller and participating bidders. It exposes no identities or raw Bids.';

create or replace function public.get_public_copy_detail(target_copy_id uuid)
returns table (
  copy_id uuid,
  game_id uuid,
  edition_id uuid,
  availability text,
  game_title text,
  game_description text,
  game_original_release_date date,
  platform_id uuid,
  platform_name text,
  platform_slug text,
  edition_name text,
  region_code text,
  edition_release_date date,
  edition_publisher_name text,
  owner_id uuid,
  owner_username text,
  owner_display_name text,
  owner_avatar_path text,
  owner_bio text,
  listing_id uuid,
  listing_amount_minor bigint,
  listing_currency text,
  auction_id uuid,
  auction_amount_minor bigint,
  auction_currency text,
  auction_bid_count integer,
  auction_ends_at timestamptz,
  trade_available boolean,
  edition_component_id uuid,
  component_kind text,
  component_name text,
  component_sort_order integer,
  component_presence text,
  component_condition_grade smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_copy public.copies%rowtype;
  active_listing public.listings%rowtype;
  active_auction public.auctions%rowtype;
  listing_count integer;
  auction_count integer;
  winner_access boolean := false;
  trade_found boolean := false;
  trade_page_count integer;
  trade_page_contains_copy boolean;
  trade_offset integer := 0;
begin
  if target_copy_id is null then
    raise exception 'target_copy_id is required.' using errcode = '22023';
  end if;

  select copy.*
  into target_copy
  from public.copies as copy
  where copy.id = target_copy_id;

  if not found then
    return;
  end if;

  select pg_catalog.count(*)
  into listing_count
  from public.listings as listing
  where listing.copy_id = target_copy.id
    and listing.status = 'active';

  select pg_catalog.count(*)
  into auction_count
  from public.auctions as auction
  where auction.copy_id = target_copy.id
    and auction.status = 'scheduled'
    and pg_catalog.statement_timestamp() < auction.ends_at;

  if listing_count = 1 then
    select listing.*
    into strict active_listing
    from public.listings as listing
    where listing.copy_id = target_copy.id
      and listing.status = 'active';
  end if;

  if auction_count = 1 then
    select auction.*
    into strict active_auction
    from public.auctions as auction
    where auction.copy_id = target_copy.id
      and auction.status = 'scheduled'
      and pg_catalog.statement_timestamp() < auction.ends_at;
  end if;

  if caller_id is not null then
    select exists (
      select 1
      from public.auctions as won_auction
      join public.auction_bids as winning_bid
        on winning_bid.id = won_auction.winning_bid_id
       and winning_bid.auction_id = won_auction.id
      where won_auction.copy_id = target_copy.id
        and won_auction.status = 'won'
        and winning_bid.bidder_id = caller_id
    )
    into winner_access;

    begin
      loop
        select
          pg_catalog.count(*)::integer,
          coalesce(pg_catalog.bool_or(match.their_copy_id = target_copy.id), false)
        into trade_page_count, trade_page_contains_copy
        from public.get_my_reciprocal_trade_match_pairs(
          200,
          50,
          trade_offset
        ) as match;

        if trade_page_contains_copy then
          trade_found := true;
          exit;
        end if;

        exit when trade_page_count < 50;
        trade_offset := trade_offset + 50;
      end loop;
    exception
      when sqlstate 'P0002' then
        trade_found := false;
    end;
  end if;

  if listing_count > 1
    or auction_count > 1
    or listing_count + auction_count + trade_found::integer > 1 then
    raise exception 'Copy has conflicting active marketplace opportunities.'
      using errcode = '23514';
  end if;

  if target_copy.visibility <> 'public'
    and target_copy.owner_id is distinct from caller_id
    and listing_count = 0
    and auction_count = 0
    and not trade_found
    and not winner_access then
    return;
  end if;

  return query
  select
    target_copy.id,
    target_copy.game_id,
    target_copy.edition_id,
    target_copy.availability,
    game.canonical_title,
    game.description,
    game.original_release_date,
    platform.id,
    platform.name,
    platform.slug,
    edition.edition_name,
    edition.region_code,
    edition.release_date,
    edition.publisher_name,
    profile.id,
    profile.username,
    profile.display_name,
    profile.avatar_path,
    profile.bio,
    active_listing.id,
    active_listing.asking_amount_minor,
    active_listing.asking_currency,
    active_auction.id,
    coalesce(
      active_auction.current_amount_minor,
      active_auction.starting_amount_minor
    ),
    active_auction.currency,
    active_auction.bid_count,
    active_auction.ends_at,
    trade_found,
    component.id,
    component.kind,
    component.name,
    component.sort_order,
    component_state.presence,
    component_state.condition_grade
  from public.games as game
  join public.profiles as profile on profile.id = target_copy.owner_id
  left join public.editions as edition on edition.id = target_copy.edition_id
  left join public.platforms as platform on platform.id = edition.platform_id
  left join public.edition_components as component
    on component.edition_id = target_copy.edition_id
  left join public.copy_component_states as component_state
    on component_state.copy_id = target_copy.id
   and component_state.edition_id = target_copy.edition_id
   and component_state.edition_component_id = component.id
  where game.id = target_copy.game_id
  order by component.sort_order nulls last, component.id;
end;
$$;

revoke all on function public.get_public_copy_detail(uuid)
from public, anon, authenticated;
grant execute on function public.get_public_copy_detail(uuid)
to anon, authenticated;

comment on function public.get_public_copy_detail(uuid) is
  'Fixed marketplace-safe Copy projection. A won Auction winner retains this same safe projection; private Copy photos, details, exact geography, auth metadata, and private Wishlist preferences remain excluded.';

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select job.jobid
    from cron.job as job
    where job.jobname = 'geek-finalize-due-auctions'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
end;
$$;

select cron.schedule(
  'geek-finalize-due-auctions',
  '* * * * *',
  'select public.finalize_due_auctions(100);'
);

comment on extension pg_cron is
  'Runs the bounded Auction resolution batch every minute inside Postgres.';
