create table public.edition_components (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions (id) on delete cascade,
  component_key text not null,
  name text not null,
  kind text not null,
  required_for_complete boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint edition_components_component_key_format check (
    component_key ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint edition_components_name_nonblank check (btrim(name) <> ''),
  constraint edition_components_name_length check (char_length(name) <= 100),
  constraint edition_components_kind_format check (
    kind ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint edition_components_sort_order_nonnegative check (sort_order >= 0),
  constraint edition_components_edition_component_key_unique unique (
    edition_id,
    component_key
  ),
  constraint edition_components_id_edition_id_unique unique (id, edition_id)
);

create index edition_components_edition_id_index
on public.edition_components (edition_id);

create index edition_components_edition_id_sort_order_index
on public.edition_components (edition_id, sort_order);

create trigger edition_components_set_updated_at
before update on public.edition_components
for each row execute function public.set_updated_at();

create table public.copies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  edition_id uuid not null references public.editions (id) on delete restrict,
  visibility text not null default 'private',
  trade_availability text not null default 'not_open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint copies_visibility_allowed check (
    visibility in ('private', 'public')
  ),
  constraint copies_trade_availability_allowed check (
    trade_availability in ('not_open', 'open_to_trade')
  ),
  constraint copies_id_edition_id_unique unique (id, edition_id)
);

create index copies_owner_id_index on public.copies (owner_id);
create index copies_edition_id_index on public.copies (edition_id);
create index copies_owner_id_created_at_index
on public.copies (owner_id, created_at);
create index copies_visibility_index on public.copies (visibility);
create index copies_trade_availability_index
on public.copies (trade_availability);

create trigger copies_set_updated_at
before update on public.copies
for each row execute function public.set_updated_at();

create table public.copy_private_details (
  copy_id uuid primary key references public.copies (id) on delete cascade,
  acquired_at date,
  purchase_amount_minor bigint,
  purchase_currency text,
  provenance text,
  private_notes text,
  storage_location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint copy_private_details_purchase_amount_nonnegative check (
    purchase_amount_minor is null or purchase_amount_minor >= 0
  ),
  constraint copy_private_details_purchase_pair check (
    (purchase_amount_minor is null) = (purchase_currency is null)
  ),
  constraint copy_private_details_purchase_currency_format check (
    purchase_currency is null or purchase_currency ~ '^[A-Z]{3}$'
  ),
  constraint copy_private_details_provenance_length check (
    provenance is null or char_length(provenance) <= 2000
  ),
  constraint copy_private_details_private_notes_length check (
    private_notes is null or char_length(private_notes) <= 4000
  ),
  constraint copy_private_details_storage_location_length check (
    storage_location is null or char_length(storage_location) <= 200
  )
);

create trigger copy_private_details_set_updated_at
before update on public.copy_private_details
for each row execute function public.set_updated_at();

create table public.copy_component_states (
  copy_id uuid not null,
  edition_id uuid not null,
  edition_component_id uuid not null,
  presence text not null default 'unknown',
  condition_grade smallint,
  condition_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint copy_component_states_primary_key primary key (
    copy_id,
    edition_component_id
  ),
  constraint copy_component_states_copy_edition_foreign_key foreign key (
    copy_id,
    edition_id
  ) references public.copies (id, edition_id) on delete cascade,
  constraint copy_component_states_component_edition_foreign_key foreign key (
    edition_component_id,
    edition_id
  ) references public.edition_components (id, edition_id) on delete restrict,
  constraint copy_component_states_presence_allowed check (
    presence in ('present', 'missing', 'unknown')
  ),
  constraint copy_component_states_condition_grade_range check (
    condition_grade is null or condition_grade between 1 and 5
  ),
  constraint copy_component_states_condition_requires_presence check (
    presence = 'present' or condition_grade is null
  ),
  constraint copy_component_states_condition_notes_length check (
    condition_notes is null or char_length(condition_notes) <= 1000
  )
);

create index copy_component_states_component_edition_index
on public.copy_component_states (edition_component_id, edition_id);

create trigger copy_component_states_set_updated_at
before update on public.copy_component_states
for each row execute function public.set_updated_at();

alter table public.edition_components enable row level security;
alter table public.copies enable row level security;
alter table public.copy_private_details enable row level security;
alter table public.copy_component_states enable row level security;

