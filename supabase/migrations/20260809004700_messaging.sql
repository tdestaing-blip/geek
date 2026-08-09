create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  participant_low_id uuid not null
    references public.profiles (id) on delete restrict,
  participant_high_id uuid not null
    references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint conversations_participant_canonical_order check (
    participant_low_id < participant_high_id
  ),
  constraint conversations_participant_pair_unique unique (
    participant_low_id,
    participant_high_id
  )
);

create index conversations_participant_high_id_index
on public.conversations (participant_high_id);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.conversations (id) on delete restrict,
  sender_id uuid not null
    references public.profiles (id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now(),
  constraint conversation_messages_body_nonblank check (
    body ~ '[^[:space:]]'
  ),
  constraint conversation_messages_body_length check (
    char_length(body) <= 4000
  )
);

create index conversation_messages_timeline_index
on public.conversation_messages (conversation_id, created_at, id);

create table public.conversation_trade_offers (
  conversation_id uuid not null
    references public.conversations (id) on delete restrict,
  trade_offer_id uuid not null
    references public.trade_offers (id) on delete restrict,
  linked_by_user_id uuid not null
    references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint conversation_trade_offers_primary_key primary key (trade_offer_id)
);

create index conversation_trade_offers_conversation_id_index
on public.conversation_trade_offers (conversation_id);

create function public.enforce_conversation_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.participant_low_id is distinct from old.participant_low_id
    or new.participant_high_id is distinct from old.participant_high_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Conversation identity is immutable after creation.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_conversation_immutability()
from public, anon, authenticated;

create trigger conversations_enforce_immutability
before update on public.conversations
for each row execute function public.enforce_conversation_immutability();

create function public.validate_conversation_message_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender_participates boolean;
begin
  select new.sender_id in (
    parent.participant_low_id,
    parent.participant_high_id
  )
  into sender_participates
  from public.conversations as parent
  where parent.id = new.conversation_id;

  if not found then
    raise exception 'Referenced Conversation does not exist.'
      using errcode = '23503';
  end if;

  if not sender_participates then
    raise exception 'Message sender must participate in the Conversation.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_conversation_message_sender()
from public, anon, authenticated;

create trigger conversation_messages_validate_sender
before insert on public.conversation_messages
for each row execute function public.validate_conversation_message_sender();

create function public.enforce_conversation_message_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.conversation_id is distinct from old.conversation_id
    or new.sender_id is distinct from old.sender_id
    or new.body is distinct from old.body
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Message history is immutable after creation.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_conversation_message_immutability()
from public, anon, authenticated;

create trigger conversation_messages_enforce_immutability
before update on public.conversation_messages
for each row
execute function public.enforce_conversation_message_immutability();

create function public.validate_conversation_trade_offer_participants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_low_id uuid;
  conversation_high_id uuid;
  offer_proposer_id uuid;
  offer_recipient_id uuid;
begin
  select parent.participant_low_id, parent.participant_high_id
  into conversation_low_id, conversation_high_id
  from public.conversations as parent
  where parent.id = new.conversation_id;

  if not found then
    raise exception 'Referenced Conversation does not exist.'
      using errcode = '23503';
  end if;

  select offer.proposer_id, offer.recipient_id
  into offer_proposer_id, offer_recipient_id
  from public.trade_offers as offer
  where offer.id = new.trade_offer_id;

  if not found then
    raise exception 'Referenced TradeOffer does not exist.'
      using errcode = '23503';
  end if;

  if least(offer_proposer_id, offer_recipient_id)
      is distinct from conversation_low_id
    or greatest(offer_proposer_id, offer_recipient_id)
      is distinct from conversation_high_id
  then
    raise exception 'TradeOffer participants must be exactly the Conversation participants.'
      using errcode = '23514';
  end if;

  if new.linked_by_user_id not in (
    conversation_low_id,
    conversation_high_id
  ) then
    raise exception 'Only a Conversation participant may link a TradeOffer.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_conversation_trade_offer_participants()
from public, anon, authenticated;

create trigger conversation_trade_offers_validate_participants
before insert on public.conversation_trade_offers
for each row
execute function public.validate_conversation_trade_offer_participants();

create function public.enforce_conversation_trade_offer_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.conversation_id is distinct from old.conversation_id
    or new.trade_offer_id is distinct from old.trade_offer_id
    or new.linked_by_user_id is distinct from old.linked_by_user_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'A Conversation TradeOffer reference is immutable after creation.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_conversation_trade_offer_immutability()
from public, anon, authenticated;

create trigger conversation_trade_offers_enforce_immutability
before update on public.conversation_trade_offers
for each row
execute function public.enforce_conversation_trade_offer_immutability();

create function public.send_direct_message(
  recipient_user_id uuid,
  message_body text
)
returns table (conversation_id uuid, message_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  low_participant_id uuid;
  high_participant_id uuid;
  resolved_conversation_id uuid;
  inserted_message_id uuid;
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if recipient_user_id is null then
    raise exception 'recipient_user_id is required.' using errcode = '22023';
  end if;

  if recipient_user_id = caller_user_id then
    raise exception 'A Conversation requires two different users.'
      using errcode = '23514';
  end if;

  if message_body is null or message_body !~ '[^[:space:]]' then
    raise exception 'A Message body cannot be blank.' using errcode = '22023';
  end if;

  if pg_catalog.length(message_body) > 4000 then
    raise exception 'A Message body may contain at most 4000 characters.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles as recipient
    where recipient.id = recipient_user_id
  ) then
    raise exception 'Recipient does not exist.' using errcode = '23503';
  end if;

  low_participant_id := least(caller_user_id, recipient_user_id);
  high_participant_id := greatest(caller_user_id, recipient_user_id);

  insert into public.conversations (
    participant_low_id,
    participant_high_id
  ) values (
    low_participant_id,
    high_participant_id
  )
  on conflict (participant_low_id, participant_high_id) do nothing
  returning id into resolved_conversation_id;

  if resolved_conversation_id is null then
    select existing.id
    into resolved_conversation_id
    from public.conversations as existing
    where existing.participant_low_id = low_participant_id
      and existing.participant_high_id = high_participant_id;
  end if;

  if resolved_conversation_id is null then
    raise exception 'Conversation creation conflicted. Retry the operation.'
      using errcode = '40001';
  end if;

  insert into public.conversation_messages (
    conversation_id,
    sender_id,
    body
  ) values (
    resolved_conversation_id,
    caller_user_id,
    message_body
  )
  returning id into inserted_message_id;

  return query
  select resolved_conversation_id, inserted_message_id;
