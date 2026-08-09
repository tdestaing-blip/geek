alter table public.copy_private_details
add column owner_id uuid;

update public.copy_private_details as private_details
set owner_id = copy.owner_id
from public.copies as copy
where copy.id = private_details.copy_id;

alter table public.copy_private_details
alter column owner_id set not null;

alter table public.copy_private_details
add constraint copy_private_details_owner_id_foreign_key
foreign key (owner_id) references public.profiles (id) on delete cascade;

alter table public.copy_private_details
drop constraint copy_private_details_pkey;

alter table public.copy_private_details
add constraint copy_private_details_primary_key primary key (copy_id, owner_id);

create function public.enforce_copy_private_details_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.copy_id is distinct from old.copy_id
    or new.owner_id is distinct from old.owner_id
  then
    raise exception 'Copy private details cannot be reassigned to another Copy or owner.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_copy_private_details_identity()
from public, anon, authenticated;

create trigger copy_private_details_enforce_identity
before update on public.copy_private_details
for each row execute function public.enforce_copy_private_details_identity();

grant insert (owner_id) on table public.copy_private_details to authenticated;

drop policy copy_private_details_read_own on public.copy_private_details;
drop policy copy_private_details_insert_own on public.copy_private_details;
drop policy copy_private_details_update_own on public.copy_private_details;
drop policy copy_private_details_delete_own on public.copy_private_details;

create policy copy_private_details_read_own
on public.copy_private_details
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy copy_private_details_insert_own
on public.copy_private_details
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.copies
    where copies.id = copy_private_details.copy_id
      and copies.owner_id = (select auth.uid())
  )
);

create policy copy_private_details_update_own
on public.copy_private_details
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy copy_private_details_delete_own
on public.copy_private_details
for delete
to authenticated
using (owner_id = (select auth.uid()));
