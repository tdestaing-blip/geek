create table public.listings (
  id uuid primary key default gen_random_uuid(),
  copy_id uuid not null,
  seller_id uuid not null,
  asking_amount_minor bigint not null,
  asking_currency text not null,
  local_pickup boolean not null default true,
  shipping_available boolean not null default false,
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_seller_id_foreign_key foreign key (seller_id)
    references public.profiles (id) on delete restrict,
  constraint listings_copy_id_foreign_key foreign key (copy_id)
    references public.copies (id) on delete restrict,
  constraint listings_asking_amount_nonnegative check (
    asking_amount_minor >= 0
  ),
  constraint listings_asking_currency_format check (
    asking_currency ~ '^[ABCDEFGHIJKLMNOPQRSTUVWXYZ]{3}$'
  ),
  constraint listings_status_allowed check (
    status in (
      'draft',
      'active',
      'reserved',
      'sold',
      'paused',
      'expired',
      'withdrawn'
    )
  ),
  constraint listings_active_fulfillment_required check (
    status <> 'active' or local_pickup or shipping_available
  )
);

create index listings_seller_id_index on public.listings (seller_id);
create index listings_copy_id_index on public.listings (copy_id);
create index listings_status_index on public.listings (status);
create index listings_asking_amount_minor_index
on public.listings (asking_amount_minor);
create index listings_asking_currency_index
on public.listings (asking_currency);
create index listings_published_at_index on public.listings (published_at);
create index listings_status_published_at_index
on public.listings (status, published_at);
create index listings_shipping_available_index
on public.listings (shipping_available);
create index listings_local_pickup_index on public.listings (local_pickup);

create unique index listings_copy_open_direct_sale_unique
on public.listings (copy_id)
where status in ('active', 'reserved');

create function public.validate_listing_copy_ownership()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  referenced_owner_id uuid;
  ownership_validation_required boolean := false;
begin
  if tg_op = 'INSERT' then
    ownership_validation_required := true;
  elsif new.copy_id is distinct from old.copy_id
    or new.seller_id is distinct from old.seller_id
    or new.status in ('draft', 'active', 'paused', 'withdrawn') then
    ownership_validation_required := true;
  end if;

  if not ownership_validation_required then
    return new;
  end if;

  select referenced_copy.owner_id
  into referenced_owner_id
  from public.copies as referenced_copy
  where referenced_copy.id = new.copy_id
  for update;

  if referenced_owner_id is distinct from new.seller_id then
    raise exception 'Listing seller must own the referenced Copy.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_listing_copy_ownership()
from public, anon, authenticated;

create trigger listings_validate_copy_ownership
before insert or update on public.listings
for each row execute function public.validate_listing_copy_ownership();

create function public.prevent_open_listing_copy_ownership_transfer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id
    and exists (
      select 1
      from public.listings as open_listing
      where open_listing.copy_id = old.id
        and open_listing.status in ('active', 'reserved')
    ) then
    raise exception 'Copy ownership cannot transfer while a Listing is active or reserved.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_open_listing_copy_ownership_transfer()
from public, anon, authenticated;

create trigger copies_prevent_open_listing_ownership_transfer
before update of owner_id on public.copies
for each row
execute function public.prevent_open_listing_copy_ownership_transfer();

create trigger listings_set_updated_at
before update on public.listings
for each row execute function public.set_updated_at();

alter table public.listings enable row level security;

revoke all privileges on table public.listings from anon, authenticated;

grant select on table public.listings to anon, authenticated;
grant insert (
  copy_id,
  seller_id,
  asking_amount_minor,
  asking_currency,
  local_pickup,
  shipping_available,
  status,
  published_at
)
on table public.listings to authenticated;
grant update (
  asking_amount_minor,
  asking_currency,
  local_pickup,
  shipping_available,
  status,
  published_at
)
on table public.listings to authenticated;

grant all privileges on table public.listings to service_role;

create policy listings_anonymous_read_active
on public.listings
for select
to anon
using (status = 'active');

create policy listings_authenticated_read_visible
on public.listings
for select
to authenticated
using (status = 'active' or seller_id = (select auth.uid()));

create policy listings_insert_own_copy
on public.listings
for insert
to authenticated
with check (
  seller_id = (select auth.uid())
  and status in ('draft', 'active', 'paused', 'withdrawn')
  and exists (
    select 1
    from public.copies
    where copies.id = listings.copy_id
      and copies.owner_id = (select auth.uid())
  )
);

create policy listings_update_own
on public.listings
for update
to authenticated
using (
  seller_id = (select auth.uid())
  and status in ('draft', 'active', 'paused', 'withdrawn')
  and exists (
    select 1
    from public.copies
    where copies.id = listings.copy_id
      and copies.owner_id = (select auth.uid())
  )
)
with check (
  seller_id = (select auth.uid())
  and status in ('draft', 'active', 'paused', 'withdrawn')
  and exists (
    select 1
    from public.copies
    where copies.id = listings.copy_id
      and copies.owner_id = (select auth.uid())
  )
);