end;
$$;

revoke all on function public.send_direct_message(uuid, text)
from public, anon, authenticated;
grant execute on function public.send_direct_message(uuid, text)
to authenticated;

create function public.send_conversation_message(
  target_conversation_id uuid,
  message_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  parent_conversation public.conversations%rowtype;
  inserted_message_id uuid;
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if message_body is null or message_body !~ '[^[:space:]]' then
    raise exception 'A Message body cannot be blank.' using errcode = '22023';
  end if;

  if pg_catalog.length(message_body) > 4000 then
    raise exception 'A Message body may contain at most 4000 characters.'
      using errcode = '22023';
  end if;

  select parent.*
  into parent_conversation
  from public.conversations as parent
  where parent.id = target_conversation_id;

  if not found then
    raise exception 'Conversation does not exist.' using errcode = 'P0002';
  end if;

  if caller_user_id not in (
    parent_conversation.participant_low_id,
    parent_conversation.participant_high_id
  ) then
    raise exception 'Only a Conversation participant may send a Message.'
      using errcode = '42501';
  end if;

  insert into public.conversation_messages (
    conversation_id,
    sender_id,
    body
  ) values (
    parent_conversation.id,
    caller_user_id,
    message_body
  )
  returning id into inserted_message_id;

  return inserted_message_id;
end;
$$;

revoke all on function public.send_conversation_message(uuid, text)
from public, anon, authenticated;
grant execute on function public.send_conversation_message(uuid, text)
to authenticated;

create function public.link_trade_offer_to_conversation(
  target_conversation_id uuid,
  target_trade_offer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  parent_conversation public.conversations%rowtype;
  referenced_offer public.trade_offers%rowtype;
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select parent.*
  into parent_conversation
  from public.conversations as parent
  where parent.id = target_conversation_id;

  if not found then
    raise exception 'Conversation does not exist.' using errcode = 'P0002';
  end if;

  if caller_user_id not in (
    parent_conversation.participant_low_id,
    parent_conversation.participant_high_id
  ) then
    raise exception 'Only a Conversation participant may link a TradeOffer.'
      using errcode = '42501';
  end if;

  select offer.*
  into referenced_offer
  from public.trade_offers as offer
  where offer.id = target_trade_offer_id;

  if not found then
    raise exception 'TradeOffer does not exist.' using errcode = 'P0002';
  end if;

  if referenced_offer.proposer_id <> caller_user_id then
    raise exception 'Only the TradeOffer proposer may link the proposal.'
      using errcode = '42501';
  end if;

  if least(referenced_offer.proposer_id, referenced_offer.recipient_id)
      is distinct from parent_conversation.participant_low_id
    or greatest(referenced_offer.proposer_id, referenced_offer.recipient_id)
      is distinct from parent_conversation.participant_high_id
  then
    raise exception 'TradeOffer participants must be exactly the Conversation participants.'
      using errcode = '23514';
  end if;

  begin
    insert into public.conversation_trade_offers (
      conversation_id,
      trade_offer_id,
      linked_by_user_id
    ) values (
      parent_conversation.id,
      referenced_offer.id,
      caller_user_id
    );
  exception when unique_violation then
    raise exception 'This TradeOffer is already linked to a Conversation.'
      using errcode = '23505';
  end;

  return referenced_offer.id;
end;
$$;

revoke all on function public.link_trade_offer_to_conversation(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.link_trade_offer_to_conversation(uuid, uuid)
to authenticated;

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.conversation_trade_offers enable row level security;

revoke all privileges on table public.conversations from anon, authenticated;
revoke all privileges on table public.conversation_messages
from anon, authenticated;
revoke all privileges on table public.conversation_trade_offers
from anon, authenticated;

grant select on table public.conversations to authenticated;
grant select on table public.conversation_messages to authenticated;
grant select on table public.conversation_trade_offers to authenticated;

grant all privileges on table public.conversations to service_role;
grant all privileges on table public.conversation_messages to service_role;
grant all privileges on table public.conversation_trade_offers to service_role;

create policy conversations_participant_read
on public.conversations
for select
to authenticated
using (
  participant_low_id = (select auth.uid())
  or participant_high_id = (select auth.uid())
);

create policy conversation_messages_participant_read
on public.conversation_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.conversations as parent
    where parent.id = conversation_messages.conversation_id
      and (
        parent.participant_low_id = (select auth.uid())
        or parent.participant_high_id = (select auth.uid())
      )
  )
);

create policy conversation_trade_offers_participant_read
on public.conversation_trade_offers
for select
to authenticated
using (
  exists (
    select 1
    from public.conversations as parent
    where parent.id = conversation_trade_offers.conversation_id
      and (
        parent.participant_low_id = (select auth.uid())
        or parent.participant_high_id = (select auth.uid())
      )
  )
);
