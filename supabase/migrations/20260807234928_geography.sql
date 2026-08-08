create extension if not exists postgis with schema extensions;

create table public.user_discovery_locations (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  location extensions.geography(Point, 4326) not null,
  source text not null,
  accuracy_meters integer,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_discovery_locations_source_allowed check (
    source in (
      'device',
      'geocoded_postal_area',
      'map_selection',
      'city_selection'
    )
  ),
  constraint user_discovery_locations_accuracy_range check (
    accuracy_meters is null or accuracy_meters between 0 and 100000
  )
);

create index user_discovery_locations_location_gist_index
on public.user_discovery_locations using gist (location);

create trigger user_discovery_locations_set_updated_at
before update on public.user_discovery_locations
for each row execute function public.set_updated_at();

alter table public.user_discovery_locations enable row level security;

revoke all privileges on table public.user_discovery_locations
from anon, authenticated;

grant insert (user_id, location, source, accuracy_meters, confirmed_at)
on table public.user_discovery_locations to authenticated;
grant update (location, source, accuracy_meters, confirmed_at)
on table public.user_discovery_locations to authenticated;
grant delete on table public.user_discovery_locations to authenticated;

grant all privileges on table public.user_discovery_locations to service_role;

create policy user_discovery_locations_insert_own
on public.user_discovery_locations
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy user_discovery_locations_update_own
on public.user_discovery_locations
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy user_discovery_locations_delete_own
on public.user_discovery_locations
for delete
to authenticated
using (user_id = (select auth.uid()));

create function public.get_my_discovery_location()
returns table (
  longitude double precision,
  latitude double precision,
  source text,
  accuracy_meters integer,
  confirmed_at timestamptz,
  updated_at timestamptz
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

  return query
  select
    extensions.st_x(
      discovery_location.location::extensions.geometry
    ) as longitude,
    extensions.st_y(
      discovery_location.location::extensions.geometry
    ) as latitude,
    discovery_location.source,
    discovery_location.accuracy_meters,
    discovery_location.confirmed_at,
    discovery_location.updated_at
  from public.user_discovery_locations as discovery_location
  where discovery_location.user_id = caller_user_id;
end;
$$;

revoke all on function public.get_my_discovery_location()
from public, anon, authenticated;
grant execute on function public.get_my_discovery_location() to authenticated;

create function public.distance_from_me_to_user(target_user_id uuid)
returns double precision
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  computed_distance double precision;
begin
  if caller_user_id is null or target_user_id is null then
    return null;
  end if;

  select extensions.st_distance(
    caller_location.location,
    target_location.location
  )
  into computed_distance
  from public.user_discovery_locations as caller_location
  join public.user_discovery_locations as target_location
    on target_location.user_id = target_user_id
  where caller_location.user_id = caller_user_id;

  return computed_distance;
end;
$$;

revoke all on function public.distance_from_me_to_user(uuid)
from public, anon, authenticated;
grant execute on function public.distance_from_me_to_user(uuid)
to service_role;
