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

  new.sort_order := photo_count;
  return new;
end;
$$;

create or replace function public.validate_copy_photo_component_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  copy_edition_id uuid;
begin
  if new.edition_component_id is null then
    return new;
  end if;

  select copy.edition_id
  into copy_edition_id
  from public.copies as copy
  where copy.id = new.copy_id
  for update;

  if copy_edition_id is null or not exists (
    select 1
    from public.edition_components as component
    where component.id = new.edition_component_id
      and component.edition_id = copy_edition_id
  ) then
    raise exception 'A Copy photo component must belong to the Copy Edition.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on column public.copy_photos.edition_component_id is
  'Optional catalog component context for this private photo. Photo availability never asserts physical presence or condition.';
