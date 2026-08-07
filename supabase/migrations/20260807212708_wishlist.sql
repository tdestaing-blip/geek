create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid references public.games (id) on delete restrict,
  edition_id uuid references public.editions (id) on delete restrict,
  visibility text not null default 'private',
  status text not null default 'active',
  purchase_interest boolean not null default true,
  trade_interest boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wishlist_items_exactly_one_target check (
    (game_id is null) <> (edition_id is null)
  ),
  constraint wishlist_items_visibility_allowed check (
    visibility in ('private', 'public')
  ),
  constraint wishlist_items_status_allowed check (
    status in ('active', 'fulfilled', 'archived')
  )
);

create index wishlist_items_owner_id_index on public.wishlist_items (owner_id);
create index wishlist_items_game_id_index on public.wishlist_items (game_id);
create index wishlist_items_edition_id_index
on public.wishlist_items (edition_id);
create index wishlist_items_owner_id_status_index
on public.wishlist_items (owner_id, status);
create index wishlist_items_visibility_index
on public.wishlist_items (visibility);
create index wishlist_items_status_index on public.wishlist_items (status);

create unique index wishlist_items_active_game_target_unique
on public.wishlist_items (owner_id, game_id)
where status = 'active' and game_id is not null;

create unique index wishlist_items_active_edition_target_unique
on public.wishlist_items (owner_id, edition_id)
where status = 'active' and edition_id is not null;

create trigger wishlist_items_set_updated_at
before update on public.wishlist_items
for each row execute function public.set_updated_at();

create table public.wishlist_private_details (
  wishlist_item_id uuid primary key
    references public.wishlist_items (id) on delete cascade,
  max_purchase_amount_minor bigint,
  max_purchase_currency text,
  max_trade_distance_km integer,
  priority smallint not null default 2,
  private_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wishlist_private_details_amount_nonnegative check (
    max_purchase_amount_minor is null or max_purchase_amount_minor >= 0
  ),
  constraint wishlist_private_details_purchase_pair check (
    (max_purchase_amount_minor is null) = (max_purchase_currency is null)
  ),
  constraint wishlist_private_details_currency_format check (
    max_purchase_currency is null
    or max_purchase_currency ~ '^[ABCDEFGHIJKLMNOPQRSTUVWXYZ]{3}$'
  ),
  constraint wishlist_private_details_trade_distance_range check (
    max_trade_distance_km is null
    or max_trade_distance_km between 1 and 1000
  ),
  constraint wishlist_private_details_priority_range check (
    priority between 1 and 3
  ),
  constraint wishlist_private_details_notes_length check (
    private_notes is null or char_length(private_notes) <= 2000
  )
);

create trigger wishlist_private_details_set_updated_at
before update on public.wishlist_private_details
for each row execute function public.set_updated_at();

alter table public.wishlist_items enable row level security;
alter table public.wishlist_private_details enable row level security;

revoke all privileges on table public.wishlist_items from anon, authenticated;
revoke all privileges on table public.wishlist_private_details
from anon, authenticated;

grant select on table public.wishlist_items to anon, authenticated;
grant insert (
  owner_id,
  game_id,
  edition_id,
  visibility,
  status,
  purchase_interest,
  trade_interest
)
on table public.wishlist_items to authenticated;
grant update (
  visibility,
  status,
  purchase_interest,
  trade_interest
)
on table public.wishlist_items to authenticated;
grant delete on table public.wishlist_items to authenticated;

grant select on table public.wishlist_private_details to authenticated;
grant insert (
  wishlist_item_id,
  max_purchase_amount_minor,
  max_purchase_currency,
  max_trade_distance_km,
  priority,
  private_notes
)
on table public.wishlist_private_details to authenticated;
grant update (
  max_purchase_amount_minor,
  max_purchase_currency,
  max_trade_distance_km,
  priority,
  private_notes
)
on table public.wishlist_private_details to authenticated;
grant delete on table public.wishlist_private_details to authenticated;

grant all privileges on table public.wishlist_items to service_role;
grant all privileges on table public.wishlist_private_details to service_role;

create policy wishlist_items_anonymous_read_public
on public.wishlist_items
for select
to anon
using (visibility = 'public');

create policy wishlist_items_authenticated_read_visible
on public.wishlist_items
for select
to authenticated
using (visibility = 'public' or owner_id = (select auth.uid()));

create policy wishlist_items_insert_own
on public.wishlist_items
for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy wishlist_items_update_own
on public.wishlist_items
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy wishlist_items_delete_own
on public.wishlist_items
for delete
to authenticated
using (owner_id = (select auth.uid()));

create policy wishlist_private_details_read_own
on public.wishlist_private_details
for select
to authenticated
using (
  exists (
    select 1
    from public.wishlist_items
    where wishlist_items.id = wishlist_private_details.wishlist_item_id
      and wishlist_items.owner_id = (select auth.uid())
  )
);

create policy wishlist_private_details_insert_own
on public.wishlist_private_details
for insert
to authenticated
with check (
  exists (
    select 1
    from public.wishlist_items
    where wishlist_items.id = wishlist_private_details.wishlist_item_id
      and wishlist_items.owner_id = (select auth.uid())
  )
);

create policy wishlist_private_details_update_own
on public.wishlist_private_details
for update
to authenticated
using (
  exists (
    select 1
    from public.wishlist_items
    where wishlist_items.id = wishlist_private_details.wishlist_item_id
      and wishlist_items.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.wishlist_items
    where wishlist_items.id = wishlist_private_details.wishlist_item_id
      and wishlist_items.owner_id = (select auth.uid())
  )
);

create policy wishlist_private_details_delete_own
on public.wishlist_private_details
for delete
to authenticated
using (
  exists (
    select 1
    from public.wishlist_items
    where wishlist_items.id = wishlist_private_details.wishlist_item_id
      and wishlist_items.owner_id = (select auth.uid())
  )
);
