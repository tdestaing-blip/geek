create table public.albums (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  target_kind text not null,
  publication_state text not null default 'draft',
  editorial_position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint albums_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint albums_title_nonblank check (btrim(title) <> ''),
  constraint albums_description_nonblank check (
    description is null or btrim(description) <> ''
  ),
  constraint albums_target_kind_allowed check (target_kind in ('game', 'edition')),
  constraint albums_publication_state_allowed check (
    publication_state in ('draft', 'published')
  ),
  constraint albums_editorial_position_nonnegative check (editorial_position >= 0)
);

create table public.album_entries (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums (id) on delete cascade,
  position integer not null,
  game_id uuid not null references public.games (id) on delete restrict,
  edition_id uuid,
  created_at timestamptz not null default now(),
  constraint album_entries_position_positive check (position > 0),
  constraint album_entries_edition_game_foreign_key foreign key (edition_id, game_id)
    references public.editions (id, game_id) on delete restrict,
  constraint album_entries_album_position_unique unique (album_id, position)
);

create unique index album_entries_game_target_unique
on public.album_entries (album_id, game_id)
where edition_id is null;

create unique index album_entries_edition_target_unique
on public.album_entries (album_id, edition_id)
where edition_id is not null;

create index album_entries_album_order_index
on public.album_entries (album_id, position, id);

create function public.validate_album_entry_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  album_target_kind text;
begin
  select album.target_kind into album_target_kind
  from public.albums as album
  where album.id = new.album_id
  for update;

  if album_target_kind is null then
    raise exception 'AlbumEntry must reference an Album.' using errcode = '23503';
  elsif album_target_kind = 'game' and new.edition_id is not null then
    raise exception 'A Game Album entry cannot target an Edition.' using errcode = '23514';
  elsif album_target_kind = 'edition' and new.edition_id is null then
    raise exception 'An Edition Album entry must target an Edition.' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_album_entry_target()
from public, anon, authenticated;

create trigger album_entries_validate_target
before insert or update of album_id, game_id, edition_id on public.album_entries
for each row execute function public.validate_album_entry_target();

create function public.validate_album_definition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.publication_state = 'published' then
      raise exception 'An Album must be curated before publication.' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.target_kind is distinct from old.target_kind and exists (
    select 1
    from public.album_entries as entry
    where entry.album_id = old.id
      and (
        (new.target_kind = 'game' and entry.edition_id is not null)
        or (new.target_kind = 'edition' and entry.edition_id is null)
      )
  ) then
    raise exception 'Album target kind is incompatible with its entries.' using errcode = '23514';
  end if;

  if new.publication_state = 'published'
    and old.publication_state is distinct from 'published'
    and not exists (
      select 1 from public.album_entries as entry where entry.album_id = old.id
    ) then
    raise exception 'An empty Album cannot be published.' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_album_definition()
from public, anon, authenticated;

create trigger albums_validate_definition
before insert or update of target_kind, publication_state on public.albums
for each row execute function public.validate_album_definition();

create function public.prevent_empty_published_album()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  album_publication_state text;
begin
  select album.publication_state into album_publication_state
  from public.albums as album
  where album.id = old.album_id
  for update;

  if album_publication_state = 'published' and not exists (
    select 1
    from public.album_entries as entry
    where entry.album_id = old.album_id
      and entry.id <> old.id
  ) then
    raise exception 'The final entry of a published Album cannot be removed.' using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_empty_published_album()
from public, anon, authenticated;

create trigger album_entries_prevent_empty_published_album
before delete or update of album_id on public.album_entries
for each row execute function public.prevent_empty_published_album();

create trigger albums_set_updated_at
before update on public.albums
for each row execute function public.set_updated_at();

alter table public.albums enable row level security;
alter table public.album_entries enable row level security;

revoke all privileges on table public.albums from public, anon, authenticated;
revoke all privileges on table public.album_entries from public, anon, authenticated;

grant select on table public.albums to anon, authenticated;
grant select on table public.album_entries to anon, authenticated;
grant all privileges on table public.albums to service_role;
grant all privileges on table public.album_entries to service_role;

create policy albums_public_read_published
on public.albums
for select
to anon, authenticated
using (publication_state = 'published');

create policy album_entries_public_read_published
on public.album_entries
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.albums as album
    where album.id = album_entries.album_id
      and album.publication_state = 'published'
  )
);

