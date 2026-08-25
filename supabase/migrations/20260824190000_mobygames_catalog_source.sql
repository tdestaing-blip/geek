create table public.platform_provider_mappings (
  platform_id uuid not null references public.platforms (id) on delete cascade,
  provider text not null,
  external_id text not null,
  source_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_provider_mappings_provider_lowercase check (
    provider = lower(provider)
  ),
  constraint platform_provider_mappings_provider_nonblank check (btrim(provider) <> ''),
  constraint platform_provider_mappings_external_id_nonblank check (btrim(external_id) <> ''),
  constraint platform_provider_mappings_source_name_nonblank check (
    source_name is null or btrim(source_name) <> ''
  ),
  constraint platform_provider_mappings_primary_key primary key (platform_id, provider),
  constraint platform_provider_mappings_provider_external_id_unique unique (
    provider,
    external_id
  )
);

create trigger platform_provider_mappings_set_updated_at
before update on public.platform_provider_mappings
for each row execute function public.set_updated_at();

create table public.catalog_source_records (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  record_type text not null,
  source_key text not null,
  provider_external_id text,
  payload jsonb not null,
  checksum text not null,
  revision integer not null default 1,
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_source_records_provider_lowercase check (provider = lower(provider)),
  constraint catalog_source_records_provider_nonblank check (btrim(provider) <> ''),
  constraint catalog_source_records_record_type_format check (
    record_type ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
  ),
  constraint catalog_source_records_source_key_nonblank check (btrim(source_key) <> ''),
  constraint catalog_source_records_provider_external_id_nonblank check (
    provider_external_id is null or btrim(provider_external_id) <> ''
  ),
  constraint catalog_source_records_payload_container check (
    jsonb_typeof(payload) in ('object', 'array')
  ),
  constraint catalog_source_records_checksum_sha256 check (checksum ~ '^[0-9a-f]{64}$'),
  constraint catalog_source_records_revision_positive check (revision > 0),
  constraint catalog_source_records_resource_unique unique (provider, record_type, source_key)
);

create unique index catalog_source_records_provider_external_id_unique
on public.catalog_source_records (provider, record_type, provider_external_id)
where provider_external_id is not null;

create trigger catalog_source_records_set_updated_at
before update on public.catalog_source_records
for each row execute function public.set_updated_at();

create table public.edition_source_evidence (
  edition_id uuid not null references public.editions (id) on delete cascade,
  source_record_id uuid not null references public.catalog_source_records (id) on delete restrict,
  evidence_kind text not null,
  evidence_fingerprint text not null,
  created_at timestamptz not null default now(),
  constraint edition_source_evidence_kind_format check (
    evidence_kind ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
  ),
  constraint edition_source_evidence_fingerprint_sha256 check (
    evidence_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint edition_source_evidence_primary_key primary key (
    edition_id,
    source_record_id,
    evidence_kind,
    evidence_fingerprint
  ),
  constraint edition_source_evidence_source_child_unique unique (
    source_record_id,
    evidence_kind,
    evidence_fingerprint
  )
);

create index edition_source_evidence_source_index
on public.edition_source_evidence (source_record_id, evidence_kind, evidence_fingerprint);

alter table public.platform_provider_mappings enable row level security;
alter table public.catalog_source_records enable row level security;
alter table public.edition_source_evidence enable row level security;

revoke all privileges on table public.platform_provider_mappings from public, anon, authenticated;
revoke all privileges on table public.catalog_source_records from public, anon, authenticated;
revoke all privileges on table public.edition_source_evidence from public, anon, authenticated;

grant select on table public.platform_provider_mappings to anon, authenticated;
grant all privileges on table public.platform_provider_mappings to service_role;
grant all privileges on table public.catalog_source_records to service_role;
grant all privileges on table public.edition_source_evidence to service_role;

create policy platform_provider_mappings_public_read
on public.platform_provider_mappings
for select
to anon, authenticated
using (true);

create function public.upsert_catalog_source_record(
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

revoke all on function public.upsert_catalog_source_record(
  text,
  text,
  text,
  text,
  jsonb,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.upsert_catalog_source_record(
  text,
  text,
  text,
  text,
  jsonb,
  text,
  timestamptz
) to service_role;
