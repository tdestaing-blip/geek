alter table public.copy_photos
add column photo_role text,
add constraint copy_photos_photo_role_allowed check (
  photo_role is null or photo_role in ('cartridge', 'box', 'manual')
);

update public.copy_photos as photo
set photo_role = component.kind
from public.edition_components as component
where photo.edition_component_id = component.id
  and photo.photo_role is null
  and component.kind in ('cartridge', 'box', 'manual');

create index copy_photos_role_order_index
on public.copy_photos (copy_id, photo_role, sort_order, id)
where photo_role is not null;

comment on column public.copy_photos.photo_role is
  'Optional universal owned-Copy photo category. It is independent from Edition completeness components and Copy presence or condition.';
