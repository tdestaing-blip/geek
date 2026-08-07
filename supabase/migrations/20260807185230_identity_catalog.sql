create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  display_name text,
  avatar_path text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_lowercase check (
    username is null or username = lower(username)
  ),
  constraint profiles_username_length check (
    username is null or char_length(username) between 3 and 30
  ),
  constraint profiles_username_characters check (
    username is null or username ~ '^[a-z0-9_]+$'
  ),
  constraint profiles_display_name_length check (
    display_name is null or char_length(display_name) <= 80
  ),
  constraint profiles_bio_length check (
    bio is null or char_length(bio) <= 240
  )
);

create unique index profiles_username_unique
on public.profiles (lower(username))
where username is not null;

create table public.platforms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  manufacturer text,
  released_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platforms_slug_format check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  )
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  canonical_title text not null,
  description text,
  original_release_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.editions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete restrict,
  platform_id uuid not null references public.platforms (id) on delete restrict,
  edition_name text,
  region_code text,
  supported_languages text[] not null default '{}'::text[],
  release_date date,
  publisher_name text,
  packaging_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index editions_game_id_index on public.editions (game_id);
create index editions_platform_id_index on public.editions (platform_id);

create table public.edition_identifiers (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions (id) on delete cascade,
  scheme text not null,
  value text not null,
  authority text,
  created_at timestamptz not null default now(),
  constraint edition_identifiers_scheme_lowercase check (
    scheme = lower(scheme)
  ),
  constraint edition_identifiers_scheme_nonblank check (
    btrim(scheme) <> ''
  ),
  constraint edition_identifiers_value_nonblank check (
    btrim(value) <> ''
  ),
  constraint edition_identifiers_edition_scheme_value_unique unique (
    edition_id,
    scheme,
    value
  )
);

create index edition_identifiers_scheme_value_index
on public.edition_identifiers (scheme, value);

create table public.game_provider_mappings (
  game_id uuid not null references public.games (id) on delete cascade,
  provider text not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  constraint game_provider_mappings_provider_lowercase check (
    provider = lower(provider)
  ),
  constraint game_provider_mappings_provider_nonblank check (
    btrim(provider) <> ''
  ),
  constraint game_provider_mappings_external_id_nonblank check (
    btrim(external_id) <> ''
  ),
  constraint game_provider_mappings_primary_key primary key (game_id, provider),
  constraint game_provider_mappings_provider_external_id_unique unique (
    provider,
    external_id
  )
);

create table public.edition_provider_mappings (
  edition_id uuid not null references public.editions (id) on delete cascade,
  provider text not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  constraint edition_provider_mappings_provider_lowercase check (
    provider = lower(provider)
  ),
  constraint edition_provider_mappings_provider_nonblank check (
    btrim(provider) <> ''
  ),
  constraint edition_provider_mappings_external_id_nonblank check (
    btrim(external_id) <> ''
  ),
  constraint edition_provider_mappings_primary_key primary key (
    edition_id,
    provider
  ),
  constraint edition_provider_mappings_provider_external_id_unique unique (
    provider,
    external_id
  )
);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger platforms_set_updated_at
before update on public.platforms
for each row execute function public.set_updated_at();

create trigger games_set_updated_at
before update on public.games
for each row execute function public.set_updated_at();

create trigger editions_set_updated_at
before update on public.editions
for each row execute function public.set_updated_at();

create function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_profile_for_auth_user() from public;

create trigger create_profile_after_auth_user_insert
after insert on auth.users
for each row execute function public.create_profile_for_auth_user();

alter table public.profiles enable row level security;
alter table public.platforms enable row level security;
alter table public.games enable row level security;
alter table public.editions enable row level security;
alter table public.edition_identifiers enable row level security;
alter table public.game_provider_mappings enable row level security;
alter table public.edition_provider_mappings enable row level security;

revoke all privileges on table public.profiles from anon, authenticated;
revoke all privileges on table public.platforms from anon, authenticated;
revoke all privileges on table public.games from anon, authenticated;
revoke all privileges on table public.editions from anon, authenticated;
revoke all privileges on table public.edition_identifiers from anon, authenticated;
revoke all privileges on table public.game_provider_mappings from anon, authenticated;
revoke all privileges on table public.edition_provider_mappings from anon, authenticated;

grant select on table public.profiles to anon, authenticated;
grant insert (id, username, display_name, avatar_path, bio)
on table public.profiles to authenticated;
grant update (username, display_name, avatar_path, bio)
on table public.profiles to authenticated;

grant select on table public.platforms to anon, authenticated;
grant select on table public.games to anon, authenticated;
grant select on table public.editions to anon, authenticated;
grant select on table public.edition_identifiers to anon, authenticated;
grant select on table public.game_provider_mappings to anon, authenticated;
grant select on table public.edition_provider_mappings to anon, authenticated;

grant all privileges on table public.profiles to service_role;
grant all privileges on table public.platforms to service_role;
grant all privileges on table public.games to service_role;
grant all privileges on table public.editions to service_role;
grant all privileges on table public.edition_identifiers to service_role;
grant all privileges on table public.game_provider_mappings to service_role;
grant all privileges on table public.edition_provider_mappings to service_role;

create policy profiles_public_read
on public.profiles
for select
to anon, authenticated
using (true);

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (id = (select auth.uid()));

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy platforms_public_read
on public.platforms
for select
to anon, authenticated
using (true);

create policy games_public_read
on public.games
for select
to anon, authenticated
using (true);

create policy editions_public_read
on public.editions
for select
to anon, authenticated
using (true);

create policy edition_identifiers_public_read
on public.edition_identifiers
for select
to anon, authenticated
using (true);

create policy game_provider_mappings_public_read
on public.game_provider_mappings
for select
to anon, authenticated
using (true);

create policy edition_provider_mappings_public_read
on public.edition_provider_mappings
for select
to anon, authenticated
using (true);