create function public.get_albums(
  result_limit integer default 20,
  result_offset integer default 0
)
returns table (
  album_id uuid,
  slug text,
  title text,
  description text,
  target_kind text,
  total_slots bigint,
  owned_slots bigint,
  missing_slots bigint,
  wanted_slots bigint
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
    raise exception 'Authentication is required for Album progress.' using errcode = '42501';
  end if;
  if result_limit is null or result_limit < 1 or result_limit > 50
    or result_offset is null or result_offset < 0 then
    raise exception 'Invalid Album pagination.' using errcode = '22023';
  end if;

  return query
  select
    album.id,
    album.slug,
    album.title,
    album.description,
    album.target_kind,
    count(entry.id),
    count(entry.id) filter (where state.owned),
    count(entry.id) filter (where not state.owned),
    count(entry.id) filter (where state.wanted)
  from public.albums as album
  join public.album_entries as entry on entry.album_id = album.id
  left join public.editions as edition on edition.id = entry.edition_id
  cross join lateral (
    select
      exists (
        select 1
        from public.copies as copy
        where copy.owner_id = caller_id
          and copy.game_id = entry.game_id
          and (album.target_kind = 'game' or copy.edition_id = entry.edition_id)
      ) as owned,
      exists (
        select 1
        from public.wishlist_intents as intent
        where intent.owner_id = caller_id
          and intent.status = 'active'
          and intent.game_id = entry.game_id
          and (
            album.target_kind = 'game'
            or intent.edition_id = entry.edition_id
            or (
              intent.edition_id is null
              and (
                intent.preferred_region_code is null
                or intent.preferred_region_code = edition.region_code
              )
            )
          )
      ) as wanted
  ) as state
  where album.publication_state = 'published'
  group by album.id
  order by album.editorial_position, album.title, album.id
  limit result_limit offset result_offset;
end;
$$;

revoke all on function public.get_albums(integer, integer) from public, anon;
grant execute on function public.get_albums(integer, integer) to authenticated;

create function public.get_album_detail(
  album_id_or_slug text,
  result_limit integer default 50,
  result_offset integer default 0
)
returns table (
  album_id uuid,
  album_slug text,
  album_title text,
  album_description text,
  album_target_kind text,
  total_slots bigint,
  owned_slots bigint,
  missing_slots bigint,
  wanted_slots bigint,
  entry_id uuid,
  entry_position integer,
  game_id uuid,
  game_title text,
  edition_id uuid,
  edition_name text,
  edition_region_code text,
  edition_platform_id uuid,
  edition_platform_name text,
  owned boolean,
  missing boolean,
  wanted boolean,
  collector_count bigint,
  trade_collector_count bigint,
  active_listing_count bigint
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
    raise exception 'Authentication is required for Album detail.' using errcode = '42501';
  end if;
  if album_id_or_slug is null or btrim(album_id_or_slug) = ''
    or result_limit is null or result_limit < 1 or result_limit > 100
    or result_offset is null or result_offset < 0 then
    raise exception 'Invalid Album detail parameters.' using errcode = '22023';
  end if;

  return query
  with selected_album as materialized (
    select album.*
    from public.albums as album
    where album.publication_state = 'published'
      and (album.id::text = album_id_or_slug or album.slug = album_id_or_slug)
    order by case when album.id::text = album_id_or_slug then 0 else 1 end
    limit 1
  ), states as materialized (
    select
      entry.id as entry_id,
      exists (
        select 1
        from public.copies as copy
        where copy.owner_id = caller_id
          and copy.game_id = entry.game_id
          and (album.target_kind = 'game' or copy.edition_id = entry.edition_id)
      ) as owned,
      exists (
        select 1
        from public.wishlist_intents as intent
        left join public.editions as target_edition on target_edition.id = entry.edition_id
        where intent.owner_id = caller_id
          and intent.status = 'active'
          and intent.game_id = entry.game_id
          and (
            album.target_kind = 'game'
            or intent.edition_id = entry.edition_id
            or (
              intent.edition_id is null
              and (
                intent.preferred_region_code is null
                or intent.preferred_region_code = target_edition.region_code
              )
            )
          )
      ) as wanted
    from selected_album as album
    join public.album_entries as entry on entry.album_id = album.id
  ), progress as materialized (
    select
      count(*) as total_slots,
      count(*) filter (where states.owned) as owned_slots,
      count(*) filter (where not states.owned) as missing_slots,
      count(*) filter (where states.wanted) as wanted_slots
    from states
  )
  select
    album.id,
    album.slug,
    album.title,
    album.description,
    album.target_kind,
    progress.total_slots,
    progress.owned_slots,
    progress.missing_slots,
    progress.wanted_slots,
    entry.id,
    entry.position,
    game.id,
    game.canonical_title,
    edition.id,
    edition.edition_name,
    edition.region_code,
    platform.id,
    platform.name,
    states.owned,
    not states.owned,
    states.wanted,
    network.collector_count,
    network.trade_collector_count,
    network.active_listing_count
  from selected_album as album
  join public.album_entries as entry on entry.album_id = album.id
  join states on states.entry_id = entry.id
  cross join progress
  join public.games as game on game.id = entry.game_id
  left join public.editions as edition on edition.id = entry.edition_id
  left join public.platforms as platform on platform.id = edition.platform_id
  cross join lateral (
    select
      count(distinct copy.owner_id) filter (
        where copy.visibility = 'public'
          or (
            copy.availability = 'open_to_trade'
            and not exists (
              select 1
              from public.copy_commercial_commitments as commitment
              where commitment.copy_id = copy.id
            )
          )
          or exists (
            select 1
            from public.listings as listing
            join public.copy_commercial_commitments as commitment
              on commitment.copy_id = copy.id
             and commitment.kind = 'listing'
             and commitment.listing_id = listing.id
            where listing.copy_id = copy.id
              and listing.seller_id = copy.owner_id
              and listing.status = 'active'
              and copy.availability = 'for_sale'
          )
      ) as collector_count,
      count(distinct copy.owner_id) filter (
        where copy.availability = 'open_to_trade'
          and not exists (
            select 1
            from public.copy_commercial_commitments as commitment
            where commitment.copy_id = copy.id
          )
      ) as trade_collector_count,
      count(distinct listing.id) filter (
        where listing.status = 'active'
          and listing.seller_id = copy.owner_id
          and copy.availability = 'for_sale'
          and exists (
            select 1
            from public.copy_commercial_commitments as commitment
            where commitment.copy_id = copy.id
              and commitment.kind = 'listing'
              and commitment.listing_id = listing.id
          )
      ) as active_listing_count
    from public.copies as copy
    left join public.listings as listing on listing.copy_id = copy.id
    where copy.owner_id <> caller_id
      and copy.game_id = entry.game_id
      and (album.target_kind = 'game' or copy.edition_id = entry.edition_id)
  ) as network
  order by entry.position, entry.id
  limit result_limit offset result_offset;
end;
$$;

revoke all on function public.get_album_detail(text, integer, integer) from public, anon;
grant execute on function public.get_album_detail(text, integer, integer) to authenticated;
