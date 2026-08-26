create table public.copy_photos (
  id uuid primary key,
  copy_id uuid not null references public.copies (id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  mime_type text not null,
  width integer not null,
  height integer not null,
  byte_size integer not null,
  created_at timestamptz not null default now(),
  constraint copy_photos_storage_path_unique unique (storage_path),
  constraint copy_photos_copy_order_unique unique (copy_id, sort_order)
    deferrable initially immediate,
  constraint copy_photos_sort_order_range check (sort_order between 0 and 5),
  constraint copy_photos_mime_type_jpeg check (mime_type = 'image/jpeg'),
  constraint copy_photos_width_positive check (width > 0),
  constraint copy_photos_height_positive check (height > 0),
  constraint copy_photos_byte_size_range check (byte_size between 1 and 8388608),
  constraint copy_photos_canonical_storage_path check (
    storage_path = copy_id::text || '/' || id::text || '.jpg'
  )
);

create index copy_photos_copy_id_order_index
on public.copy_photos (copy_id, sort_order, id);

create function public.prepare_copy_photo_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  photo_count integer;
begin
  perform 1
  from public.copies as copy
  where copy.id = new.copy_id
  for update;

  if not found then
    raise exception 'The Copy does not exist.' using errcode = '23503';
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

revoke all on function public.prepare_copy_photo_insert()
from public, anon, authenticated;

create trigger copy_photos_prepare_insert
before insert on public.copy_photos
for each row execute function public.prepare_copy_photo_insert();

create function public.delete_copy_photo(p_photo_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject_copy_id uuid;
  deleted_storage_path text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select photo.copy_id, photo.storage_path
  into subject_copy_id, deleted_storage_path
  from public.copy_photos as photo
  join public.copies as copy on copy.id = photo.copy_id
  where photo.id = p_photo_id
    and copy.owner_id = (select auth.uid())
  for update of copy;

  if subject_copy_id is null then
    return null;
  end if;

  delete from public.copy_photos as photo
  where photo.id = p_photo_id;

  set constraints public.copy_photos_copy_order_unique deferred;

  with normalized as (
    select
      photo.id,
      row_number() over (order by photo.sort_order, photo.id)::integer - 1 as sort_order
    from public.copy_photos as photo
    where photo.copy_id = subject_copy_id
  )
  update public.copy_photos as photo
  set sort_order = normalized.sort_order
  from normalized
  where photo.id = normalized.id;

  return deleted_storage_path;
end;
$$;

revoke all on function public.delete_copy_photo(uuid)
from public, anon;
grant execute on function public.delete_copy_photo(uuid) to authenticated, service_role;

alter table public.copy_photos enable row level security;

revoke all privileges on table public.copy_photos from anon, authenticated;
grant select on table public.copy_photos to authenticated;
grant insert (id, copy_id, storage_path, mime_type, width, height, byte_size)
on table public.copy_photos to authenticated;
grant all privileges on table public.copy_photos to service_role;

create policy copy_photos_read_own
on public.copy_photos
for select
to authenticated
using (
  exists (
    select 1
    from public.copies as copy
    where copy.id = copy_photos.copy_id
      and copy.owner_id = (select auth.uid())
  )
);

create policy copy_photos_insert_own
on public.copy_photos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.copies as copy
    where copy.id = copy_photos.copy_id
      and copy.owner_id = (select auth.uid())
  )
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'copy-photos',
  'copy-photos',
  false,
  8388608,
  array['image/jpeg']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy copy_photos_storage_read_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'copy-photos'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
  and exists (
    select 1
    from public.copies as copy
    where copy.id::text = (storage.foldername(name))[1]
      and copy.owner_id = (select auth.uid())
  )
);

create policy copy_photos_storage_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'copy-photos'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
  and exists (
    select 1
    from public.copies as copy
    where copy.id::text = (storage.foldername(name))[1]
      and copy.owner_id = (select auth.uid())
  )
);

create policy copy_photos_storage_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'copy-photos'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
  and exists (
    select 1
    from public.copies as copy
    where copy.id::text = (storage.foldername(name))[1]
      and copy.owner_id = (select auth.uid())
  )
);