revoke all privileges on table public.edition_components from anon, authenticated;
revoke all privileges on table public.copies from anon, authenticated;
revoke all privileges on table public.copy_private_details from anon, authenticated;
revoke all privileges on table public.copy_component_states from anon, authenticated;

grant select on table public.edition_components to anon, authenticated;

grant select on table public.copies to anon, authenticated;
grant insert (owner_id, edition_id, visibility, trade_availability)
on table public.copies to authenticated;
grant update (visibility, trade_availability)
on table public.copies to authenticated;
grant delete on table public.copies to authenticated;

grant select on table public.copy_private_details to authenticated;
grant insert (
  copy_id,
  acquired_at,
  purchase_amount_minor,
  purchase_currency,
  provenance,
  private_notes,
  storage_location
)
on table public.copy_private_details to authenticated;
grant update (
  acquired_at,
  purchase_amount_minor,
  purchase_currency,
  provenance,
  private_notes,
  storage_location
)
on table public.copy_private_details to authenticated;
grant delete on table public.copy_private_details to authenticated;

grant select on table public.copy_component_states to anon, authenticated;
grant insert (
  copy_id,
  edition_id,
  edition_component_id,
  presence,
  condition_grade,
  condition_notes
)
on table public.copy_component_states to authenticated;
grant update (presence, condition_grade, condition_notes)
on table public.copy_component_states to authenticated;
grant delete on table public.copy_component_states to authenticated;

grant all privileges on table public.edition_components to service_role;
grant all privileges on table public.copies to service_role;
grant all privileges on table public.copy_private_details to service_role;
grant all privileges on table public.copy_component_states to service_role;

create policy edition_components_public_read
on public.edition_components
for select
to anon, authenticated
using (true);

create policy copies_anonymous_read_public
on public.copies
for select
to anon
using (visibility = 'public');

create policy copies_authenticated_read_visible
on public.copies
for select
to authenticated
using (visibility = 'public' or owner_id = (select auth.uid()));

create policy copies_insert_own
on public.copies
for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy copies_update_own
on public.copies
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy copies_delete_own
on public.copies
for delete
to authenticated
using (owner_id = (select auth.uid()));

create policy copy_private_details_read_own
on public.copy_private_details
for select
to authenticated
using (
  exists (
    select 1
    from public.copies
    where copies.id = copy_private_details.copy_id
      and copies.owner_id = (select auth.uid())
  )
);

create policy copy_private_details_insert_own
on public.copy_private_details
for insert
to authenticated
with check (
  exists (
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
using (
  exists (
    select 1
    from public.copies
    where copies.id = copy_private_details.copy_id
      and copies.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.copies
    where copies.id = copy_private_details.copy_id
      and copies.owner_id = (select auth.uid())
  )
);

create policy copy_private_details_delete_own
on public.copy_private_details
for delete
to authenticated
using (
  exists (
    select 1
    from public.copies
    where copies.id = copy_private_details.copy_id
      and copies.owner_id = (select auth.uid())
  )
);

create policy copy_component_states_anonymous_read_public
on public.copy_component_states
for select
to anon
using (
  exists (
    select 1
    from public.copies
    where copies.id = copy_component_states.copy_id
      and copies.visibility = 'public'
  )
);

create policy copy_component_states_authenticated_read_visible
on public.copy_component_states
for select
to authenticated
using (
  exists (
    select 1
    from public.copies
    where copies.id = copy_component_states.copy_id
      and (
        copies.visibility = 'public'
        or copies.owner_id = (select auth.uid())
      )
  )
);

create policy copy_component_states_insert_own
on public.copy_component_states
for insert
to authenticated
with check (
  exists (
    select 1
    from public.copies
    where copies.id = copy_component_states.copy_id
      and copies.owner_id = (select auth.uid())
  )
);

create policy copy_component_states_update_own
on public.copy_component_states
for update
to authenticated
using (
  exists (
    select 1
    from public.copies
    where copies.id = copy_component_states.copy_id
      and copies.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.copies
    where copies.id = copy_component_states.copy_id
      and copies.owner_id = (select auth.uid())
  )
);

create policy copy_component_states_delete_own
on public.copy_component_states
for delete
to authenticated
using (
  exists (
    select 1
    from public.copies
    where copies.id = copy_component_states.copy_id
      and copies.owner_id = (select auth.uid())
  )
);
