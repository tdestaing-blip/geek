create extension if not exists pg_trgm with schema extensions;

create index games_canonical_title_trgm_index
on public.games using gin (canonical_title extensions.gin_trgm_ops);

create index platforms_name_trgm_index
on public.platforms using gin (name extensions.gin_trgm_ops);

create index editions_edition_name_trgm_index
on public.editions using gin (edition_name extensions.gin_trgm_ops)
where edition_name is not null;

create index games_canonical_title_prefix_index
on public.games (pg_catalog.lower(canonical_title) text_pattern_ops);

create index platforms_name_prefix_index
on public.platforms (pg_catalog.lower(name) text_pattern_ops);

create index editions_edition_name_prefix_index
on public.editions (pg_catalog.lower(edition_name) text_pattern_ops)
where edition_name is not null;

create function public.search_catalog(
  search_query text,
  result_limit integer default 20,
  result_offset integer default 0
)
returns table (
  result_kind text,
  entity_id uuid,
  game_id uuid,
  edition_id uuid,
  primary_title text,
  secondary_label text,
  platform_id uuid,
  relevance_score double precision
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  normalized_query text := pg_catalog.lower(
    pg_catalog.btrim(
      pg_catalog.regexp_replace(search_query, '[[:space:]]+', ' ', 'g')
    )
  );
  distinct_token_count integer;
begin
  if result_limit is null or result_limit not between 1 and 50 then
    raise exception 'result_limit must be between 1 and 50.'
      using errcode = '22023';
  end if;

  if result_offset is null or result_offset < 0 then
    raise exception 'result_offset must be greater than or equal to 0.'
      using errcode = '22023';
  end if;

  if normalized_query is null or normalized_query = '' then
    return;
  end if;

  if pg_catalog.char_length(normalized_query) > 120 then
    raise exception 'search_query must be at most 120 characters after normalization.'
      using errcode = '22023';
  end if;

  select pg_catalog.count(*)
  into distinct_token_count
  from (
    select distinct query_term.value
    from pg_catalog.regexp_split_to_table(
      normalized_query,
      '[[:space:]]+'
    ) as query_term(value)
    where query_term.value <> ''
  ) as distinct_query_terms;

  if distinct_token_count > 8 then
    raise exception 'search_query must contain at most 8 distinct tokens.'
      using errcode = '22023';
  end if;

  return query
  with query_terms as (
    select distinct query_term.value
    from pg_catalog.regexp_split_to_table(
      normalized_query,
      '[[:space:]]+'
    ) as query_term(value)
    where query_term.value <> ''
  ),
  game_candidates as (
    select
      game.id,
      game.canonical_title,
      case
        when pg_catalog.lower(game.canonical_title) = normalized_query
          then 1000.0
        when pg_catalog.lower(game.canonical_title) like normalized_query || '%'
          then 800.0
            + case
              when pg_catalog.char_length(normalized_query) >= 3
                then extensions.similarity(
                  game.canonical_title,
                  normalized_query
                )
              else 0.0
            end
        when game.canonical_title ilike '%' || normalized_query || '%'
          then 650.0
            + extensions.similarity(game.canonical_title, normalized_query)
        else 400.0
          + (extensions.similarity(game.canonical_title, normalized_query) * 100.0)
      end as relevance_score
    from public.games as game
    where case
      when pg_catalog.char_length(normalized_query) < 3 then
        pg_catalog.lower(game.canonical_title) = normalized_query
        or pg_catalog.lower(game.canonical_title) like normalized_query || '%'
      else
        game.canonical_title ilike '%' || normalized_query || '%'
        or game.canonical_title operator(extensions.%) normalized_query
      end
    order by relevance_score desc, game.id
    limit 200
  ),
  game_results as (
    select
      'game'::text as result_kind,
      candidate.id as entity_id,
      candidate.id as game_id,
      null::uuid as edition_id,
      candidate.canonical_title as primary_title,
      null::text as secondary_label,
      null::uuid as platform_id,
      candidate.relevance_score
    from game_candidates as candidate
  ),
  phrase_edition_candidates as (
    (
      select edition.id
      from public.editions as edition
      where case
        when pg_catalog.char_length(normalized_query) < 3 then
          pg_catalog.lower(edition.edition_name) = normalized_query
          or pg_catalog.lower(edition.edition_name)
            like normalized_query || '%'
        else
          edition.edition_name ilike '%' || normalized_query || '%'
          or edition.edition_name operator(extensions.%) normalized_query
        end
      order by
        case
          when pg_catalog.lower(edition.edition_name) = normalized_query then 4
          when pg_catalog.lower(edition.edition_name)
            like normalized_query || '%' then 3
          when edition.edition_name ilike '%' || normalized_query || '%' then 2
          else 1
        end desc,
        case
          when pg_catalog.char_length(normalized_query) >= 3
            then extensions.similarity(edition.edition_name, normalized_query)
          else 0.0
        end desc,
        edition.id
      limit 200
    )

    union

    (
      select edition.id
      from public.games as game
      join public.editions as edition on edition.game_id = game.id
      where case
        when pg_catalog.char_length(normalized_query) < 3 then
          pg_catalog.lower(game.canonical_title) = normalized_query
          or pg_catalog.lower(game.canonical_title) like normalized_query || '%'
        else
          game.canonical_title ilike '%' || normalized_query || '%'
          or game.canonical_title operator(extensions.%) normalized_query
        end
      order by
        case
          when pg_catalog.lower(game.canonical_title) = normalized_query then 4
          when pg_catalog.lower(game.canonical_title)
            like normalized_query || '%' then 3
          when game.canonical_title ilike '%' || normalized_query || '%' then 2
          else 1
        end desc,
        case
          when pg_catalog.char_length(normalized_query) >= 3
            then extensions.similarity(game.canonical_title, normalized_query)
          else 0.0
        end desc,
        edition.id
      limit 200
    )

    union

    (
      select edition.id
      from public.platforms as platform
      join public.editions as edition on edition.platform_id = platform.id
      where case
        when pg_catalog.char_length(normalized_query) < 3 then
          pg_catalog.lower(platform.name) = normalized_query
          or pg_catalog.lower(platform.name) like normalized_query || '%'
        else
          platform.name ilike '%' || normalized_query || '%'
          or platform.name operator(extensions.%) normalized_query
        end
      order by
        case
          when pg_catalog.lower(platform.name) = normalized_query then 4
          when pg_catalog.lower(platform.name) like normalized_query || '%'
            then 3
          when platform.name ilike '%' || normalized_query || '%' then 2
          else 1
        end desc,
        case
          when pg_catalog.char_length(normalized_query) >= 3
            then extensions.similarity(platform.name, normalized_query)
          else 0.0
        end desc,
        edition.id
      limit 200
    )
  ),
  edition_term_matches as (
    select query_term.value, candidate.id
    from query_terms as query_term
    cross join lateral (
      select edition.id
      from public.editions as edition
      where case
        when pg_catalog.char_length(query_term.value) < 3 then
          pg_catalog.lower(edition.edition_name) = query_term.value
          or pg_catalog.lower(edition.edition_name)
            like query_term.value || '%'
        else
          edition.edition_name ilike '%' || query_term.value || '%'
          or edition.edition_name operator(extensions.%) query_term.value
        end
      order by
        case
          when pg_catalog.lower(edition.edition_name) = query_term.value then 4
          when pg_catalog.lower(edition.edition_name)
            like query_term.value || '%' then 3
          when edition.edition_name ilike '%' || query_term.value || '%' then 2
          else 1
        end desc,
        case
          when pg_catalog.char_length(query_term.value) >= 3
            then extensions.similarity(edition.edition_name, query_term.value)
          else 0.0
        end desc,
        edition.id
      limit 200
    ) as candidate

    union

    select query_term.value, candidate.id
    from query_terms as query_term
    cross join lateral (
      select edition.id
      from public.games as game
      join public.editions as edition on edition.game_id = game.id
      where case
        when pg_catalog.char_length(query_term.value) < 3 then
          pg_catalog.lower(game.canonical_title) = query_term.value
          or pg_catalog.lower(game.canonical_title) like query_term.value || '%'
        else
          game.canonical_title ilike '%' || query_term.value || '%'
          or game.canonical_title operator(extensions.%) query_term.value
        end
      order by
        case
          when pg_catalog.lower(game.canonical_title) = query_term.value then 4
          when pg_catalog.lower(game.canonical_title)
            like query_term.value || '%' then 3
          when game.canonical_title ilike '%' || query_term.value || '%' then 2
          else 1
        end desc,
        case
          when pg_catalog.char_length(query_term.value) >= 3
            then extensions.similarity(game.canonical_title, query_term.value)
          else 0.0
        end desc,
        edition.id
      limit 200
    ) as candidate

    union

    select query_term.value, candidate.id
    from query_terms as query_term
    cross join lateral (
      select edition.id
      from public.platforms as platform
      join public.editions as edition on edition.platform_id = platform.id
      where case
        when pg_catalog.char_length(query_term.value) < 3 then
          pg_catalog.lower(platform.name) = query_term.value
          or pg_catalog.lower(platform.name) like query_term.value || '%'
        else
          platform.name ilike '%' || query_term.value || '%'
          or platform.name operator(extensions.%) query_term.value
        end
      order by
        case
          when pg_catalog.lower(platform.name) = query_term.value then 4
          when pg_catalog.lower(platform.name) like query_term.value || '%'
            then 3
          when platform.name ilike '%' || query_term.value || '%' then 2
          else 1
        end desc,
        case
          when pg_catalog.char_length(query_term.value) >= 3
            then extensions.similarity(platform.name, query_term.value)
          else 0.0
        end desc,
        edition.id
      limit 200
    ) as candidate
  ),
  token_edition_candidates as (
    select matched_edition.id
    from edition_term_matches as matched_edition
    group by matched_edition.id
    having pg_catalog.count(distinct matched_edition.value) = (
      select pg_catalog.count(*) from query_terms
    )
  ),
  edition_candidate_ids as (
    select candidate.id from phrase_edition_candidates as candidate
    union
    select candidate.id from token_edition_candidates as candidate
  ),
  edition_documents as (
    select
      edition.id,
      edition.game_id,
      edition.platform_id,
      edition.edition_name,
      edition.region_code,
      edition.publisher_name,
      edition.packaging_type,
      game.canonical_title,
      platform.name as platform_name,
      pg_catalog.concat_ws(
        ' ',
        game.canonical_title,
        edition.edition_name,
        platform.name,
        edition.region_code,
        edition.publisher_name,
        edition.packaging_type
      ) as search_document,
      pg_catalog.concat_ws(
        ' · ',
        platform.name,
        edition.edition_name,
        edition.region_code
      ) as secondary_label
    from public.editions as edition
    join edition_candidate_ids as candidate on candidate.id = edition.id
    join public.games as game on game.id = edition.game_id
    join public.platforms as platform on platform.id = edition.platform_id
  ),
  edition_results as (
    select
      'edition'::text as result_kind,
      document.id as entity_id,
      document.game_id,
      document.id as edition_id,
      document.canonical_title as primary_title,
      document.secondary_label,
      document.platform_id,
      case
        when pg_catalog.lower(document.edition_name) = normalized_query
          then 975.0
        when pg_catalog.lower(document.search_document) = normalized_query
          then 950.0
        when pg_catalog.lower(document.canonical_title) = normalized_query
          then 900.0
        when pg_catalog.lower(document.search_document) like normalized_query || '%'
          then 825.0
            + extensions.similarity(document.search_document, normalized_query)
        when document.search_document ilike '%' || normalized_query || '%'
          then 675.0
            + extensions.similarity(document.search_document, normalized_query)
        when not exists (
          select 1
          from query_terms as query_term
          where document.search_document not ilike '%' || query_term.value || '%'
        ) then 600.0
          + extensions.word_similarity(
            normalized_query,
            document.search_document
          )
        else 400.0
          + (
            extensions.word_similarity(
              normalized_query,
              document.search_document
            ) * 100.0
          )
      end as relevance_score
    from edition_documents as document
  ),
  combined_results as (
    select * from game_results
    union all
    select * from edition_results
  )
  select
    result.result_kind,
    result.entity_id,
    result.game_id,
    result.edition_id,
    result.primary_title,
    result.secondary_label,
    result.platform_id,
    result.relevance_score
  from combined_results as result
  order by
    result.relevance_score desc,
    result.result_kind,
    result.primary_title,
    coalesce(result.secondary_label, ''),
    result.entity_id
  limit result_limit
  offset result_offset;
end;
$$;

revoke all on function public.search_catalog(text, integer, integer)
from public, anon, authenticated;
grant execute on function public.search_catalog(text, integer, integer)
to anon, authenticated;

create function public.get_buy_discovery(
  target_game_id uuid,
  target_edition_id uuid default null,
  result_limit integer default 50,
  result_offset integer default 0
)
returns table (
  listing_id uuid,
  copy_id uuid,
  seller_id uuid,
  game_id uuid,
  edition_id uuid,
  asking_amount_minor bigint,
  asking_currency text,
  local_pickup boolean,
  shipping_available boolean,
  published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_game_id is null then
    raise exception 'target_game_id is required.' using errcode = '22023';
  end if;

  if result_limit is null or result_limit not between 1 and 50 then
    raise exception 'result_limit must be between 1 and 50.'
      using errcode = '22023';
  end if;

  if result_offset is null or result_offset < 0 then
    raise exception 'result_offset must be greater than or equal to 0.'
      using errcode = '22023';
  end if;

  if target_edition_id is not null then
    perform 1
    from public.editions as target_edition
    where target_edition.id = target_edition_id
      and target_edition.game_id = target_game_id;

    if not found then
      raise exception 'target_edition_id must belong to target_game_id.'
        using errcode = '23514';
    end if;
  end if;

  return query
  select
    listing.id,
    listing.copy_id,
    listing.seller_id,
    edition.game_id,
    edition.id,
    listing.asking_amount_minor,
    listing.asking_currency,
    listing.local_pickup,
    listing.shipping_available,
    listing.published_at
  from public.listings as listing
  join public.copies as copy on copy.id = listing.copy_id
  join public.editions as edition on edition.id = copy.edition_id
  where listing.status = 'active'
    and edition.game_id = target_game_id
    and (target_edition_id is null or edition.id = target_edition_id)
  order by listing.published_at desc nulls last, listing.id
  limit result_limit
  offset result_offset;
end;
$$;

revoke all on function public.get_buy_discovery(uuid, uuid, integer, integer)
from public, anon, authenticated;
grant execute on function public.get_buy_discovery(uuid, uuid, integer, integer)
to anon, authenticated;

create function public.get_auction_discovery(
  target_game_id uuid,
  target_edition_id uuid default null,
  result_limit integer default 50,
  result_offset integer default 0
)
returns table (
  auction_id uuid,
  copy_id uuid,
  seller_id uuid,
  game_id uuid,
  edition_id uuid,
  starting_amount_minor bigint,
  current_amount_minor bigint,
  currency text,
  min_increment_minor bigint,
  local_pickup boolean,
  shipping_available boolean,
  starts_at timestamptz,
  ends_at timestamptz,
  bid_count integer,
  phase text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  reference_time timestamptz := pg_catalog.statement_timestamp();
begin
  if target_game_id is null then
    raise exception 'target_game_id is required.' using errcode = '22023';
  end if;

  if result_limit is null or result_limit not between 1 and 50 then
    raise exception 'result_limit must be between 1 and 50.'
      using errcode = '22023';
  end if;

  if result_offset is null or result_offset < 0 then
    raise exception 'result_offset must be greater than or equal to 0.'
      using errcode = '22023';
  end if;

  if target_edition_id is not null then
    perform 1
    from public.editions as target_edition
    where target_edition.id = target_edition_id
      and target_edition.game_id = target_game_id;

    if not found then
      raise exception 'target_edition_id must belong to target_game_id.'
        using errcode = '23514';
    end if;
  end if;

  return query
  select
    auction.id,
    auction.copy_id,
    auction.seller_id,
    edition.game_id,
    edition.id,
    auction.starting_amount_minor,
    auction.current_amount_minor,
    auction.currency,
    auction.min_increment_minor,
    auction.local_pickup,
    auction.shipping_available,
    auction.starts_at,
    auction.ends_at,
    auction.bid_count,
    case
      when reference_time < auction.starts_at then 'upcoming'::text
      else 'live'::text
    end
  from public.auctions as auction
  join public.copies as copy on copy.id = auction.copy_id
  join public.editions as edition on edition.id = copy.edition_id
  where auction.status = 'scheduled'
    and reference_time < auction.ends_at
    and edition.game_id = target_game_id
    and (target_edition_id is null or edition.id = target_edition_id)
  order by auction.starts_at, auction.id
  limit result_limit
  offset result_offset;
end;
$$;

revoke all on function public.get_auction_discovery(uuid, uuid, integer, integer)
from public, anon, authenticated;
grant execute on function public.get_auction_discovery(uuid, uuid, integer, integer)
to anon, authenticated;

create function public.get_trade_discovery(
  target_game_id uuid,
  target_edition_id uuid default null,
  result_limit integer default 50,
  result_offset integer default 0
)
returns table (
  copy_id uuid,
  owner_id uuid,
  game_id uuid,
  edition_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if target_game_id is null then
    raise exception 'target_game_id is required.' using errcode = '22023';
  end if;

  if result_limit is null or result_limit not between 1 and 50 then
    raise exception 'result_limit must be between 1 and 50.'
      using errcode = '22023';
  end if;

  if result_offset is null or result_offset < 0 then
    raise exception 'result_offset must be greater than or equal to 0.'
      using errcode = '22023';
  end if;

  if target_edition_id is not null then
    perform 1
    from public.editions as target_edition
    where target_edition.id = target_edition_id
      and target_edition.game_id = target_game_id;

    if not found then
      raise exception 'target_edition_id must belong to target_game_id.'
        using errcode = '23514';
    end if;
  end if;

  return query
  select
    copy.id,
    copy.owner_id,
    edition.game_id,
    edition.id
  from public.copies as copy
  join public.editions as edition on edition.id = copy.edition_id
  where copy.trade_availability = 'open_to_trade'
    and edition.game_id = target_game_id
    and (target_edition_id is null or edition.id = target_edition_id)
  order by copy.created_at desc, copy.id
  limit result_limit
  offset result_offset;
end;
$$;

revoke all on function public.get_trade_discovery(uuid, uuid, integer, integer)
from public, anon, authenticated;
grant execute on function public.get_trade_discovery(uuid, uuid, integer, integer)
to authenticated;

create function public.get_collector_discovery(
  target_game_id uuid,
  target_edition_id uuid default null,
  result_limit integer default 50,
  result_offset integer default 0
)
returns table (
  copy_id uuid,
  owner_id uuid,
  game_id uuid,
  edition_id uuid
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if target_game_id is null then
    raise exception 'target_game_id is required.' using errcode = '22023';
  end if;

  if result_limit is null or result_limit not between 1 and 50 then
    raise exception 'result_limit must be between 1 and 50.'
      using errcode = '22023';
  end if;

  if result_offset is null or result_offset < 0 then
    raise exception 'result_offset must be greater than or equal to 0.'
      using errcode = '22023';
  end if;

  if target_edition_id is not null then
    perform 1
    from public.editions as target_edition
    where target_edition.id = target_edition_id
      and target_edition.game_id = target_game_id;

    if not found then
      raise exception 'target_edition_id must belong to target_game_id.'
        using errcode = '23514';
    end if;
  end if;

  return query
  select
    copy.id,
    copy.owner_id,
    edition.game_id,
    edition.id
  from public.copies as copy
  join public.editions as edition on edition.id = copy.edition_id
  where copy.visibility = 'public'
    and edition.game_id = target_game_id
    and (target_edition_id is null or edition.id = target_edition_id)
  order by copy.created_at desc, copy.id
  limit result_limit
  offset result_offset;
end;
$$;

revoke all on function public.get_collector_discovery(uuid, uuid, integer, integer)
from public, anon, authenticated;
grant execute on function public.get_collector_discovery(uuid, uuid, integer, integer)
to anon, authenticated;

create function public.get_discovery_summary(
  target_game_id uuid,
  target_edition_id uuid default null
)
returns table (
  buy_count bigint,
  buy_shipping_count bigint,
  buy_local_pickup_count bigint,
  auction_upcoming_count bigint,
  auction_live_count bigint,
  auction_shipping_count bigint,
  auction_local_pickup_count bigint,
  trade_count bigint,
  collector_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  reference_time timestamptz := pg_catalog.statement_timestamp();
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if target_game_id is null then
    raise exception 'target_game_id is required.' using errcode = '22023';
  end if;

  if target_edition_id is not null then
    perform 1
    from public.editions as target_edition
    where target_edition.id = target_edition_id
      and target_edition.game_id = target_game_id;

    if not found then
      raise exception 'target_edition_id must belong to target_game_id.'
        using errcode = '23514';
    end if;
  end if;

  return query
  with buy_counts as (
    select
      pg_catalog.count(*) as total,
      pg_catalog.count(*) filter (where listing.shipping_available) as shipping,
      pg_catalog.count(*) filter (where listing.local_pickup) as local_pickup
    from public.listings as listing
    join public.copies as copy on copy.id = listing.copy_id
    join public.editions as edition on edition.id = copy.edition_id
    where listing.status = 'active'
      and edition.game_id = target_game_id
      and (target_edition_id is null or edition.id = target_edition_id)
  ),
  auction_counts as (
    select
      pg_catalog.count(*) filter (
        where reference_time < auction.starts_at
      ) as upcoming,
      pg_catalog.count(*) filter (
        where auction.starts_at <= reference_time
          and reference_time < auction.ends_at
      ) as live,
      pg_catalog.count(*) filter (
        where auction.shipping_available
      ) as shipping,
      pg_catalog.count(*) filter (
        where auction.local_pickup
      ) as local_pickup
    from public.auctions as auction
    join public.copies as copy on copy.id = auction.copy_id
    join public.editions as edition on edition.id = copy.edition_id
    where auction.status = 'scheduled'
      and reference_time < auction.ends_at
      and edition.game_id = target_game_id
      and (target_edition_id is null or edition.id = target_edition_id)
  ),
  trade_counts as (
    select pg_catalog.count(*) as total
    from public.copies as copy
    join public.editions as edition on edition.id = copy.edition_id
    where copy.trade_availability = 'open_to_trade'
      and edition.game_id = target_game_id
      and (target_edition_id is null or edition.id = target_edition_id)
  ),
  collector_counts as (
    select pg_catalog.count(*) as total
    from public.copies as copy
    join public.editions as edition on edition.id = copy.edition_id
    where copy.visibility = 'public'
      and edition.game_id = target_game_id
      and (target_edition_id is null or edition.id = target_edition_id)
  )
  select
    buy_counts.total,
    buy_counts.shipping,
    buy_counts.local_pickup,
    auction_counts.upcoming,
    auction_counts.live,
    auction_counts.shipping,
    auction_counts.local_pickup,
    trade_counts.total,
    collector_counts.total
  from buy_counts
  cross join auction_counts
  cross join trade_counts
  cross join collector_counts;
end;
$$;

revoke all on function public.get_discovery_summary(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.get_discovery_summary(uuid, uuid)
to authenticated;
