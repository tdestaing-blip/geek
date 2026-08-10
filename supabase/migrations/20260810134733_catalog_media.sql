create table public.catalog_media (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.games (id) on delete cascade,
  edition_id uuid references public.editions (id) on delete cascade,
  kind text not null,
  asset_url text not null,
  source_provider text not null,
  source_asset_id text,
  source_page_url text,
  rights_status text not null,
  license_name text,
  license_url text,
  attribution text,
  width integer,
  height integer,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_media_exactly_one_target check (
    (game_id is not null) <> (edition_id is not null)
  ),
  constraint catalog_media_kind_valid check (
    kind in ('cover_front', 'cover_back', 'artwork', 'logo')
  ),
  constraint catalog_media_asset_url_nonblank check (btrim(asset_url) <> ''),
  constraint catalog_media_source_provider_lowercase check (
    source_provider = lower(source_provider)
  ),
  constraint catalog_media_source_provider_nonblank check (
    btrim(source_provider) <> ''
  ),
  constraint catalog_media_source_asset_id_nonblank check (
    source_asset_id is null or btrim(source_asset_id) <> ''
  ),
  constraint catalog_media_source_page_url_nonblank check (
    source_page_url is null or btrim(source_page_url) <> ''
  ),
  constraint catalog_media_rights_status_valid check (
    rights_status in ('reusable', 'licensed', 'restricted', 'unknown')
  ),
  constraint catalog_media_primary_publishable check (
    not is_primary or rights_status in ('reusable', 'licensed')
  ),
  constraint catalog_media_license_name_nonblank check (
    license_name is null or btrim(license_name) <> ''
  ),
  constraint catalog_media_license_url_nonblank check (
    license_url is null or btrim(license_url) <> ''
  ),
  constraint catalog_media_attribution_nonblank check (
    attribution is null or btrim(attribution) <> ''
  ),
  constraint catalog_media_width_positive check (width is null or width > 0),
  constraint catalog_media_height_positive check (height is null or height > 0)
);

create unique index catalog_media_game_primary_unique
on public.catalog_media (game_id, kind)
where game_id is not null and is_primary;

create unique index catalog_media_edition_primary_unique
on public.catalog_media (edition_id, kind)
where edition_id is not null and is_primary;

create unique index catalog_media_game_source_asset_unique
on public.catalog_media (game_id, source_provider, source_asset_id)
where game_id is not null and source_asset_id is not null;

create unique index catalog_media_edition_source_asset_unique
on public.catalog_media (edition_id, source_provider, source_asset_id)
where edition_id is not null and source_asset_id is not null;

create trigger catalog_media_set_updated_at
before update on public.catalog_media
for each row execute function public.set_updated_at();

alter table public.catalog_media enable row level security;

revoke all privileges on table public.catalog_media from public, anon, authenticated;

grant select on table public.catalog_media to anon, authenticated;
grant all privileges on table public.catalog_media to service_role;

create policy catalog_media_public_read_publishable
on public.catalog_media
for select
to anon, authenticated
using (rights_status in ('reusable', 'licensed'));
