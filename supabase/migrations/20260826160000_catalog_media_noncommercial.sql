alter table public.catalog_media
drop constraint catalog_media_rights_status_valid;

alter table public.catalog_media
add constraint catalog_media_rights_status_valid check (
  rights_status in ('reusable', 'licensed', 'noncommercial', 'restricted', 'unknown')
);

alter table public.catalog_media
drop constraint catalog_media_primary_publishable;

alter table public.catalog_media
add constraint catalog_media_primary_publishable check (
  not is_primary or rights_status in ('reusable', 'licensed', 'noncommercial')
);

create table public.catalog_media_usage_configuration (
  singleton boolean primary key default true check (singleton),
  usage_mode text not null default 'commercial' check (
    usage_mode in ('commercial', 'noncommercial')
  ),
  updated_at timestamptz not null default now()
);

insert into public.catalog_media_usage_configuration (singleton, usage_mode)
values (true, 'commercial');

create trigger catalog_media_usage_configuration_set_updated_at
before update on public.catalog_media_usage_configuration
for each row execute function public.set_updated_at();

alter table public.catalog_media_usage_configuration enable row level security;

revoke all privileges on table public.catalog_media_usage_configuration
from public, anon, authenticated;

grant all privileges on table public.catalog_media_usage_configuration to service_role;

create function public.catalog_media_is_displayable(rights_status_value text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    rights_status_value in ('reusable', 'licensed')
    or (
      rights_status_value = 'noncommercial'
      and exists (
        select 1
        from public.catalog_media_usage_configuration as configuration
        where configuration.singleton
          and configuration.usage_mode = 'noncommercial'
      )
    );
$$;

revoke all on function public.catalog_media_is_displayable(text) from public;
grant execute on function public.catalog_media_is_displayable(text) to anon, authenticated;

drop policy catalog_media_public_read_publishable on public.catalog_media;

create policy catalog_media_public_read_displayable
on public.catalog_media
for select
to anon, authenticated
using (public.catalog_media_is_displayable(rights_status));

update public.catalog_media
set rights_status = 'noncommercial'
where source_provider = 'mobygames';

update public.catalog_media
set is_primary = false
where source_provider = 'mobygames'
  and kind <> 'cover_front'
  and is_primary;

with ranked_fronts as (
  select
    media.id,
    media.edition_id,
    pg_catalog.row_number() over (
      partition by media.edition_id
      order by media.source_asset_id, media.id
    ) as rank
  from public.catalog_media as media
  where media.source_provider = 'mobygames'
    and media.kind = 'cover_front'
    and media.edition_id is not null
), selected_fronts as (
  select ranked.id
  from ranked_fronts as ranked
  where ranked.rank = 1
    and not exists (
      select 1
      from public.catalog_media as existing
      where existing.edition_id = ranked.edition_id
        and existing.kind = 'cover_front'
        and existing.is_primary
        and existing.id <> ranked.id
    )
)
update public.catalog_media as media
set is_primary = media.id in (select selected.id from selected_fronts as selected)
where media.source_provider = 'mobygames'
  and media.kind = 'cover_front'
  and media.edition_id is not null;

do $migration$
declare
  function_definition text;
  updated_definition text;
  validation_before text := $fragment$      or media_record ->> 'attribution' <> 'Data by MobyGames.com'$fragment$;
  validation_after text := $fragment$      or media_record ->> 'attribution' <> 'Data by MobyGames.com'
      or media_record ->> 'rightsStatus' <> 'noncommercial'
      or pg_catalog.jsonb_typeof(media_record -> 'isPrimary') <> 'boolean'
      or (
        (media_record ->> 'isPrimary')::boolean
        and media_record ->> 'kind' <> 'cover_front'
      )$fragment$;
  values_before text := $fragment$      'restricted',
      media_record ->> 'attribution',
      nullif(media_record ->> 'width', '')::integer,
      nullif(media_record ->> 'height', '')::integer,
      false$fragment$;
  values_after text := $fragment$      media_record ->> 'rightsStatus',
      media_record ->> 'attribution',
      nullif(media_record ->> 'width', '')::integer,
      nullif(media_record ->> 'height', '')::integer,
      (media_record ->> 'isPrimary')::boolean
        and not exists (
          select 1
          from public.catalog_media as existing_primary
          where existing_primary.edition_id = edition_id_value
            and existing_primary.kind = 'cover_front'
            and existing_primary.is_primary
        )$fragment$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.persist_mobygames_edition_candidate(uuid,uuid,jsonb,jsonb,uuid,text)'::regprocedure
  )
  into function_definition;

  updated_definition := pg_catalog.replace(
    function_definition,
    validation_before,
    validation_after
  );
  updated_definition := pg_catalog.replace(updated_definition, values_before, values_after);

  if updated_definition = function_definition
    or pg_catalog.strpos(updated_definition, validation_after) = 0
    or pg_catalog.strpos(updated_definition, values_after) = 0
  then
    raise exception 'Could not apply the reviewed MobyGames media-rights function delta.';
  end if;

  execute updated_definition;
end;
$migration$;

comment on table public.catalog_media_usage_configuration is
  'Server-side CatalogMedia usage mode. Production-safe default is commercial; authorized local environments may opt into noncommercial media.';

comment on function public.catalog_media_is_displayable(text) is
  'Enforces server-side CatalogMedia rights for the configured product usage mode.';
