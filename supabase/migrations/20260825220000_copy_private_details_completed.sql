alter table public.copy_private_details
add column is_completed boolean not null default false;

grant insert (is_completed)
on table public.copy_private_details to authenticated;

grant update (is_completed)
on table public.copy_private_details to authenticated;
