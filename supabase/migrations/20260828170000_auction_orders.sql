create table public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles (id) on delete restrict,
  seller_id uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'awaiting_payment',
  currency text not null,
  created_at timestamptz not null default now(),
  constraint orders_parties_distinct check (buyer_id <> seller_id),
  constraint orders_status_check check (status = 'awaiting_payment'),
  constraint orders_currency_check check (currency ~ '^[A-Z]{3}$')
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  auction_id uuid not null,
  copy_id uuid not null,
  winning_bid_id uuid not null,
  amount_minor bigint not null,
  currency text not null,
  created_at timestamptz not null default now(),
  constraint order_items_order_unique unique (order_id),
  constraint order_items_auction_unique unique (auction_id),
  constraint order_items_winning_bid_unique unique (winning_bid_id),
  constraint order_items_auction_copy_fkey
    foreign key (auction_id, copy_id)
    references public.auctions (id, copy_id)
    on delete restrict,
  constraint order_items_bid_auction_fkey
    foreign key (winning_bid_id, auction_id)
    references public.auction_bids (id, auction_id)
    on delete restrict,
  constraint order_items_amount_check check (amount_minor >= 0),
  constraint order_items_currency_check check (currency ~ '^[A-Z]{3}$')
);

comment on table public.orders is
  'Canonical commercial agreements. Auction Settlement V1 creates awaiting_payment Orders only; payment and fulfillment are intentionally not modeled yet.';
comment on table public.order_items is
  'Immutable Auction-derived Order membership. V1 enforces one item per Order and one item per won Auction.';

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

revoke all on table public.orders from public, anon, authenticated;
revoke all on table public.order_items from public, anon, authenticated;
grant all privileges on table public.orders to service_role;
grant all privileges on table public.order_items to service_role;

