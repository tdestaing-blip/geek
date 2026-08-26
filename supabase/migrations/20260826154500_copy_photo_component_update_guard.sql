create function public.validate_copy_photo_component_update()
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

  return new;
end;
$$;

revoke all on function public.validate_copy_photo_component_update()
from public, anon, authenticated;

create trigger copy_photos_validate_component_update
before update of copy_id, edition_component_id on public.copy_photos
for each row execute function public.validate_copy_photo_component_update();
