alter table public.game_provider_mappings
add column source_title text,
add column updated_at timestamptz not null default now(),
add constraint game_provider_mappings_source_title_nonblank check (
  source_title is null or btrim(source_title) <> ''
);

alter table public.edition_provider_mappings
add column source_title text,
add column updated_at timestamptz not null default now(),
add constraint edition_provider_mappings_source_title_nonblank check (
  source_title is null or btrim(source_title) <> ''
);

create trigger game_provider_mappings_set_updated_at
before update on public.game_provider_mappings
for each row execute function public.set_updated_at();

create trigger edition_provider_mappings_set_updated_at
before update on public.edition_provider_mappings
for each row execute function public.set_updated_at();

create table public.catalog_import_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_revision text not null,
  platform_id uuid not null references public.platforms (id) on delete restrict,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  status text not null,
  dry_run boolean not null default false,
  summary jsonb not null,
  constraint catalog_import_runs_provider_lowercase check (
    provider = lower(provider)
  ),
  constraint catalog_import_runs_provider_nonblank check (btrim(provider) <> ''),
  constraint catalog_import_runs_provider_revision_nonblank check (
    btrim(provider_revision) <> ''
  ),
  constraint catalog_import_runs_time_order check (completed_at >= started_at),
  constraint catalog_import_runs_status_valid check (
    status in ('succeeded', 'failed')
  ),
  constraint catalog_import_runs_summary_object check (
    jsonb_typeof(summary) = 'object'
  )
);

create index catalog_import_runs_provider_revision_index
on public.catalog_import_runs (provider, provider_revision, completed_at desc);

create index catalog_import_runs_platform_index
on public.catalog_import_runs (platform_id, completed_at desc);

alter table public.catalog_import_runs enable row level security;

revoke all privileges on table public.catalog_import_runs
from public, anon, authenticated;

grant all privileges on table public.catalog_import_runs to service_role;

