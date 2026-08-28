drop function if exists public.get_my_active_auction_bids();
drop function if exists public.get_my_auction_participations();

create function public.get_my_auction_participations()
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
  participation_phase text,
  caller_bid_state text,
  caller_outcome text
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
  with caller_auctions as (
    select distinct bid.auction_id
    from public.auction_bids as bid
    where bid.bidder_id = caller_id
  ),
  caller_catalog as (
    select
      auction.id as auction_id,
      copy.id as copy_id,
      game.id as game_id,
      edition.id as edition_id,
      game.canonical_title as game_title,
      platform.name as platform_name,
      edition.region_code,
      cover.asset_url as cover_asset_url,
      auction.current_amount_minor,
      auction.currency,
      auction.bid_count,
      auction.ends_at,
      auction.starts_at,
      auction.status,
      leading_bid.bidder_id as leading_bidder_id,
      winning_bid.bidder_id as winning_bidder_id
    from caller_auctions as participation
    join public.auctions as auction on auction.id = participation.auction_id
    join public.copies as copy on copy.id = auction.copy_id
    join public.games as game on game.id = copy.game_id
    join public.editions as edition on edition.id = copy.edition_id
    join public.platforms as platform on platform.id = edition.platform_id
    left join public.auction_bids as leading_bid
      on leading_bid.id = auction.leading_bid_id
     and leading_bid.auction_id = auction.id
    left join public.auction_bids as winning_bid
      on winning_bid.id = auction.winning_bid_id
     and winning_bid.auction_id = auction.id
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
    where auction.current_amount_minor is not null
      and auction.bid_count > 0
  ),
  live_participations as (
    select
      catalog.auction_id,
      catalog.copy_id,
      catalog.game_id,
      catalog.edition_id,
      catalog.game_title,
      catalog.platform_name,
      catalog.region_code,
      catalog.cover_asset_url,
      catalog.current_amount_minor,
      catalog.currency,
      catalog.bid_count,
      catalog.ends_at,
      'live'::text as participation_phase,
      case when catalog.leading_bidder_id = caller_id then 'leading' else 'outbid' end
        as caller_bid_state,
      null::text as caller_outcome
    from caller_catalog as catalog
    where catalog.status = 'scheduled'
      and catalog.starts_at <= reference_time
      and reference_time < catalog.ends_at
      and catalog.leading_bidder_id is not null
  ),
  resolving_participations as (
    select
      catalog.auction_id,
      catalog.copy_id,
      catalog.game_id,
      catalog.edition_id,
      catalog.game_title,
      catalog.platform_name,
      catalog.region_code,
      catalog.cover_asset_url,
      catalog.current_amount_minor,
      catalog.currency,
      catalog.bid_count,
      catalog.ends_at,
      'resolving'::text as participation_phase,
      null::text as caller_bid_state,
      null::text as caller_outcome
    from caller_catalog as catalog
    where catalog.status = 'scheduled'
      and catalog.starts_at <= reference_time
      and catalog.ends_at <= reference_time
  ),
  resolved_participations as (
    select
      catalog.auction_id,
      catalog.copy_id,
      catalog.game_id,
      catalog.edition_id,
      catalog.game_title,
      catalog.platform_name,
      catalog.region_code,
      catalog.cover_asset_url,
      catalog.current_amount_minor,
      catalog.currency,
      catalog.bid_count,
      catalog.ends_at,
      'resolved'::text as participation_phase,
      null::text as caller_bid_state,
      case
        when catalog.status = 'won' and catalog.winning_bidder_id = caller_id then 'won'
        when catalog.status = 'won' then 'lost'
        else 'ended'
      end as caller_outcome
    from caller_catalog as catalog
    where catalog.status in ('won', 'ended')
    order by catalog.ends_at desc, catalog.auction_id desc
    limit 10
  ),
  all_participations as (
    select * from live_participations
    union all
    select * from resolving_participations
    union all
    select * from resolved_participations
  )
  select participation.*
  from all_participations as participation
  order by
    case participation.participation_phase
      when 'live' then 0
      when 'resolving' then 1
      else 2
    end,
    case
      when participation.participation_phase = 'live' then participation.ends_at
    end asc,
    case
      when participation.participation_phase = 'resolved' then participation.ends_at
    end desc,
    participation.auction_id;
end;
$$;

revoke all on function public.get_my_auction_participations()
from public, anon, authenticated;
grant execute on function public.get_my_auction_participations() to authenticated;

comment on function public.get_my_auction_participations() is
  'One caller-owned row per live/resolving Auction participation plus at most ten recent resolved bidder results. It exposes only safe catalog display data and caller-relative state.';
