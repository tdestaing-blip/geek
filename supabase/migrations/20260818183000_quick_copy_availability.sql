alter table public.editions
add constraint editions_id_game_id_unique unique (id, game_id);

alter table public.copies
add column game_id uuid references public.games (id) on delete restrict,
add column availability text;

update public.copies as copy
set game_id = edition.game_id
from public.editions as edition
where edition.id = copy.edition_id;

update public.copies as copy
set availability = case
  when exists (
    select 1 from public.copy_commercial_commitments as commitment
    where commitment.copy_id = copy.id and commitment.kind = 'listing'
  ) then 'for_sale'
  when exists (
    select 1 from public.copy_commercial_commitments as commitment
    where commitment.copy_id = copy.id and commitment.kind = 'auction'
  ) then 'in_auction'
  when copy.trade_availability = 'open_to_trade' then 'open_to_trade'
  else 'private'
end;

alter table public.copies
alter column game_id set not null,
alter column availability set default 'private',
alter column availability set not null,
alter column edition_id drop not null,
add constraint copies_edition_game_foreign_key foreign key (edition_id, game_id)
  references public.editions (id, game_id) on delete restrict,
add constraint copies_availability_allowed check (
  availability in ('private', 'open_to_trade', 'for_sale', 'in_auction')
);

create index copies_game_id_index on public.copies (game_id);
create index copies_availability_index on public.copies (availability);

create function public.protect_copy_catalog_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.game_id is distinct from old.game_id then
    raise exception 'A Copy cannot change its Game.' using errcode = '23514';
  end if;

  if new.edition_id is distinct from old.edition_id and exists (
    select 1
    from public.copy_component_states as component_state
    where component_state.copy_id = old.id
  ) then
    raise exception 'A Copy with Edition-specific component state cannot change its Edition.'
      using errcode = '23514';
  end if;

  if new.edition_id is distinct from old.edition_id and exists (
    select 1
    from public.copy_commercial_commitments as commitment
    where commitment.copy_id = old.id
  ) then
    raise exception 'A commercially committed Copy cannot change its Edition.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_copy_catalog_identity()
from public, anon, authenticated;

create trigger copies_protect_catalog_identity
before update of game_id, edition_id on public.copies
for each row execute function public.protect_copy_catalog_identity();

create function public.validate_copy_availability_commitment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  commitment_kind text;
begin
  if new.availability is distinct from old.availability then
    new.trade_availability := case
      when new.availability = 'open_to_trade' then 'open_to_trade'
      else 'not_open'
    end;
  elsif new.trade_availability is distinct from old.trade_availability then
    new.availability := case
      when new.trade_availability = 'open_to_trade' then 'open_to_trade'
      else 'private'
    end;
  end if;

  select commitment.kind
  into commitment_kind
  from public.copy_commercial_commitments as commitment
  where commitment.copy_id = new.id;

  if commitment_kind = 'listing' and new.availability <> 'for_sale' then
    raise exception 'A Copy with a Listing commitment must be for sale.' using errcode = '23514';
  elsif commitment_kind = 'auction' and new.availability <> 'in_auction' then
    raise exception 'A Copy with an Auction commitment must be in auction.' using errcode = '23514';
  elsif new.availability = 'for_sale' and commitment_kind is distinct from 'listing' then
    raise exception 'For-sale availability requires a Listing commitment.' using errcode = '23514';
  elsif new.availability = 'in_auction' and commitment_kind is distinct from 'auction' then
    raise exception 'In-auction availability requires an Auction commitment.' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_copy_availability_commitment()
from public, anon, authenticated;

create trigger copies_validate_availability_commitment
before update of availability, trade_availability on public.copies
for each row execute function public.validate_copy_availability_commitment();

create function public.sync_copy_availability_from_commitment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject_copy_id uuid;
  commitment_kind text;
begin
  subject_copy_id := case when tg_op = 'DELETE' then old.copy_id else new.copy_id end;

  select commitment.kind
  into commitment_kind
  from public.copy_commercial_commitments as commitment
  where commitment.copy_id = subject_copy_id;

  update public.copies as copy
  set availability = case
    when commitment_kind = 'listing' then 'for_sale'
    when commitment_kind = 'auction' then 'in_auction'
    when copy.availability in ('for_sale', 'in_auction') then 'private'
    else copy.availability
  end
  where copy.id = subject_copy_id;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_copy_availability_from_commitment()
from public, anon, authenticated;

create trigger copy_commercial_commitments_sync_copy_availability
after insert or update or delete on public.copy_commercial_commitments
for each row execute function public.sync_copy_availability_from_commitment();

revoke insert (owner_id, edition_id, visibility, trade_availability)
on table public.copies from authenticated;
revoke update (visibility, trade_availability)
on table public.copies from authenticated;

grant insert (owner_id, game_id, edition_id, visibility, availability)
on table public.copies to authenticated;
-- The compatibility column remains writable because the BEFORE trigger may
-- assign it during an authenticated availability update. The same trigger
-- maps any direct legacy write back into the finite availability model, so the
-- two values cannot diverge.
grant update (edition_id, visibility, availability, trade_availability)
on table public.copies to authenticated;
