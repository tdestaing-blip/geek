alter table public.catalog_source_records
add column evidence_children jsonb not null default '[]'::jsonb,
add constraint catalog_source_records_evidence_children_array check (
  jsonb_typeof(evidence_children) = 'array'
);

create function public.upsert_mobygames_catalog_source_record(
  record_type_name text,
  source_key_value text,
  provider_external_id_value text,
  payload_value jsonb,
  checksum_value text,
  fetched_at_value timestamptz,
  evidence_children_value jsonb
)
returns public.catalog_source_records
language plpgsql
security invoker
set search_path = ''
as $$
declare
  evidence_child jsonb;
  result public.catalog_source_records;
begin
  if record_type_name not in ('game', 'platform', 'game_platform', 'covers')
    or evidence_children_value is null
    or pg_catalog.jsonb_typeof(evidence_children_value) <> 'array'
  then
    raise exception 'MobyGames source evidence metadata is invalid.' using errcode = '22023';
  end if;

  for evidence_child in
    select value
    from pg_catalog.jsonb_array_elements(evidence_children_value)
  loop
    if pg_catalog.jsonb_typeof(evidence_child) <> 'object'
      or evidence_child ->> 'kind' not in ('release', 'cover_group')
      or (evidence_child ->> 'fingerprint') !~ '^[0-9a-f]{64}$'
      or (evidence_child ->> 'kind' = 'release' and record_type_name <> 'game_platform')
      or (evidence_child ->> 'kind' = 'cover_group' and record_type_name <> 'covers')
    then
      raise exception 'MobyGames source evidence child is invalid.' using errcode = '22023';
    end if;
  end loop;

  insert into public.catalog_source_records (
    provider,
    record_type,
    source_key,
    provider_external_id,
    payload,
    checksum,
    fetched_at,
    evidence_children
  )
  values (
    'mobygames',
    record_type_name,
    source_key_value,
    nullif(provider_external_id_value, ''),
    payload_value,
    checksum_value,
    fetched_at_value,
    evidence_children_value
  )
  on conflict (provider, record_type, source_key)
  do update set
    provider_external_id = excluded.provider_external_id,
    payload = case
      when public.catalog_source_records.checksum = excluded.checksum
        then public.catalog_source_records.payload
      else excluded.payload
    end,
    checksum = excluded.checksum,
    revision = case
      when public.catalog_source_records.checksum = excluded.checksum
        then public.catalog_source_records.revision
      else public.catalog_source_records.revision + 1
    end,
    fetched_at = excluded.fetched_at,
    evidence_children = excluded.evidence_children
  returning * into result;

  return result;
end;
$$;

revoke all on function public.upsert_mobygames_catalog_source_record(
  text,
  text,
  text,
  jsonb,
  text,
  timestamptz,
  jsonb
) from public, anon, authenticated;

grant execute on function public.upsert_mobygames_catalog_source_record(
  text,
  text,
  text,
  jsonb,
  text,
  timestamptz,
  jsonb
) to service_role;

create or replace function public.upsert_catalog_source_record(
  provider_name text,
  record_type_name text,
  source_key_value text,
  provider_external_id_value text,
  payload_value jsonb,
  checksum_value text,
  fetched_at_value timestamptz
)
returns public.catalog_source_records
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.catalog_source_records;
begin
  if provider_name = 'mobygames' then
    raise exception 'MobyGames source records require trusted evidence metadata.'
      using errcode = '22023';
  end if;

  insert into public.catalog_source_records (
    provider,
    record_type,
    source_key,
    provider_external_id,
    payload,
    checksum,
    fetched_at
  )
  values (
    provider_name,
    record_type_name,
    source_key_value,
    nullif(provider_external_id_value, ''),
    payload_value,
    checksum_value,
    fetched_at_value
  )
  on conflict (provider, record_type, source_key)
  do update set
    provider_external_id = excluded.provider_external_id,
    payload = case
      when public.catalog_source_records.checksum = excluded.checksum
        then public.catalog_source_records.payload
      else excluded.payload
    end,
    checksum = excluded.checksum,
    revision = case
      when public.catalog_source_records.checksum = excluded.checksum
        then public.catalog_source_records.revision
      else public.catalog_source_records.revision + 1
    end,
    fetched_at = excluded.fetched_at
  returning * into result;

  return result;
end;
$$;

