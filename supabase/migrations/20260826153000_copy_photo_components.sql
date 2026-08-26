alter table public.copy_photos
add column edition_component_id uuid references public.edition_components (id) on delete restrict;

create index copy_photos_component_order_index
on public.copy_photos (copy_id, edition_component_id, sort_order, id)
where edition_component_id is not null;

create or replace function public.prepare_copy_photo_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  photo_count integer;
  copy_edition_id uuid;
begin
  select copy.edition_id
  into copy_edition_id
  from public.copies as copy
  where copy.id = new.copy_id
  for update;

  if not found then
    raise exception 'The Copy does not exist.' using errcode = '23503';
  end if;

  if new.edition_component_id is not null then
    if copy_edition_id is null or not exists (
      select 1
      from public.edition_components as component
      where component.id = new.edition_component_id
        and component.edition_id = copy_edition_id
    ) then
      raise exception 'A Copy photo component must belong to the Copy Edition.'
        using errcode = '23514';
    end if;
  end if;

  select count(*)::integer
  into photo_count
  from public.copy_photos as photo
  where photo.copy_id = new.copy_id;

  if photo_count >= 6 then
    raise exception 'A Copy cannot have more than six photos.' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'copy-photos'
      and object.name = new.storage_path
  ) then
    raise exception 'Copy photo metadata requires its private Storage object.'
      using errcode = '23503';
  end if;

  if new.edition_component_id is not null then
    insert into public.copy_component_states (
      copy_id,
      edition_id,
      edition_component_id,
      presence,
      condition_grade
    )
    values (
      new.copy_id,
      copy_edition_id,
      new.edition_component_id,
      'present',
      null
    )
    on conflict (copy_id, edition_component_id) do update
    set
      presence = 'present',
      condition_grade = case
        when copy_component_states.presence = 'present'
          then copy_component_states.condition_grade
        else null
      end;
  end if;

  new.sort_order := photo_count;
  return new;
end;
$$;

revoke all on function public.prepare_copy_photo_insert()
from public, anon, authenticated;

create or replace function public.protect_copy_catalog_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.availability in ('for_sale', 'in_auction') then
      raise exception 'A new Copy cannot have commercial availability without a commitment.'
        using errcode = '23514';
    end if;

    new.trade_availability := case
      when new.availability = 'open_to_trade' then 'open_to_trade'
      else 'not_open'
    end;

    return new;
  end if;

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
    from public.copy_photos as photo
    where photo.copy_id = old.id
      and photo.edition_component_id is not null
  ) then
    raise exception 'A Copy with Edition-specific component photos cannot change its Edition.'
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

revoke insert on table public.copy_photos from authenticated;
grant insert (
  id,
  copy_id,
  edition_component_id,
  storage_path,
  mime_type,
  width,
  height,
  byte_size
)
on table public.copy_photos to authenticated;