create function public.import_catalog_batch(
  provider_name text,
  provider_revision text,
  platform_slug text,
  platform_name text,
  platform_manufacturer text,
  normalized_games jsonb,
  import_summary jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  started_at_value timestamptz := pg_catalog.clock_timestamp();
  platform_id_value uuid;
  game_record jsonb;
  edition_record jsonb;
  identifier_record jsonb;
  game_id_value uuid;
  edition_id_value uuid;
  existing_game_ids uuid[];
  mapped_game_id uuid;
  mapped_platform_id uuid;
  row_count_value integer;
  games_created integer := 0;
  games_unchanged integer := 0;
  editions_created integer := 0;
  editions_unchanged integer := 0;
  identifiers_created integer := 0;
  mappings_updated integer := 0;
  run_id_value uuid;
  database_summary jsonb;
  final_summary jsonb;
begin
  if provider_name is null
    or pg_catalog.btrim(provider_name) = ''
    or provider_name <> pg_catalog.lower(provider_name)
  then
    raise exception 'provider_name must be a nonblank lowercase identifier.'
      using errcode = '22023';
  end if;

  if provider_revision is null or pg_catalog.btrim(provider_revision) = '' then
    raise exception 'provider_revision must be nonblank.'
      using errcode = '22023';
  end if;

  if platform_slug is null
    or platform_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or platform_name is null
    or pg_catalog.btrim(platform_name) = ''
  then
    raise exception 'platform identity is invalid.' using errcode = '22023';
  end if;

  if normalized_games is null or pg_catalog.jsonb_typeof(normalized_games) <> 'array' then
    raise exception 'normalized_games must be a JSON array.' using errcode = '22023';
  end if;

  if import_summary is null or pg_catalog.jsonb_typeof(import_summary) <> 'object' then
    raise exception 'import_summary must be a JSON object.' using errcode = '22023';
  end if;

  insert into public.platforms (slug, name, manufacturer)
  values (platform_slug, platform_name, platform_manufacturer)
  on conflict (slug) do nothing
  returning id into platform_id_value;

  if platform_id_value is null then
    select platform.id
    into platform_id_value
    from public.platforms as platform
    where platform.slug = platform_slug;

    if not exists (
      select 1
      from public.platforms as platform
      where platform.id = platform_id_value
        and platform.name = platform_name
        and platform.manufacturer is not distinct from platform_manufacturer
    ) then
      raise exception 'Platform % conflicts with reviewed import mapping.', platform_slug
        using errcode = '23514';
    end if;
  end if;

  for game_record in
    select value
    from pg_catalog.jsonb_array_elements(normalized_games)
  loop
    if pg_catalog.jsonb_typeof(game_record) <> 'object'
      or pg_catalog.btrim(game_record ->> 'externalId') = ''
      or pg_catalog.btrim(game_record ->> 'canonicalTitle') = ''
      or pg_catalog.btrim(game_record ->> 'sourceTitle') = ''
      or pg_catalog.jsonb_typeof(game_record -> 'editions') <> 'array'
    then
      raise exception 'Normalized Game record is invalid.' using errcode = '22023';
    end if;

    game_id_value := null;

    select mapping.game_id
    into game_id_value
    from public.game_provider_mappings as mapping
    where mapping.provider = provider_name
      and mapping.external_id = game_record ->> 'externalId'
    for update;

    if game_id_value is null then
      select pg_catalog.array_agg(distinct edition.game_id)
      into existing_game_ids
      from pg_catalog.jsonb_array_elements(game_record -> 'editions') as candidate(value)
      join public.edition_provider_mappings as mapping
        on mapping.provider = provider_name
        and mapping.external_id = candidate.value ->> 'externalId'
      join public.editions as edition on edition.id = mapping.edition_id;

      if coalesce(pg_catalog.array_length(existing_game_ids, 1), 0) > 1 then
        raise exception 'Provider records would merge multiple canonical Games.'
          using errcode = '23514';
      end if;

      if coalesce(pg_catalog.array_length(existing_game_ids, 1), 0) = 1 then
        game_id_value := existing_game_ids[1];

        update public.game_provider_mappings
        set
          external_id = game_record ->> 'externalId',
          source_title = game_record ->> 'sourceTitle'
        where game_id = game_id_value
          and provider = provider_name;

        if found then
          mappings_updated := mappings_updated + 1;
        else
          insert into public.game_provider_mappings (
            game_id,
            provider,
            external_id,
            source_title
          )
          values (
            game_id_value,
            provider_name,
            game_record ->> 'externalId',
            game_record ->> 'sourceTitle'
          );
        end if;
      else
        insert into public.games (canonical_title)
        values (game_record ->> 'canonicalTitle')
        returning id into game_id_value;

        insert into public.game_provider_mappings (
          game_id,
          provider,
          external_id,
          source_title
        )
        values (
          game_id_value,
          provider_name,
          game_record ->> 'externalId',
          game_record ->> 'sourceTitle'
        );

        games_created := games_created + 1;
      end if;
    else
      update public.game_provider_mappings
      set source_title = game_record ->> 'sourceTitle'
      where game_id = game_id_value
        and provider = provider_name
        and source_title is distinct from game_record ->> 'sourceTitle';

      if found then
        mappings_updated := mappings_updated + 1;
      else
        games_unchanged := games_unchanged + 1;
      end if;
    end if;

    for edition_record in
      select value
      from pg_catalog.jsonb_array_elements(game_record -> 'editions')
    loop
      if pg_catalog.jsonb_typeof(edition_record) <> 'object'
        or pg_catalog.btrim(edition_record ->> 'externalId') = ''
        or pg_catalog.btrim(edition_record ->> 'sourceTitle') = ''
        or pg_catalog.jsonb_typeof(edition_record -> 'identifiers') <> 'array'
      then
        raise exception 'Normalized Edition record is invalid.' using errcode = '22023';
      end if;

      edition_id_value := null;
      mapped_game_id := null;
      mapped_platform_id := null;

      select edition.id, edition.game_id, edition.platform_id
      into edition_id_value, mapped_game_id, mapped_platform_id
      from public.edition_provider_mappings as mapping
      join public.editions as edition on edition.id = mapping.edition_id
      where mapping.provider = provider_name
        and mapping.external_id = edition_record ->> 'externalId'
      for update of mapping, edition;

      if edition_id_value is null then
        insert into public.editions (
          game_id,
          platform_id,
          edition_name,
          region_code
        )
        values (
          game_id_value,
          platform_id_value,
          nullif(edition_record ->> 'editionName', ''),
          nullif(edition_record ->> 'regionCode', '')
        )
        returning id into edition_id_value;

        insert into public.edition_provider_mappings (
          edition_id,
          provider,
          external_id,
          source_title
        )
        values (
          edition_id_value,
          provider_name,
          edition_record ->> 'externalId',
          edition_record ->> 'sourceTitle'
        );

        editions_created := editions_created + 1;
      else
        if mapped_game_id <> game_id_value or mapped_platform_id <> platform_id_value then
          raise exception 'Provider Edition mapping conflicts with canonical identity.'
            using errcode = '23514';
        end if;

        update public.edition_provider_mappings
        set source_title = edition_record ->> 'sourceTitle'
        where edition_id = edition_id_value
          and provider = provider_name
          and source_title is distinct from edition_record ->> 'sourceTitle';

        if found then
          mappings_updated := mappings_updated + 1;
        else
          editions_unchanged := editions_unchanged + 1;
        end if;
      end if;

      for identifier_record in
        select value
        from pg_catalog.jsonb_array_elements(edition_record -> 'identifiers')
      loop
        if pg_catalog.jsonb_typeof(identifier_record) <> 'object'
          or pg_catalog.btrim(identifier_record ->> 'scheme') = ''
          or pg_catalog.btrim(identifier_record ->> 'value') = ''
        then
          raise exception 'Normalized identifier is invalid.' using errcode = '22023';
        end if;

        insert into public.edition_identifiers (
          edition_id,
          scheme,
          value,
          authority
        )
        values (
          edition_id_value,
          identifier_record ->> 'scheme',
          identifier_record ->> 'value',
          nullif(identifier_record ->> 'authority', '')
        )
        on conflict (edition_id, scheme, value) do nothing;

        get diagnostics row_count_value = row_count;
        identifiers_created := identifiers_created + row_count_value;
      end loop;
    end loop;
  end loop;

  database_summary := pg_catalog.jsonb_build_object(
    'gamesCreated', games_created,
    'gamesUnchanged', games_unchanged,
    'editionsCreated', editions_created,
    'editionsUnchanged', editions_unchanged,
    'identifiersCreated', identifiers_created,
    'mappingsUpdated', mappings_updated
  );
  final_summary := import_summary || pg_catalog.jsonb_build_object(
    'database', database_summary
  );

  insert into public.catalog_import_runs (
    provider,
    provider_revision,
    platform_id,
    started_at,
    completed_at,
    status,
    dry_run,
    summary
  )
  values (
    provider_name,
    provider_revision,
    platform_id_value,
    started_at_value,
    pg_catalog.clock_timestamp(),
    'succeeded',
    false,
    final_summary
  )
  returning id into run_id_value;

  return pg_catalog.jsonb_build_object(
    'runId', run_id_value,
    'database', database_summary,
    'summary', final_summary
  );
end;
$$;

revoke all on function public.import_catalog_batch(
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
)
from public, anon, authenticated;

grant execute on function public.import_catalog_batch(
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
)
to service_role;
