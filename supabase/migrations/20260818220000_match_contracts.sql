-- Match eligibility is calculated from current canonical state. This internal
-- function is the single implementation of WishlistIntent-to-Copy semantics
-- used by every public Match projection.
create function public.evaluate_wishlist_copy_match(
  subject_intent_id uuid,
  candidate_copy_id uuid
)
returns table (
  target_kind text,
  completeness_preferred_satisfied boolean,
  completeness_required_satisfied boolean,
  condition_requirement_satisfied boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with candidate as (
    select
      intent.game_id as intent_game_id,
      intent.edition_id as intent_edition_id,
      intent.preferred_region_code,
      intent.completeness_preference,
      intent.minimum_component_condition_grade,
      copy.game_id as copy_game_id,
      copy.edition_id as copy_edition_id,
      edition.region_code,
      copy.edition_id is not null and exists (
        select 1
        from public.edition_components as component
        where component.edition_id = copy.edition_id
      ) as component_model_available,
      copy.edition_id is not null and exists (
        select 1
        from public.edition_components as component
        where component.edition_id = copy.edition_id
      ) and not exists (
        select 1
        from public.edition_components as component
        left join public.copy_component_states as state
          on state.edition_component_id = component.id
         and state.copy_id = copy.id
        where component.edition_id = copy.edition_id
          and component.required_for_complete
          and (state.copy_id is null or state.presence <> 'present')
      ) as is_complete,
      copy.edition_id is not null and exists (
        select 1
        from public.edition_components as component
        where component.edition_id = copy.edition_id
      ) and not exists (
        select 1
        from public.edition_components as component
        left join public.copy_component_states as state
          on state.edition_component_id = component.id
         and state.copy_id = copy.id
        where component.edition_id = copy.edition_id
          and (
            state.copy_id is null
            or state.presence = 'unknown'
            or (
              state.presence = 'present'
              and (
                state.condition_grade is null
                or state.condition_grade < intent.minimum_component_condition_grade
              )
            )
          )
      ) as meets_condition
    from public.wishlist_intents as intent
    join public.copies as copy on copy.id = candidate_copy_id
    left join public.editions as edition on edition.id = copy.edition_id
    where intent.id = subject_intent_id
  )
  select
    case when candidate.intent_edition_id is null
      then 'broad_game_match'
      else 'exact_edition_match'
    end,
    case when candidate.completeness_preference = 'complete_preferred'
      then candidate.is_complete
      else null
    end,
    candidate.completeness_preference <> 'complete_required' or candidate.is_complete,
    candidate.minimum_component_condition_grade is null or candidate.meets_condition
  from candidate
  where candidate.intent_game_id = candidate.copy_game_id
    and (
      candidate.intent_edition_id is null
      or candidate.intent_edition_id = candidate.copy_edition_id
    )
    and (
      candidate.preferred_region_code is null
      or candidate.region_code = candidate.preferred_region_code
    )
    and (
      candidate.completeness_preference <> 'complete_required'
      or candidate.is_complete
    )
    and (
      candidate.minimum_component_condition_grade is null
      or candidate.meets_condition
    );
$$;

revoke all on function public.evaluate_wishlist_copy_match(uuid, uuid)
from public, anon, authenticated;

create function public.get_wishlist_matches(
  wishlist_intent_id uuid,
  result_limit integer default 20,
  result_offset integer default 0
)
returns table (
  intent_id uuid,
  copy_id uuid,
  collector_id uuid,
  collector_username text,
  collector_display_name text,
  collector_avatar_path text,
  game_id uuid,
  edition_id uuid,
  target_kind text,
  completeness_preferred_satisfied boolean,
  completeness_required_satisfied boolean,
  condition_requirement_satisfied boolean,
  distance_bucket text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Authentication is required for Wishlist matches.' using errcode = '42501';
  end if;
  if result_limit is null or result_limit < 1 or result_limit > 50
    or result_offset is null or result_offset < 0 then
    raise exception 'Invalid Match pagination.' using errcode = '22023';
  end if;

  return query
  select
    intent.id,
    copy.id,
    profile.id,
    profile.username,
    profile.display_name,
    profile.avatar_path,
    copy.game_id,
    copy.edition_id,
    eligibility.target_kind,
    eligibility.completeness_preferred_satisfied,
    eligibility.completeness_required_satisfied,
    eligibility.condition_requirement_satisfied,
    case
      when candidate_distance.distance_meters < 2000 then 'under_2_km'
      when candidate_distance.distance_meters < 5000 then '2_to_5_km'
      when candidate_distance.distance_meters < 10000 then '5_to_10_km'
      when candidate_distance.distance_meters < 25000 then '10_to_25_km'
      when candidate_distance.distance_meters < 50000 then '25_to_50_km'
      when candidate_distance.distance_meters < 100000 then '50_to_100_km'
      when candidate_distance.distance_meters <= 200000 then '100_to_200_km'
      else null
    end
  from public.wishlist_intents as intent
  join public.copies as copy
    on copy.owner_id <> caller_id
   and copy.availability = 'open_to_trade'
  join public.profiles as profile on profile.id = copy.owner_id
  left join public.wishlist_intent_private_details as private_details
    on private_details.wishlist_intent_id = intent.id
  left join public.user_discovery_locations as caller_location
    on caller_location.user_id = caller_id
  left join public.user_discovery_locations as collector_location
    on collector_location.user_id = copy.owner_id
  cross join lateral (
    select case
      when caller_location.location is null or collector_location.location is null then null
      else extensions.st_distance(
        public.derive_matching_location(caller_location.location),
        public.derive_matching_location(collector_location.location)
      )
    end as distance_meters
  ) as candidate_distance
  cross join lateral (
    select case
      when private_details.max_trade_distance_km is null then null
      when private_details.max_trade_distance_km < 5 then 2
      when private_details.max_trade_distance_km < 10 then 5
      when private_details.max_trade_distance_km < 25 then 10
      when private_details.max_trade_distance_km < 50 then 25
      when private_details.max_trade_distance_km < 100 then 50
      when private_details.max_trade_distance_km < 200 then 100
      else 200
    end::double precision * 1000.0 as max_meters
  ) as private_distance_limit
  cross join lateral public.evaluate_wishlist_copy_match(intent.id, copy.id) as eligibility
  where intent.id = $1
    and intent.owner_id = caller_id
    and intent.status = 'active'
    and intent.trade_interest
    and (
      private_details.max_trade_distance_km is null
      or (
        private_details.max_trade_distance_km >= 2
        and candidate_distance.distance_meters is not null
        and (
          (private_distance_limit.max_meters = 200000.0
            and candidate_distance.distance_meters <= private_distance_limit.max_meters)
          or (private_distance_limit.max_meters < 200000.0
            and candidate_distance.distance_meters < private_distance_limit.max_meters)
        )
      )
    )
    and not exists (
      select 1 from public.copy_commercial_commitments as commitment
      where commitment.copy_id = copy.id
    )
  order by copy.id
  limit result_limit offset result_offset;
end;
$$;

revoke all on function public.get_wishlist_matches(uuid, integer, integer) from public, anon;
grant execute on function public.get_wishlist_matches(uuid, integer, integer) to authenticated;

create function public.get_listing_matches(
  wishlist_intent_id uuid,
  result_limit integer default 20,
  result_offset integer default 0
)
returns table (
  intent_id uuid,
  listing_id uuid,
  copy_id uuid,
  seller_id uuid,
  seller_username text,
  seller_display_name text,
  seller_avatar_path text,
  game_id uuid,
  edition_id uuid,
  asking_amount_minor bigint,
  asking_currency text,
  target_kind text,
  completeness_preferred_satisfied boolean,
  completeness_required_satisfied boolean,
  condition_requirement_satisfied boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Authentication is required for Listing matches.' using errcode = '42501';
  end if;
  if result_limit is null or result_limit < 1 or result_limit > 50
    or result_offset is null or result_offset < 0 then
    raise exception 'Invalid Match pagination.' using errcode = '22023';
  end if;

  return query
  select
    intent.id,
    listing.id,
    copy.id,
    profile.id,
    profile.username,
    profile.display_name,
    profile.avatar_path,
    copy.game_id,
    copy.edition_id,
    listing.asking_amount_minor,
    listing.asking_currency,
    eligibility.target_kind,
    eligibility.completeness_preferred_satisfied,
    eligibility.completeness_required_satisfied,
    eligibility.condition_requirement_satisfied
  from public.wishlist_intents as intent
  join public.listings as listing
    on listing.seller_id <> caller_id
   and listing.status = 'active'
  join public.copies as copy
    on copy.id = listing.copy_id
   and copy.owner_id = listing.seller_id
   and copy.availability = 'for_sale'
  join public.copy_commercial_commitments as commitment
    on commitment.copy_id = copy.id
   and commitment.kind = 'listing'
   and commitment.listing_id = listing.id
  join public.profiles as profile on profile.id = listing.seller_id
  cross join lateral public.evaluate_wishlist_copy_match(intent.id, copy.id) as eligibility
  where intent.id = $1
    and intent.owner_id = caller_id
    and intent.status = 'active'
    and intent.purchase_interest
  order by listing.published_at desc nulls last, listing.id
  limit result_limit offset result_offset;
end;
$$;

revoke all on function public.get_listing_matches(uuid, integer, integer) from public, anon;
grant execute on function public.get_listing_matches(uuid, integer, integer) to authenticated;

-- Canonical reciprocal pair projection. It reuses the same eligibility helper
-- twice, once for each direction, and exposes only safe identities and a coarse
-- derived distance bucket.
create function public.get_my_reciprocal_trade_match_pairs(
  max_distance_km integer default 25,
  result_limit integer default 20,
  result_offset integer default 0
)
returns table (
  collector_id uuid,
  collector_username text,
  collector_display_name text,
  collector_avatar_path text,
  my_intent_id uuid,
  their_copy_id uuid,
  their_copy_game_id uuid,
  their_copy_edition_id uuid,
  my_target_kind text,
  my_completeness_preferred_satisfied boolean,
  my_completeness_required_satisfied boolean,
  my_condition_requirement_satisfied boolean,
  their_intent_id uuid,
  my_copy_id uuid,
  my_copy_game_id uuid,
  my_copy_edition_id uuid,
  their_target_kind text,
  their_completeness_preferred_satisfied boolean,
  their_completeness_required_satisfied boolean,
  their_condition_requirement_satisfied boolean,
  distance_bucket text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_location extensions.geography;
  caller_matching_location extensions.geography;
  requested_meters double precision;
begin
  if caller_id is null then
    raise exception 'Authentication is required for reciprocal matches.' using errcode = '42501';
  end if;
  if max_distance_km is null or max_distance_km not in (2, 5, 10, 25, 50, 100, 200)
    or result_limit is null or result_limit < 1 or result_limit > 50
    or result_offset is null or result_offset < 0 then
    raise exception 'Invalid reciprocal Match parameters.' using errcode = '22023';
  end if;

  select location.location into caller_location
  from public.user_discovery_locations as location
  where location.user_id = caller_id;
  if caller_location is null then
    raise exception 'A discovery location is required for reciprocal matching.' using errcode = 'P0002';
  end if;
  caller_matching_location := public.derive_matching_location(caller_location);
  requested_meters := max_distance_km::double precision * 1000.0;

  return query
  with nearby as materialized (
    select
      location.user_id,
      extensions.st_distance(
        caller_matching_location,
        public.derive_matching_location(location.location)
      ) as distance_meters
    from public.user_discovery_locations as location
    where location.user_id <> caller_id
      and extensions.st_dwithin(location.location, caller_location, requested_meters + 1500.0)
  ), eligible_nearby as materialized (
    select nearby.* from nearby
    where (max_distance_km = 200 and nearby.distance_meters <= requested_meters)
       or (max_distance_km < 200 and nearby.distance_meters < requested_meters)
  )
  select
    profile.id,
    profile.username,
    profile.display_name,
    profile.avatar_path,
    my_intent.id,
    their_copy.id,
    their_copy.game_id,
    their_copy.edition_id,
    my_eligibility.target_kind,
    my_eligibility.completeness_preferred_satisfied,
    my_eligibility.completeness_required_satisfied,
    my_eligibility.condition_requirement_satisfied,
    their_intent.id,
    my_copy.id,
    my_copy.game_id,
    my_copy.edition_id,
    their_eligibility.target_kind,
    their_eligibility.completeness_preferred_satisfied,
    their_eligibility.completeness_required_satisfied,
    their_eligibility.condition_requirement_satisfied,
    case
      when nearby.distance_meters < 2000 then 'under_2_km'
      when nearby.distance_meters < 5000 then '2_to_5_km'
      when nearby.distance_meters < 10000 then '5_to_10_km'
      when nearby.distance_meters < 25000 then '10_to_25_km'
      when nearby.distance_meters < 50000 then '25_to_50_km'
      when nearby.distance_meters < 100000 then '50_to_100_km'
      else '100_to_200_km'
    end
  from eligible_nearby as nearby
  join public.profiles as profile on profile.id = nearby.user_id
  join public.copies as their_copy
    on their_copy.owner_id = nearby.user_id
   and their_copy.availability = 'open_to_trade'
  join public.wishlist_intents as my_intent
    on my_intent.owner_id = caller_id
   and my_intent.status = 'active'
   and my_intent.trade_interest
  cross join lateral public.evaluate_wishlist_copy_match(my_intent.id, their_copy.id) as my_eligibility
  join public.wishlist_intents as their_intent
    on their_intent.owner_id = nearby.user_id
   and their_intent.status = 'active'
   and their_intent.visibility = 'public'
   and their_intent.trade_interest
  join public.copies as my_copy
    on my_copy.owner_id = caller_id
   and my_copy.availability = 'open_to_trade'
  cross join lateral public.evaluate_wishlist_copy_match(their_intent.id, my_copy.id) as their_eligibility
  left join public.wishlist_intent_private_details as my_private
    on my_private.wishlist_intent_id = my_intent.id
  left join public.wishlist_intent_private_details as their_private
    on their_private.wishlist_intent_id = their_intent.id
  cross join lateral (
    select least(
      max_distance_km,
      case
        when my_private.max_trade_distance_km is null then max_distance_km
        when my_private.max_trade_distance_km < 5 then 2
        when my_private.max_trade_distance_km < 10 then 5
        when my_private.max_trade_distance_km < 25 then 10
        when my_private.max_trade_distance_km < 50 then 25
        when my_private.max_trade_distance_km < 100 then 50
        when my_private.max_trade_distance_km < 200 then 100
        else 200
      end
    )::double precision * 1000.0 as max_meters
  ) as my_distance_limit
  cross join lateral (
    select least(
      max_distance_km,
      case
        when their_private.max_trade_distance_km is null then max_distance_km
        when their_private.max_trade_distance_km < 5 then 2
        when their_private.max_trade_distance_km < 10 then 5
        when their_private.max_trade_distance_km < 25 then 10
        when their_private.max_trade_distance_km < 50 then 25
        when their_private.max_trade_distance_km < 100 then 50
        when their_private.max_trade_distance_km < 200 then 100
        else 200
      end
    )::double precision * 1000.0 as max_meters
  ) as their_distance_limit
  where not exists (
      select 1 from public.copy_commercial_commitments as commitment
      where commitment.copy_id in (their_copy.id, my_copy.id)
    )
    and (my_private.max_trade_distance_km is null or my_private.max_trade_distance_km >= 2)
    and (their_private.max_trade_distance_km is null or their_private.max_trade_distance_km >= 2)
    and (
      (my_distance_limit.max_meters = 200000.0 and nearby.distance_meters <= my_distance_limit.max_meters)
      or (my_distance_limit.max_meters < 200000.0 and nearby.distance_meters < my_distance_limit.max_meters)
    )
    and (
      (their_distance_limit.max_meters = 200000.0 and nearby.distance_meters <= their_distance_limit.max_meters)
      or (their_distance_limit.max_meters < 200000.0 and nearby.distance_meters < their_distance_limit.max_meters)
    )
  order by nearby.distance_meters, profile.id, my_intent.id, their_copy.id, their_intent.id, my_copy.id
  limit result_limit offset result_offset;
end;
$$;

revoke all on function public.get_my_reciprocal_trade_match_pairs(integer, integer, integer)
from public, anon;
grant execute on function public.get_my_reciprocal_trade_match_pairs(integer, integer, integer)
to authenticated;

-- No repository caller remains for the legacy aggregate RPC. Retire it rather
-- than retain a bounded adapter with observably divergent aggregation.
drop function public.get_reciprocal_trade_matches(integer, integer, integer);

drop view public.wishlist_private_details;
drop view public.wishlist_items;