create function public.persist_mobygames_edition_candidate(
  game_id_value uuid,
  platform_id_value uuid,
  candidate_value jsonb,
  source_records_value jsonb,
  existing_edition_id_value uuid default null,
  failure_stage_value text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  edition_id_value uuid;
  edition_created boolean := false;
  identifier_record jsonb;
  evidence_record jsonb;
  media_record jsonb;
  source_record jsonb;
  source_record_id_value uuid;
  evidence_kind_value text;
  game_external_id_value text;
  platform_external_id_value text;
  expected_source_key_value text;
  trusted_evidence_children_value jsonb;
  row_count_value integer;
  identifiers_created integer := 0;
  evidence_links_created integer := 0;
  media_created integer := 0;
begin
  if candidate_value is null
    or pg_catalog.jsonb_typeof(candidate_value) <> 'object'
    or pg_catalog.jsonb_typeof(candidate_value -> 'identifiers') <> 'array'
    or pg_catalog.jsonb_typeof(candidate_value -> 'evidence') <> 'array'
    or pg_catalog.jsonb_typeof(candidate_value -> 'media') <> 'array'
  then
    raise exception 'MobyGames candidate payload is invalid.' using errcode = '22023';
  end if;

  if source_records_value is null
    or pg_catalog.jsonb_typeof(source_records_value) <> 'array'
  then
    raise exception 'MobyGames source records must be a JSON array.' using errcode = '22023';
  end if;

  if failure_stage_value is not null
    and failure_stage_value not in ('after_edition', 'after_identifiers', 'after_evidence')
  then
    raise exception 'Unknown MobyGames candidate failure stage.' using errcode = '22023';
  end if;

  select mapping.external_id
  into game_external_id_value
  from public.game_provider_mappings as mapping
  where mapping.game_id = game_id_value
    and mapping.provider = 'mobygames'
  for share;

  select mapping.external_id
  into platform_external_id_value
  from public.platform_provider_mappings as mapping
  where mapping.platform_id = platform_id_value
    and mapping.provider = 'mobygames'
  for share;

  if game_external_id_value is null or platform_external_id_value is null then
    raise exception 'Candidate Game and Platform require canonical MobyGames mappings.'
      using errcode = '23503';
  end if;

  expected_source_key_value := game_external_id_value || ':' || platform_external_id_value;

  for source_record in
    select value
    from pg_catalog.jsonb_array_elements(source_records_value)
  loop
    if pg_catalog.jsonb_typeof(source_record) <> 'object'
      or source_record ->> 'recordType' not in ('game_platform', 'covers')
    then
      raise exception 'MobyGames candidate source record is invalid.' using errcode = '22023';
    end if;

    source_record_id_value := (source_record ->> 'id')::uuid;
    select catalog_source.evidence_children
    into trusted_evidence_children_value
    from public.catalog_source_records as catalog_source
    where catalog_source.id = source_record_id_value
      and catalog_source.provider = 'mobygames'
      and catalog_source.record_type = source_record ->> 'recordType'
      and catalog_source.source_key = expected_source_key_value
    for share;

    if not found then
      raise exception 'MobyGames candidate source record is outside the target Game and Platform scope.'
        using errcode = '23503';
    end if;
  end loop;

  for evidence_record in
    select value
    from pg_catalog.jsonb_array_elements(candidate_value -> 'evidence')
  loop
    if pg_catalog.jsonb_typeof(evidence_record) <> 'object'
      or evidence_record ->> 'kind' not in ('release', 'cover_group')
      or (evidence_record ->> 'fingerprint') !~ '^[0-9a-f]{64}$'
    then
      raise exception 'MobyGames Edition evidence is invalid.' using errcode = '22023';
    end if;

    source_record_id_value := (evidence_record ->> 'sourceRecordId')::uuid;
    select catalog_source.evidence_children
    into trusted_evidence_children_value
    from public.catalog_source_records as catalog_source
    where catalog_source.id = source_record_id_value
      and catalog_source.provider = 'mobygames'
      and catalog_source.source_key = expected_source_key_value
      and (
        (evidence_record ->> 'kind' = 'release'
          and catalog_source.record_type = 'game_platform')
        or
        (evidence_record ->> 'kind' = 'cover_group'
          and catalog_source.record_type = 'covers')
      )
      and exists (
        select 1
        from pg_catalog.jsonb_array_elements(catalog_source.evidence_children) as trusted_child(value)
        where trusted_child.value ->> 'kind' = evidence_record ->> 'kind'
          and trusted_child.value ->> 'fingerprint' = evidence_record ->> 'fingerprint'
      )
    for share;

    if not found or not exists (
      select 1
      from pg_catalog.jsonb_array_elements(source_records_value) as current_source(value)
      where current_source.value ->> 'id' = source_record_id_value::text
    ) then
      raise exception 'MobyGames Edition evidence does not belong to its trusted source record.'
        using errcode = '23503';
    end if;
  end loop;

  if existing_edition_id_value is null then
    insert into public.editions (
      game_id,
      platform_id,
      edition_name,
      region_code,
      release_date,
      publisher_name
    )
    values (
      game_id_value,
      platform_id_value,
      nullif(candidate_value ->> 'editionName', ''),
      nullif(candidate_value ->> 'regionCode', ''),
      nullif(candidate_value ->> 'releaseDate', '')::date,
      nullif(candidate_value ->> 'publisherName', '')
    )
    returning id into edition_id_value;

    edition_created := true;
  else
    select edition.id
    into edition_id_value
    from public.editions as edition
    where edition.id = existing_edition_id_value
      and edition.game_id = game_id_value
      and edition.platform_id = platform_id_value
    for update;

    if edition_id_value is null then
      raise exception 'Existing Edition conflicts with candidate Game or Platform identity.'
        using errcode = '23514';
    end if;
  end if;

  if failure_stage_value = 'after_edition' then
    raise exception 'Injected failure after Edition persistence.' using errcode = 'P0001';
  end if;

  for identifier_record in
    select value
    from pg_catalog.jsonb_array_elements(candidate_value -> 'identifiers')
  loop
    if pg_catalog.jsonb_typeof(identifier_record) <> 'object'
      or pg_catalog.btrim(identifier_record ->> 'scheme') = ''
      or pg_catalog.btrim(identifier_record ->> 'value') = ''
    then
      raise exception 'MobyGames Edition identifier is invalid.' using errcode = '22023';
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

  if failure_stage_value = 'after_identifiers' then
    raise exception 'Injected failure after Edition identifiers.' using errcode = 'P0001';
  end if;

  for source_record in
    select value
    from pg_catalog.jsonb_array_elements(source_records_value)
  loop
    source_record_id_value := (source_record ->> 'id')::uuid;
    evidence_kind_value := case source_record ->> 'recordType'
      when 'game_platform' then 'release'
      when 'covers' then 'cover_group'
    end;

    delete from public.edition_source_evidence as existing_evidence
    where existing_evidence.edition_id = edition_id_value
      and existing_evidence.source_record_id = source_record_id_value
      and existing_evidence.evidence_kind = evidence_kind_value
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(candidate_value -> 'evidence') as candidate_evidence(value)
        where candidate_evidence.value ->> 'sourceRecordId' = source_record_id_value::text
          and candidate_evidence.value ->> 'kind' = evidence_kind_value
          and candidate_evidence.value ->> 'fingerprint'
            = existing_evidence.evidence_fingerprint
      );
  end loop;

  for evidence_record in
    select value
    from pg_catalog.jsonb_array_elements(candidate_value -> 'evidence')
  loop
    source_record_id_value := (evidence_record ->> 'sourceRecordId')::uuid;
    insert into public.edition_source_evidence (
      edition_id,
      source_record_id,
      evidence_kind,
      evidence_fingerprint
    )
    values (
      edition_id_value,
      source_record_id_value,
      evidence_record ->> 'kind',
      evidence_record ->> 'fingerprint'
    )
    on conflict (
      edition_id,
      source_record_id,
      evidence_kind,
      evidence_fingerprint
    ) do nothing;

    get diagnostics row_count_value = row_count;
    evidence_links_created := evidence_links_created + row_count_value;
  end loop;

  if failure_stage_value = 'after_evidence' then
    raise exception 'Injected failure after Edition evidence.' using errcode = 'P0001';
  end if;

  for media_record in
    select value
    from pg_catalog.jsonb_array_elements(candidate_value -> 'media')
  loop
    if pg_catalog.jsonb_typeof(media_record) <> 'object'
      or media_record ->> 'kind' not in ('cover_front', 'cover_back')
      or pg_catalog.btrim(media_record ->> 'assetUrl') = ''
      or pg_catalog.btrim(media_record ->> 'sourceAssetId') = ''
      or media_record ->> 'attribution' <> 'Data by MobyGames.com'
    then
      raise exception 'MobyGames CatalogMedia evidence is invalid.' using errcode = '22023';
    end if;

    insert into public.catalog_media (
      game_id,
      edition_id,
      kind,
      asset_url,
      source_provider,
      source_asset_id,
      source_page_url,
      rights_status,
      attribution,
      width,
      height,
      is_primary
    )
    values (
      null,
      edition_id_value,
      media_record ->> 'kind',
      media_record ->> 'assetUrl',
      'mobygames',
      media_record ->> 'sourceAssetId',
      nullif(media_record ->> 'sourcePageUrl', ''),
      'restricted',
      media_record ->> 'attribution',
      nullif(media_record ->> 'width', '')::integer,
      nullif(media_record ->> 'height', '')::integer,
      false
    )
    on conflict do nothing;

    get diagnostics row_count_value = row_count;
    media_created := media_created + row_count_value;
  end loop;

  return pg_catalog.jsonb_build_object(
    'editionId', edition_id_value,
    'created', edition_created,
    'identifiersCreated', identifiers_created,
    'evidenceLinksCreated', evidence_links_created,
    'mediaCreated', media_created
  );
end;
$$;

revoke all on function public.persist_mobygames_edition_candidate(
  uuid,
  uuid,
  jsonb,
  jsonb,
  uuid,
  text
) from public, anon, authenticated;

grant execute on function public.persist_mobygames_edition_candidate(
  uuid,
  uuid,
  jsonb,
  jsonb,
  uuid,
  text
) to service_role;
