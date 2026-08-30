create index orders_buyer_created_at_id_index
on public.orders (buyer_id, created_at desc, id);

create index orders_seller_created_at_id_index
on public.orders (seller_id, created_at desc, id);

create index auctions_seller_status_ends_at_id_index
on public.auctions (seller_id, status, ends_at desc, id);

create index listings_seller_status_updated_at_id_index
on public.listings (seller_id, status, updated_at desc, id);

create function public.get_my_activity(
  activity_segment text default 'current',
  result_limit integer default 20,
  cursor_requires_attention boolean default null,
  cursor_occurred_at timestamptz default null,
  cursor_activity_id text default null
)
returns table (
  activity_id text,
  kind text,
  caller_role text,
  activity_state text,
  segment text,
  object_id uuid,
  copy_id uuid,
  auction_id uuid,
  game_id uuid,
  edition_id uuid,
  title text,
  platform_name text,
  region_code text,
  thumbnail_url text,
  counterparty_profile_id uuid,
  counterparty_display_name text,
  counterparty_avatar_path text,
  amount_minor bigint,
  currency text,
  occurred_at timestamptz,
  ends_at timestamptz,
  requires_attention boolean,
  navigation_kind text,
  has_more boolean
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

  if activity_segment not in ('current', 'history') then
    raise exception 'Activity segment is invalid.' using errcode = '22023';
  end if;

  if result_limit is null or result_limit < 1 or result_limit > 50 then
    raise exception 'Activity result limit must be between 1 and 50.' using errcode = '22023';
  end if;

  if (cursor_requires_attention is null)
       <> (cursor_occurred_at is null)
    or (cursor_occurred_at is null)
       <> (cursor_activity_id is null)
  then
    raise exception 'Activity cursor must be supplied completely.' using errcode = '22023';
  end if;

  return query
  with copy_catalog as (
    select
      copy.id as copy_id,
      copy.owner_id,
      game.id as game_id,
      edition.id as edition_id,
      game.canonical_title as title,
      platform.name as platform_name,
      edition.region_code,
      cover.asset_url as thumbnail_url
    from public.copies as copy
    join public.games as game on game.id = copy.game_id
    left join public.editions as edition on edition.id = copy.edition_id
    left join public.platforms as platform on platform.id = edition.platform_id
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
  ),
  caller_bid_auctions as (
    select distinct bid.auction_id
    from public.auction_bids as bid
    where bid.bidder_id = caller_id
  ),
  bidder_auction_rows as (
    select
      'auction:' || auction.id::text || ':bidder' as activity_id,
      'auction'::text as kind,
      'bidder'::text as caller_role,
      case
        when auction.status = 'scheduled' and auction.ends_at <= reference_time
          then 'auction_bidder_resolving'
        when auction.status = 'scheduled' and leading_bid.bidder_id = caller_id
          then 'auction_bidder_leading'
        when auction.status = 'scheduled'
          then 'auction_bidder_outbid'
        when auction.status = 'won' and winning_bid.bidder_id = caller_id
          then 'auction_bidder_won'
        when auction.status = 'won'
          then 'auction_bidder_lost'
        else 'auction_bidder_ended'
      end as activity_state,
      case when auction.status = 'scheduled' then 'current' else 'history' end as segment,
      auction.id as object_id,
      auction.copy_id,
      auction.id as auction_id,
      catalog.game_id,
      catalog.edition_id,
      catalog.title,
      catalog.platform_name,
      catalog.region_code,
      catalog.thumbnail_url,
      null::uuid as counterparty_profile_id,
      null::text as counterparty_display_name,
      null::text as counterparty_avatar_path,
      auction.current_amount_minor as amount_minor,
      auction.currency,
      case
        when auction.status = 'scheduled' and auction.ends_at <= reference_time
          then auction.ends_at
        when auction.status = 'scheduled' then auction.updated_at
        else coalesce(auction.ends_at, auction.updated_at)
      end as occurred_at,
      auction.ends_at,
      auction.status = 'scheduled'
        and auction.ends_at > reference_time
        and leading_bid.bidder_id is distinct from caller_id as requires_attention,
      'public_copy'::text as navigation_kind
    from caller_bid_auctions as participation
    join public.auctions as auction on auction.id = participation.auction_id
    join copy_catalog as catalog on catalog.copy_id = auction.copy_id
    left join public.auction_bids as leading_bid
      on leading_bid.id = auction.leading_bid_id
     and leading_bid.auction_id = auction.id
    left join public.auction_bids as winning_bid
      on winning_bid.id = auction.winning_bid_id
     and winning_bid.auction_id = auction.id
    where catalog.edition_id is not null
      and (
        (
          auction.status = 'scheduled'
          and auction.starts_at <= reference_time
        )
        or auction.status in ('won', 'ended')
      )
  ),
  seller_auction_rows as (
    select
      'auction:' || auction.id::text || ':seller' as activity_id,
      'auction'::text as kind,
      'seller'::text as caller_role,
      case
        when auction.status = 'scheduled' and auction.ends_at <= reference_time
          then 'auction_seller_resolving'
        when auction.status = 'scheduled'
          then 'auction_seller_live'
        when auction.status = 'won'
          then 'auction_seller_won'
        else 'auction_seller_ended'
      end as activity_state,
      case when auction.status = 'scheduled' then 'current' else 'history' end as segment,
      auction.id as object_id,
      auction.copy_id,
      auction.id as auction_id,
      catalog.game_id,
      catalog.edition_id,
      catalog.title,
      catalog.platform_name,
      catalog.region_code,
      catalog.thumbnail_url,
      winner_profile.id as counterparty_profile_id,
      winner_profile.display_name as counterparty_display_name,
      winner_profile.avatar_path as counterparty_avatar_path,
      coalesce(auction.current_amount_minor, auction.starting_amount_minor) as amount_minor,
      auction.currency,
      case
        when auction.status = 'scheduled' and auction.ends_at <= reference_time
          then auction.ends_at
        when auction.status = 'scheduled' then auction.updated_at
        else coalesce(auction.ends_at, auction.updated_at)
      end as occurred_at,
      auction.ends_at,
      false as requires_attention,
      'owned_copy'::text as navigation_kind
    from public.auctions as auction
    join copy_catalog as catalog on catalog.copy_id = auction.copy_id
    left join public.auction_bids as winning_bid
      on winning_bid.id = auction.winning_bid_id
     and winning_bid.auction_id = auction.id
    left join public.profiles as winner_profile on winner_profile.id = winning_bid.bidder_id
    where auction.seller_id = caller_id
      and catalog.owner_id = caller_id
      and (
        (
          auction.status = 'scheduled'
          and auction.starts_at <= reference_time
        )
        or auction.status in ('won', 'ended')
      )
  ),
  order_rows as (
    select
      'order:' || canonical_order.id::text || ':'
        || case when canonical_order.buyer_id = caller_id then 'buyer' else 'seller' end
        as activity_id,
      'order'::text as kind,
      case when canonical_order.buyer_id = caller_id then 'buyer' else 'seller' end
        as caller_role,
      case
        when canonical_order.buyer_id = caller_id then 'order_buyer_awaiting_payment'
        else 'order_seller_awaiting_payment'
      end as activity_state,
      'current'::text as segment,
      canonical_order.id as object_id,
      item.copy_id,
      item.auction_id,
      catalog.game_id,
      catalog.edition_id,
      catalog.title,
      catalog.platform_name,
      catalog.region_code,
      catalog.thumbnail_url,
      counterparty.id as counterparty_profile_id,
      counterparty.display_name as counterparty_display_name,
      counterparty.avatar_path as counterparty_avatar_path,
      item.amount_minor,
      item.currency,
      canonical_order.created_at as occurred_at,
      null::timestamptz as ends_at,
      canonical_order.buyer_id = caller_id as requires_attention,
      case
        when canonical_order.buyer_id = caller_id then 'public_copy'
        else 'owned_copy'
      end as navigation_kind
    from public.orders as canonical_order
    join public.order_items as item on item.order_id = canonical_order.id
    join copy_catalog as catalog on catalog.copy_id = item.copy_id
    join public.profiles as counterparty
      on counterparty.id = case
        when canonical_order.buyer_id = caller_id then canonical_order.seller_id
        else canonical_order.buyer_id
      end
    where canonical_order.status = 'awaiting_payment'
      and (canonical_order.buyer_id = caller_id or canonical_order.seller_id = caller_id)
      and (
        canonical_order.seller_id = caller_id
        or catalog.edition_id is not null
      )
  ),
  listing_rows as (
    select
      'listing:' || listing.id::text || ':seller' as activity_id,
      'listing'::text as kind,
      'seller'::text as caller_role,
      case listing.status
        when 'active' then 'listing_active'
        when 'withdrawn' then 'listing_withdrawn'
        when 'expired' then 'listing_expired'
        else 'listing_sold'
      end as activity_state,
      case when listing.status = 'active' then 'current' else 'history' end as segment,
      listing.id as object_id,
      listing.copy_id,
      null::uuid as auction_id,
      catalog.game_id,
      catalog.edition_id,
      catalog.title,
      catalog.platform_name,
      catalog.region_code,
      catalog.thumbnail_url,
      null::uuid as counterparty_profile_id,
      null::text as counterparty_display_name,
      null::text as counterparty_avatar_path,
      listing.asking_amount_minor as amount_minor,
      listing.asking_currency as currency,
      case
        when listing.status = 'active'
          then coalesce(listing.published_at, listing.updated_at)
        else listing.updated_at
      end as occurred_at,
      null::timestamptz as ends_at,
      false as requires_attention,
      'owned_copy'::text as navigation_kind
    from public.listings as listing
    join copy_catalog as catalog on catalog.copy_id = listing.copy_id
    where listing.seller_id = caller_id
      and catalog.owner_id = caller_id
      and listing.status in ('active', 'withdrawn', 'expired', 'sold')
  ),
  normalized as (
    select * from bidder_auction_rows
    union all
    select * from seller_auction_rows
    union all
    select * from order_rows
    union all
    select * from listing_rows
  ),
  after_cursor as (
    select activity.*
    from normalized as activity
    where activity.segment = activity_segment
      and (
        cursor_occurred_at is null
        or (
          activity_segment = 'current'
          and (
            case when activity.requires_attention then 0 else 1 end
              > case when cursor_requires_attention then 0 else 1 end
            or (
              activity.requires_attention = cursor_requires_attention
              and activity.occurred_at < cursor_occurred_at
            )
            or (
              activity.requires_attention = cursor_requires_attention
              and activity.occurred_at = cursor_occurred_at
              and activity.activity_id > cursor_activity_id
            )
          )
        )
        or (
          activity_segment = 'history'
          and (
            activity.occurred_at < cursor_occurred_at
            or (
              activity.occurred_at = cursor_occurred_at
              and activity.activity_id > cursor_activity_id
            )
          )
        )
      )
  ),
  ordered as (
    select
      activity.*,
      row_number() over (
        order by
          case
            when activity_segment = 'current' and activity.requires_attention then 0
            else 1
          end,
          activity.occurred_at desc,
          activity.activity_id
      ) as page_position
    from after_cursor as activity
  ),
  bounded as (
    select *
    from ordered
    where ordered.page_position <= result_limit + 1
  )
  select
    activity.activity_id,
    activity.kind,
    activity.caller_role,
    activity.activity_state,
    activity.segment,
    activity.object_id,
    activity.copy_id,
    activity.auction_id,
    activity.game_id,
    activity.edition_id,
    activity.title,
    activity.platform_name,
    activity.region_code,
    activity.thumbnail_url,
    activity.counterparty_profile_id,
    activity.counterparty_display_name,
    activity.counterparty_avatar_path,
    activity.amount_minor,
    activity.currency,
    activity.occurred_at,
    activity.ends_at,
    activity.requires_attention,
    activity.navigation_kind,
    exists (
      select 1
      from bounded as overflow
      where overflow.page_position = result_limit + 1
    ) as has_more
  from bounded as activity
  where activity.page_position <= result_limit
  order by activity.page_position;
end;
$$;

revoke all on function public.get_my_activity(text, integer, boolean, timestamptz, text)
from public, anon, authenticated;

grant execute on function public.get_my_activity(text, integer, boolean, timestamptz, text)
to authenticated;

comment on function public.get_my_activity(text, integer, boolean, timestamptz, text) is
  'Bounded deterministic caller-relative Activity V1 projection over Auctions, Auction Orders, and seller Listings. Trade activity is deferred until a canonical TradeOffer destination exists.';
