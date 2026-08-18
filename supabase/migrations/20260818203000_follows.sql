create table public.follows (
  follower_id uuid not null,
  followed_id uuid not null,
  created_at timestamptz not null default now(),
  constraint follows_primary_key primary key (follower_id, followed_id),
  constraint follows_follower_foreign_key foreign key (follower_id)
    references public.profiles (id) on delete cascade,
  constraint follows_followed_foreign_key foreign key (followed_id)
    references public.profiles (id) on delete cascade,
  constraint follows_no_self_follow check (follower_id <> followed_id)
);

create index follows_followed_id_created_at_index
on public.follows (followed_id, created_at desc, follower_id);

create index follows_follower_id_created_at_index
on public.follows (follower_id, created_at desc, followed_id);

alter table public.follows enable row level security;

revoke all privileges on table public.follows from anon, authenticated;
grant select on table public.follows to authenticated;
grant insert (follower_id, followed_id) on table public.follows to authenticated;
grant delete on table public.follows to authenticated;
grant all privileges on table public.follows to service_role;

create policy follows_authenticated_read
on public.follows
for select
to authenticated
using (true);

create policy follows_insert_own
on public.follows
for insert
to authenticated
with check (follower_id = (select auth.uid()));

create policy follows_delete_own
on public.follows
for delete
to authenticated
using (follower_id = (select auth.uid()));
