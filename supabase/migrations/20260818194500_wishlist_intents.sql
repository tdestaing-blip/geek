drop index public.wishlist_items_active_game_target_unique;
drop index public.wishlist_items_active_edition_target_unique;

update public.wishlist_items as intent
set game_id = edition.game_id
from public.editions as edition
where intent.edition_id = edition.id
  and intent.game_id is null;

do $$
begin
  if exists (
    select 1
    from public.wishlist_items as intent
    join public.editions as edition on edition.id = intent.edition_id
    where intent.game_id is distinct from edition.game_id
  ) then
    raise exception 'WishlistIntent Game and Edition identity is inconsistent.'
      using errcode = '23514';
  end if;
end;
$$;

alter table public.wishlist_items
drop constraint wishlist_items_exactly_one_target,
alter column game_id set not null,
add column preferred_region_code text,
add column completeness_preference text not null default 'any',
add column minimum_component_condition_grade smallint,
add constraint wishlist_intents_edition_game_foreign_key foreign key (edition_id, game_id)
  references public.editions (id, game_id) on delete restrict,
add constraint wishlist_intents_preferred_region_code_valid check (
  preferred_region_code is null
  or (btrim(preferred_region_code) <> '' and char_length(preferred_region_code) <= 32)
),
add constraint wishlist_intents_completeness_preference_allowed check (
  completeness_preference in ('any', 'complete_preferred', 'complete_required')
),
add constraint wishlist_intents_minimum_component_condition_grade_range check (
  minimum_component_condition_grade is null
  or minimum_component_condition_grade between 1 and 5
);

alter table public.wishlist_items rename to wishlist_intents;
alter table public.wishlist_private_details rename to wishlist_intent_private_details;
alter table public.wishlist_intent_private_details
rename column wishlist_item_id to wishlist_intent_id;

create unique index wishlist_intents_active_broad_target_unique
on public.wishlist_intents (owner_id, game_id)
where status = 'active' and edition_id is null;

create unique index wishlist_intents_active_exact_target_unique
on public.wishlist_intents (owner_id, edition_id)
where status = 'active' and edition_id is not null;

create index wishlist_intents_preferred_region_code_index
on public.wishlist_intents (preferred_region_code)
where preferred_region_code is not null;

create index wishlist_intents_completeness_preference_index
on public.wishlist_intents (completeness_preference);

create index wishlist_intents_minimum_component_condition_grade_index
on public.wishlist_intents (minimum_component_condition_grade)
where minimum_component_condition_grade is not null;

create function public.normalize_wishlist_intent_exact_constraints()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- An exact Edition is authoritative for region. Keeping a separate region
  -- preference would allow contradictory canonical intent state.
  if new.edition_id is not null then
    new.preferred_region_code := null;
  end if;

  return new;
end;
$$;

revoke all on function public.normalize_wishlist_intent_exact_constraints()
from public, anon, authenticated;

create trigger wishlist_intents_normalize_exact_constraints
before insert or update of edition_id, preferred_region_code
on public.wishlist_intents
for each row execute function public.normalize_wishlist_intent_exact_constraints();

create function public.protect_wishlist_intent_game_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.game_id is distinct from old.game_id then
    raise exception 'A WishlistIntent cannot change its Game.' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_wishlist_intent_game_identity()
from public, anon, authenticated;

create trigger wishlist_intents_protect_game_identity
before update of game_id on public.wishlist_intents
for each row execute function public.protect_wishlist_intent_game_identity();

revoke insert (
  owner_id,
  game_id,
  edition_id,
  visibility,
  status,
  purchase_interest,
  trade_interest
)
on table public.wishlist_intents from authenticated;

grant insert (
  owner_id,
  game_id,
  edition_id,
  visibility,
  status,
  purchase_interest,
  trade_interest,
  preferred_region_code,
  completeness_preference,
  minimum_component_condition_grade
)
on table public.wishlist_intents to authenticated;

grant update (
  edition_id,
  visibility,
  status,
  purchase_interest,
  trade_interest,
  preferred_region_code,
  completeness_preference,
  minimum_component_condition_grade
)
on table public.wishlist_intents to authenticated;

-- The frozen reciprocal-matching function still resolves the legacy table
-- names at execution. These RLS-invoker views preserve its old broad-vs-exact
-- target shape without creating a second source of truth or exposing them to
-- application roles.
create view public.wishlist_items
with (security_invoker = true)
as
select
  id,
  owner_id,
  case when edition_id is null then game_id else null::uuid end as game_id,
  edition_id,
  visibility,
  status,
  purchase_interest,
  trade_interest,
  created_at,
  updated_at
from public.wishlist_intents;

create view public.wishlist_private_details
with (security_invoker = true)
as
select
  wishlist_intent_id as wishlist_item_id,
  max_purchase_amount_minor,
  max_purchase_currency,
  max_trade_distance_km,
  priority,
  private_notes,
  created_at,
  updated_at
from public.wishlist_intent_private_details;

revoke all privileges on table public.wishlist_items from anon, authenticated;
revoke all privileges on table public.wishlist_private_details from anon, authenticated;
grant select on table public.wishlist_items to service_role;
grant select on table public.wishlist_private_details to service_role;
