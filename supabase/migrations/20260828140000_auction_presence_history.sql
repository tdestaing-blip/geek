create function public.get_my_active_auction_bids()
returns table (
  auction_id uuid,
  copy_id uuid,
  game_id uuid,
  edition_id uuid,
  game_title text,
  platform_name text,
  region_code text,
  cover_asset_url text,
  current_amount_minor bigint,
  currency text,
  bid_count integer,
  ends_at timestamptz,
  caller_bid_state text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  reference_time timestamptz := pg_catalog.statement_timestamp();
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  return query
  select
    auction.id,
    copy.id,
    game.id,
    edition.id,
    game.canonical_title,
    platform.name,
    edition.region_code,
    cover.asset_url,
    auction.current_amount_minor,
    auction.currency,
    auction.bid_count,
    auction.ends_at,
    case
      when leading_bid.bidder_id = caller_id then 'leading'
      else 'outbid'
    end
  from public.auctions as auction
  join public.copies as copy on copy.id = auction.copy_id
  join public.games as game on game.id = copy.game_id
  join public.editions as edition on edition.id = copy.edition_id
  join public.platforms as platform on platform.id = edition.platform_id
  join public.auction_bids as leading_bid
    on leading_bid.id = auction.leading_bid_id
   and leading_bid.auction_id = auction.id
  left join lateral (
    select media.asset_url
    from public.catalog_media as media
    where (
        media.edition_id = edition.id
        or media.game_id = game.id
      )
      and public.catalog_media_is_displayable(media.rights_status)
    order by
      (media.edition_id = edition.id) desc,
      media.is_primary desc,
      case media.kind
        when 'cover_front' then 0
        when 'artwork' then 1
        when 'cover_back' then 2
        else 3
      end,
      media.id
    limit 1
  ) as cover on true
  where auction.status = 'scheduled'
    and auction.starts_at <= reference_time
    and reference_time < auction.ends_at
    and auction.current_amount_minor is not null
    and auction.bid_count > 0
    and exists (
      select 1
      from public.auction_bids as caller_bid
      where caller_bid.auction_id = auction.id
        and caller_bid.bidder_id = caller_id
    )
  order by auction.ends_at, auction.id;
end;
$$;

revoke all on function public.get_my_active_auction_bids()
from public, anon, authenticated;
grant execute on function public.get_my_active_auction_bids() to authenticated;

comment on function public.get_my_active_auction_bids() is
  'One bounded caller-owned row per live Auction participation. It exposes only safe catalog display data and caller-relative leading/outbid state.';

create function public.get_auction_bid_history(target_auction_id uuid)
returns table (
  amount_minor bigint,
  currency text,
  accepted_at timestamptz,
  public_profile_id uuid,
  public_display_name text,
  public_avatar_path text,
  is_caller boolean,
  is_leading boolean,
  is_winning boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_auction public.auctions%rowtype;
  target_copy_visibility text;
  reference_time timestamptz := pg_catalog.statement_timestamp();
  access_allowed boolean := false;
begin
  if target_auction_id is null then
    raise exception 'target_auction_id is required.' using errcode = '22023';
  end if;

  select auction.*
  into target_auction
  from public.auctions as auction
  where auction.id = target_auction_id;

  if not found then
    return;
  end if;

  select copy.visibility
  into strict target_copy_visibility
  from public.copies as copy
  where copy.id = target_auction.copy_id;

  if target_auction.status = 'scheduled'
    and target_auction.starts_at <= reference_time
    and reference_time < target_auction.ends_at
  then
    access_allowed := true;
  elsif target_auction.status in ('ended', 'won')
    and target_copy_visibility = 'public'
  then
    access_allowed := true;
  elsif caller_id is not null
    and target_auction.status in ('ended', 'won')
    and (
      target_auction.seller_id = caller_id
      or exists (
        select 1
        from public.auction_bids as caller_bid
        where caller_bid.auction_id = target_auction.id
          and caller_bid.bidder_id = caller_id
      )
    )
  then
    access_allowed := true;
  end if;

  if not access_allowed then
    raise exception 'Auction Bid history is not available to this caller.'
      using errcode = '42501';
  end if;

  return query
  select
    bid.amount_minor,
    target_auction.currency,
    bid.created_at,
    profile.id,
    profile.display_name,
    profile.avatar_path,
    caller_id is not null and profile.id = caller_id,
    target_auction.status = 'scheduled'
      and bid.id = target_auction.leading_bid_id,
    target_auction.status = 'won'
      and bid.id = target_auction.winning_bid_id
  from public.auction_bids as bid
  join public.profiles as profile on profile.id = bid.bidder_id
  where bid.auction_id = target_auction.id
  order by bid.created_at desc, bid.id desc
  limit 50;
end;
$$;

revoke all on function public.get_auction_bid_history(uuid)
from public, anon, authenticated;
grant execute on function public.get_auction_bid_history(uuid) to anon, authenticated;

comment on function public.get_auction_bid_history(uuid) is
  'Bounded newest-first accepted Bid history with public Profile identity only. Raw Bid RLS remains bidder-private.';

drop function public.get_auction_result(uuid);

create function public.get_auction_result(target_auction_id uuid)
returns table (
  auction_id uuid,
  status text,
  final_amount_minor bigint,
  currency text,
  bid_count integer,
  ends_at timestamptz,
  caller_outcome text,
  winner_public_profile_id uuid,
  winner_public_display_name text,
  winner_public_avatar_path text
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
  winner_profile public.profiles%rowtype;
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

  if target_auction.status = 'won' then
    select profile.*
    into strict winner_profile
    from public.auction_bids as winning_bid
    join public.profiles as profile on profile.id = winning_bid.bidder_id
    where winning_bid.id = target_auction.winning_bid_id
      and winning_bid.auction_id = target_auction.id;
  end if;

  return query
  select
    target_auction.id,
    target_auction.status,
    target_auction.current_amount_minor,
    target_auction.currency,
    target_auction.bid_count,
    target_auction.ends_at,
    outcome,
    winner_profile.id,
    winner_profile.display_name,
    winner_profile.avatar_path;
end;
$$;

revoke all on function public.get_auction_result(uuid)
from public, anon, authenticated;
grant execute on function public.get_auction_result(uuid) to authenticated;

comment on function public.get_auction_result(uuid) is
  'Caller-relative resolved Auction result for seller and accepted bidders, with only the canonical winner public Profile identity.';

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
  participant_access boolean := false;
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
      from public.auctions as resolved_auction
      join public.auction_bids as accepted_bid
        on accepted_bid.auction_id = resolved_auction.id
      where resolved_auction.copy_id = target_copy.id
        and resolved_auction.status in ('ended', 'won')
        and accepted_bid.bidder_id = caller_id
    )
    into participant_access;

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
    and not participant_access then
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
  'Fixed marketplace-safe Copy projection. Seller and any accepted participant retain the same safe projection after resolution; private Copy data remains excluded.';
