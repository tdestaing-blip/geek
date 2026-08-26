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
        -- No configured discovery location means no reciprocal opportunity.
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
    and not trade_found then
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
  'Fixed marketplace-safe Copy projection. It never exposes private Copy photos, private details, component notes, exact geography, auth metadata, or private Wishlist preferences.';