create function public.ensure_auction_order(target_auction_id uuid)
returns table (
  order_id uuid,
  order_item_id uuid,
  auction_id uuid,
  copy_id uuid,
  winning_bid_id uuid,
  buyer_id uuid,
  seller_id uuid,
  status text,
  amount_minor bigint,
  currency text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_auction public.auctions%rowtype;
  target_bid public.auction_bids%rowtype;
  current_owner_id uuid;
  existing_item public.order_items%rowtype;
  existing_order public.orders%rowtype;
  created_order public.orders%rowtype;
  created_item public.order_items%rowtype;
begin
  if target_auction_id is null then
    raise exception 'target_auction_id is required.' using errcode = '22023';
  end if;

  -- This is the serialization boundary. Concurrent ensure calls cannot create
  -- competing parent Orders before the unique Auction item is established.
  select auction.*
  into target_auction
  from public.auctions as auction
  where auction.id = target_auction_id
  for update;

  if not found then
    raise exception 'Auction does not exist.' using errcode = 'P0002';
  end if;

  if target_auction.status <> 'won' or target_auction.winning_bid_id is null then
    raise exception 'Auction is not canonically won.' using errcode = '23514';
  end if;

  select bid.*
  into target_bid
  from public.auction_bids as bid
  where bid.id = target_auction.winning_bid_id
    and bid.auction_id = target_auction.id;

  if not found
    or target_bid.amount_minor is distinct from target_auction.current_amount_minor
  then
    raise exception 'Auction winning Bid is inconsistent.' using errcode = '23514';
  end if;

  select copy.owner_id
  into current_owner_id
  from public.copies as copy
  where copy.id = target_auction.copy_id;

  if not found or current_owner_id is distinct from target_auction.seller_id then
    raise exception 'Auction seller and current Copy owner are inconsistent.'
      using errcode = '23514';
  end if;

  if target_bid.bidder_id = target_auction.seller_id then
    raise exception 'Auction buyer and seller must differ.' using errcode = '23514';
  end if;

  select item.*
  into existing_item
  from public.order_items as item
  where item.auction_id = target_auction.id;

  if found then
    select canonical_order.*
    into strict existing_order
    from public.orders as canonical_order
    where canonical_order.id = existing_item.order_id;

    if existing_order.buyer_id is distinct from target_bid.bidder_id
      or existing_order.seller_id is distinct from target_auction.seller_id
      or existing_order.status <> 'awaiting_payment'
      or existing_order.currency is distinct from target_auction.currency
      or existing_item.copy_id is distinct from target_auction.copy_id
      or existing_item.winning_bid_id is distinct from target_auction.winning_bid_id
      or existing_item.amount_minor is distinct from target_bid.amount_minor
      or existing_item.currency is distinct from target_auction.currency
    then
      raise exception 'Existing Auction Order conflicts with canonical Auction truth.'
        using errcode = '23514';
    end if;

    return query
    select
      existing_order.id,
      existing_item.id,
      existing_item.auction_id,
      existing_item.copy_id,
      existing_item.winning_bid_id,
      existing_order.buyer_id,
      existing_order.seller_id,
      existing_order.status,
      existing_item.amount_minor,
      existing_item.currency,
      existing_order.created_at;
    return;
  end if;

  insert into public.orders (buyer_id, seller_id, status, currency)
  values (
    target_bid.bidder_id,
    target_auction.seller_id,
    'awaiting_payment',
    target_auction.currency
  )
  returning * into created_order;

  insert into public.order_items (
    order_id,
    auction_id,
    copy_id,
    winning_bid_id,
    amount_minor,
    currency
  )
  values (
    created_order.id,
    target_auction.id,
    target_auction.copy_id,
    target_auction.winning_bid_id,
    target_bid.amount_minor,
    target_auction.currency
  )
  returning * into created_item;

  return query
  select
    created_order.id,
    created_item.id,
    created_item.auction_id,
    created_item.copy_id,
    created_item.winning_bid_id,
    created_order.buyer_id,
    created_order.seller_id,
    created_order.status,
    created_item.amount_minor,
    created_item.currency,
    created_order.created_at;
end;
$$;

revoke all on function public.ensure_auction_order(uuid)
from public, anon, authenticated;
grant execute on function public.ensure_auction_order(uuid) to service_role;

comment on function public.ensure_auction_order(uuid) is
  'Trusted exactly-once creation boundary for the canonical Order of one won Auction. All transaction identity and Money derive from locked database truth.';

create function public.ensure_won_auction_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ensure_auction_order(new.id);
  return new;
end;
$$;

revoke all on function public.ensure_won_auction_order()
from public, anon, authenticated;

create trigger auctions_ensure_order_after_win
after insert or update of status, winning_bid_id on public.auctions
for each row
when (new.status = 'won')
execute function public.ensure_won_auction_order();

-- Reconcile valid won Auctions created before the canonical Order model. The
-- same serialization and validation boundary makes this idempotent.
do $$
declare
  won_auction record;
begin
  for won_auction in
    select auction.id
    from public.auctions as auction
    where auction.status = 'won'
    order by auction.id
  loop
    perform public.ensure_auction_order(won_auction.id);
  end loop;
end;
$$;

create function public.get_auction_order(target_auction_id uuid)
returns table (
  order_id uuid,
  auction_id uuid,
  copy_id uuid,
  status text,
  amount_minor bigint,
  currency text,
  created_at timestamptz,
  caller_role text,
  counterparty_profile_id uuid,
  counterparty_display_name text,
  counterparty_avatar_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_order public.orders%rowtype;
  target_item public.order_items%rowtype;
  role text;
  counterparty public.profiles%rowtype;
begin
  if caller_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if target_auction_id is null then
    raise exception 'target_auction_id is required.' using errcode = '22023';
  end if;

  select item.*
  into target_item
  from public.order_items as item
  where item.auction_id = target_auction_id;

  if not found then
    return;
  end if;

  select canonical_order.*
  into strict target_order
  from public.orders as canonical_order
  where canonical_order.id = target_item.order_id;

  if caller_id = target_order.buyer_id then
    role := 'buyer';
    select profile.* into strict counterparty
    from public.profiles as profile
    where profile.id = target_order.seller_id;
  elsif caller_id = target_order.seller_id then
    role := 'seller';
    select profile.* into strict counterparty
    from public.profiles as profile
    where profile.id = target_order.buyer_id;
  else
    raise exception 'Auction Order is not available to this caller.' using errcode = '42501';
  end if;

  return query
  select
    target_order.id,
    target_item.auction_id,
    target_item.copy_id,
    target_order.status,
    target_item.amount_minor,
    target_item.currency,
    target_order.created_at,
    role,
    counterparty.id,
    counterparty.display_name,
    counterparty.avatar_path;
end;
$$;

revoke all on function public.get_auction_order(uuid)
from public, anon, authenticated;
grant execute on function public.get_auction_order(uuid) to authenticated;

comment on function public.get_auction_order(uuid) is
  'Caller-aware safe Auction Order projection for the winning buyer and seller only. It exposes public counterparty identity and no Bid, auth, Copy-private, fulfillment, or payment data.';

create function public.get_my_auction_order_statuses()
returns table (
  auction_id uuid,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select item.auction_id, canonical_order.status
  from public.orders as canonical_order
  join public.order_items as item on item.order_id = canonical_order.id
  where canonical_order.buyer_id = auth.uid()
  order by item.auction_id;
$$;

revoke all on function public.get_my_auction_order_statuses()
from public, anon, authenticated;
grant execute on function public.get_my_auction_order_statuses() to authenticated;

comment on function public.get_my_auction_order_statuses() is
  'Minimal buyer-only status projection used to decorate the caller My Auctions tracker without exposing Order identity or counterparties.';
