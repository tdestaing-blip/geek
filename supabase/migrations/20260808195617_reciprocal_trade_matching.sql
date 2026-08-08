create or replace function public.derive_matching_location(
  exact_location extensions.geography
)
returns extensions.geography
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  with coordinate as (
    select
      extensions.st_x(exact_location::extensions.geometry) as longitude,
      extensions.st_y(exact_location::extensions.geometry) as latitude
  )
  select extensions.st_setsrid(
    extensions.st_makepoint(
      -180.0 + (
        least(
          pg_catalog.floor(
            (coordinate.longitude + 180.0) / 0.010986328125
          )::integer,
          32767
        ) + 0.5
      ) * 0.010986328125,
      -90.0 + (
        least(
          pg_catalog.floor(
            (coordinate.latitude + 90.0) / 0.0054931640625
          )::integer,
          32767
        ) + 0.5
      ) * 0.0054931640625
    ),
    4326
  )::extensions.geography
  from coordinate;
$$;

revoke all on function public.derive_matching_location(extensions.geography)
from public;
revoke all on function public.derive_matching_location(extensions.geography)
from anon;
revoke all on function public.derive_matching_location(extensions.geography)
from authenticated;

create or replace function public.get_reciprocal_trade_matches(
  max_distance_km integer default 25,
  result_limit integer default 20,
  result_offset integer default 0
)
returns table (
  counterpart_user_id uuid,
  distance_bucket text,
  my_active_trade_want_count integer,
  my_want_match_count integer,
  their_want_match_count integer,
  their_matching_copies jsonb,
  my_matching_copies jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_location extensions.geography;
  caller_matching_location extensions.geography;
  coarse_prefilter_margin_meters constant double precision := 1500.0;
  requested_distance_meters double precision;
begin
  if caller_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required for reciprocal trade matching.';
  end if;

  if max_distance_km is null
    or max_distance_km not in (2, 5, 10, 25, 50, 100, 200)
  then
    raise exception using
      errcode = '22023',
      message = 'max_distance_km must be one of 2, 5, 10, 25, 50, 100, or 200.';
  end if;

  if result_limit is null or result_limit < 1 or result_limit > 50 then
    raise exception using
      errcode = '22023',
      message = 'result_limit must be between 1 and 50.';
  end if;

  if result_offset is null or result_offset < 0 then
    raise exception using
      errcode = '22023',
      message = 'result_offset must be zero or greater.';
  end if;

  select location.location
  into caller_location
  from public.user_discovery_locations as location
  where location.user_id = caller_user_id;

  if caller_location is null then
    raise exception using
      errcode = 'P0002',
      message = 'A discovery location is required for reciprocal trade matching.';
  end if;

  caller_matching_location := public.derive_matching_location(caller_location);

  requested_distance_meters := max_distance_km::double precision * 1000.0;

  return query
  with
  my_active_trade_wants as materialized (
    select
      wishlist.id as wishlist_item_id,
      wishlist.game_id,
      wishlist.edition_id,
      case
        when private_details.max_trade_distance_km < 2 then null
        else least(
          max_distance_km,
          case
            when private_details.max_trade_distance_km is null
              then max_distance_km
            when private_details.max_trade_distance_km < 5 then 2
            when private_details.max_trade_distance_km < 10 then 5
            when private_details.max_trade_distance_km < 25 then 10
            when private_details.max_trade_distance_km < 50 then 25
            when private_details.max_trade_distance_km < 100 then 50
            when private_details.max_trade_distance_km < 200 then 100
            else 200
          end
        )::double precision * 1000.0
      end as effective_distance_meters
    from public.wishlist_items as wishlist
    left join public.wishlist_private_details as private_details
      on private_details.wishlist_item_id = wishlist.id
    where wishlist.owner_id = caller_user_id
      and wishlist.status = 'active'
      and wishlist.trade_interest
  ),
  my_active_trade_want_total as (
    select pg_catalog.count(*)::integer as want_count
    from my_active_trade_wants
  ),
  nearby_location_candidates as materialized (
    select
      location.user_id as counterpart_id,
      public.derive_matching_location(location.location)
        as counterpart_matching_location
    from public.user_discovery_locations as location
    where location.user_id <> caller_user_id
      and extensions.st_dwithin(
        location.location,
        caller_location,
        requested_distance_meters + coarse_prefilter_margin_meters
      )
  ),
  nearby_user_distances as materialized (
    select
      candidate.counterpart_id,
      extensions.st_distance(
        caller_matching_location,
        candidate.counterpart_matching_location
      ) as distance_meters
    from nearby_location_candidates as candidate
  ),
  nearby_users as materialized (
    select
      candidate.counterpart_id,
      candidate.distance_meters
    from nearby_user_distances as candidate
    where (
      max_distance_km = 200
      and candidate.distance_meters <= requested_distance_meters
    )
    or (
      max_distance_km < 200
      and candidate.distance_meters < requested_distance_meters
    )
  ),
  their_open_trade_copies as materialized (
    select
      nearby.counterpart_id,
      nearby.distance_meters,
      copy.id as copy_id,
      copy.edition_id,
      edition.game_id
    from nearby_users as nearby
    join public.copies as copy
      on copy.owner_id = nearby.counterpart_id
     and copy.trade_availability = 'open_to_trade'
    join public.editions as edition on edition.id = copy.edition_id
  ),
  my_want_copy_matches as materialized (
    select distinct
      their_copy.counterpart_id,
      their_copy.distance_meters,
      my_want.wishlist_item_id,
      their_copy.copy_id,
      their_copy.game_id,
      their_copy.edition_id
    from their_open_trade_copies as their_copy
    join my_active_trade_wants as my_want
      on (
        (my_want.game_id is not null and my_want.game_id = their_copy.game_id)
        or (
          my_want.edition_id is not null
          and my_want.edition_id = their_copy.edition_id
        )
      )
     and (
       (
         my_want.effective_distance_meters = 200000.0
         and their_copy.distance_meters <= my_want.effective_distance_meters
       )
       or (
         my_want.effective_distance_meters < 200000.0
         and their_copy.distance_meters < my_want.effective_distance_meters
       )
     )
  ),
  counterpart_candidates as (
    select distinct match.counterpart_id
    from my_want_copy_matches as match
  ),
  their_public_trade_wants as materialized (
    select
      wishlist.owner_id as counterpart_id,
      wishlist.id as wishlist_item_id,
      wishlist.game_id,
      wishlist.edition_id
    from public.wishlist_items as wishlist
    join counterpart_candidates as candidate
      on candidate.counterpart_id = wishlist.owner_id
    where wishlist.status = 'active'
      and wishlist.trade_interest
      and wishlist.visibility = 'public'
  ),
  my_open_trade_copies as materialized (
    select
      copy.id as copy_id,
      copy.edition_id,
      edition.game_id
    from public.copies as copy
    join public.editions as edition on edition.id = copy.edition_id
    where copy.owner_id = caller_user_id
      and copy.trade_availability = 'open_to_trade'
  ),
  their_want_copy_matches as materialized (
    select distinct
      their_want.counterpart_id,
      their_want.wishlist_item_id,
      my_copy.copy_id,
      my_copy.game_id,
      my_copy.edition_id
    from their_public_trade_wants as their_want
    join my_open_trade_copies as my_copy
      on (
        (their_want.game_id is not null and their_want.game_id = my_copy.game_id)
        or (
          their_want.edition_id is not null
          and their_want.edition_id = my_copy.edition_id
        )
      )
  ),
  my_want_counts as (
    select
      match.counterpart_id,
      pg_catalog.count(distinct match.wishlist_item_id)::integer as match_count
    from my_want_copy_matches as match
    group by match.counterpart_id
  ),
  their_want_counts as (
    select
      match.counterpart_id,
      pg_catalog.count(distinct match.wishlist_item_id)::integer as match_count
    from their_want_copy_matches as match
    group by match.counterpart_id
  ),
  their_copy_details as (
    select distinct
      match.counterpart_id,
      match.copy_id,
      match.game_id,
      match.edition_id
    from my_want_copy_matches as match
  ),
  ranked_their_copy_details as (
    select
      detail.*,
      pg_catalog.row_number() over (
        partition by detail.counterpart_id
        order by detail.copy_id
      ) as detail_number
    from their_copy_details as detail
  ),
  their_copy_arrays as (
    select
      detail.counterpart_id,
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'copy_id', detail.copy_id,
          'game_id', detail.game_id,
          'edition_id', detail.edition_id
        )
        order by detail.copy_id
      ) as copy_details
    from ranked_their_copy_details as detail
    where detail.detail_number <= 20
    group by detail.counterpart_id
  ),
  my_copy_details as (
    select distinct
      match.counterpart_id,
      match.copy_id,
      match.game_id,
      match.edition_id
    from their_want_copy_matches as match
  ),
  ranked_my_copy_details as (
    select
      detail.*,
      pg_catalog.row_number() over (
        partition by detail.counterpart_id
        order by detail.copy_id
      ) as detail_number
    from my_copy_details as detail
  ),
  my_copy_arrays as (
    select
      detail.counterpart_id,
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'copy_id', detail.copy_id,
          'game_id', detail.game_id,
          'edition_id', detail.edition_id
        )
        order by detail.copy_id
      ) as copy_details
    from ranked_my_copy_details as detail
    where detail.detail_number <= 20
    group by detail.counterpart_id
  ),
  reciprocal_matches as (
    select
      nearby.counterpart_id,
      nearby.distance_meters,
      my_counts.match_count as caller_match_count,
      their_counts.match_count as counterpart_match_count,
      their_copies.copy_details as counterpart_copy_details,
      my_copies.copy_details as caller_copy_details
    from nearby_users as nearby
    join my_want_counts as my_counts
      on my_counts.counterpart_id = nearby.counterpart_id
    join their_want_counts as their_counts
      on their_counts.counterpart_id = nearby.counterpart_id
    join their_copy_arrays as their_copies
      on their_copies.counterpart_id = nearby.counterpart_id
    join my_copy_arrays as my_copies
      on my_copies.counterpart_id = nearby.counterpart_id
  )
  select
    match.counterpart_id,
    case
      when match.distance_meters < 2000.0 then 'under_2_km'
      when match.distance_meters < 5000.0 then '2_to_5_km'
      when match.distance_meters < 10000.0 then '5_to_10_km'
      when match.distance_meters < 25000.0 then '10_to_25_km'
      when match.distance_meters < 50000.0 then '25_to_50_km'
      when match.distance_meters < 100000.0 then '50_to_100_km'
      else '100_to_200_km'
    end,
    active_total.want_count,
    match.caller_match_count,
    match.counterpart_match_count,
    match.counterpart_copy_details,
    match.caller_copy_details
  from reciprocal_matches as match
  cross join my_active_trade_want_total as active_total
  order by
    match.caller_match_count desc,
    match.counterpart_match_count desc,
    case
      when match.distance_meters < 2000.0 then 1
      when match.distance_meters < 5000.0 then 2
      when match.distance_meters < 10000.0 then 3
      when match.distance_meters < 25000.0 then 4
      when match.distance_meters < 50000.0 then 5
      when match.distance_meters < 100000.0 then 6
      else 7
    end,
    match.counterpart_id
  limit result_limit
  offset result_offset;
end;
$$;

revoke all on function public.get_reciprocal_trade_matches(integer, integer, integer)
from public;
revoke all on function public.get_reciprocal_trade_matches(integer, integer, integer)
from anon;
grant execute on function public.get_reciprocal_trade_matches(integer, integer, integer)
to authenticated;
