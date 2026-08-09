# Messaging

## Purpose

Messaging exists so two collectors can coordinate a trade safely inside Geek
without disclosing a phone number, an email address, or an exact personal
location.

The product flow is:

Matching or Discovery
-> Conversation
-> TradeOffer
-> Conversation coordination
-> future TradeCompletion

Messaging is deliberately not a general social-chat platform. It is the
minimum canonical communication surface required for a trade to happen between
two Geek users.

## Conversation

A Conversation is a private one-to-one channel between exactly two Geek users.

Exactly one canonical Conversation exists per unordered user pair. Participants
are stored in deterministic UUID order as `participant_low_id` and
`participant_high_id`, so the pair `A, B` and the pair `B, A` resolve to the
same Conversation regardless of who writes first.

Participants are immutable historical identity. A Conversation between `A` and
`B` can never become a Conversation between `A` and `C`.

A Conversation contains no messages and no trade state of its own. It is only
the channel identity. It carries no title, avatar, group name, last-message
summary, unread count, mute flag, or archive flag; those are presentation or
inbox concerns that the canonical foundation does not need.

A user cannot open a Conversation with themselves.

A Conversation is not a Match, not a TradeOffer, and not a commercial
commitment. Messaging creates no reservation and no ownership effect.

## Message

A Message is immutable, user-authored, plain-text communication belonging to one
Conversation.

The sender must be one of the two Conversation participants. Canonical message
history is append-only: no editing, and no client deletion.

Message bodies are plain text only. A body must contain at least one
non-whitespace character and at most 4000 characters. Geek validates that the
body is not blank but does not otherwise normalise or rewrite meaningful
user whitespace or content. No HTML or rich-text representation is stored.

Attachments, images, audio, video, reactions, typing indicators, presence, read
receipts, threads, edits, disappearing messages, message search, and calls are
all deliberately absent.

## ConversationTradeOffer

A ConversationTradeOffer is an immutable reference connecting an existing
TradeOffer to the Conversation between those same two participants.

The reference stores only the link: the Conversation, the TradeOffer, who
created the link, and when. It never copies TradeOffer status, Copy terms, cash
terms, participants, or expiration.

A TradeOffer may appear in at most one Conversation. A Conversation may
accumulate many TradeOffers over time.

The TradeOffer proposer creates the initial link, so the person who authored the
proposal is responsible for placing it into the conversation. Linking never
alters the TradeOffer or its lifecycle, and a TradeOffer does not need to have
originated from Matching to be linked. Pending and historical offers between the
same participants may both be linked.

## TradeOffer display semantics

A conversation TradeOffer item is a live reference to the canonical TradeOffer.

Given `trade_offer_id = X`, a client resolves `X` through the TradeOffer domain
and renders its current canonical status: `pending`, `accepted`, `declined`,
`cancelled`, or `expired`. When an offer is sent, the reference appears in the
conversation; when that offer is later accepted, the same reference renders the
canonical accepted state.

Messaging neither records nor owns that lifecycle. There is deliberately no
`trade_offer_status`, `trade_offer_cash`, or `trade_offer_copy_snapshot` in
Messaging. Historical TradeOffer terms are already protected by the TradeOffer
domain's own immutability guarantees, so duplicating them here would add
synchronisation risk without adding truth.

## System events

Messaging introduces no generic system-event framework: no
`conversation_events` table, no system messages, no event payload documents, and
no polymorphic timeline infrastructure. The TradeOffer reference is sufficient
for this stage.

If product design later requires distinct timeline entries such as "Julie
accepted your offer at 14:32", that can be modelled then. Speculative event
architecture is avoided.

## Initiation

Conversations are created by sending the first message, never by opening a
composer. The controlled `send_direct_message` operation resolves or creates the
canonical Conversation for the participant pair and inserts the first Message in
one transaction, so Geek accumulates no empty Conversations.

The caller is always derived from the authenticated session. Callers cannot
supply a sender identity, and cannot send into a Conversation they do not
participate in.

Two users who message each other for the first time simultaneously still
produce exactly one Conversation and two Messages. The unique participant-pair
constraint is the serialization point, and conflict handling does not depend on
who happened to write first.

`send_conversation_message` appends to an existing Conversation for a
participant.

## Ordering

Canonical message ordering is `created_at` ascending, then `id` ascending. The
UUID is only a deterministic tie-breaker for messages that share a timestamp.

There is no client-authored timestamp and no editable sequence position.
Ordering is server-authoritative.

## Access and privacy

All Messaging tables use row-level security. Anonymous users have no access.

An authenticated user may read a Conversation only when they are one of its two
participants, so no other user can discover that the Conversation exists. The
same participation rule governs reading Messages and TradeOffer references.
Unrelated users see zero rows rather than a permission error.

Normal clients receive no direct insert, update, or delete privilege on any
Messaging table. Every state change happens through a controlled database
function.

Messaging records contain only canonical Geek user IDs. Messaging never
automatically exposes or injects:

- phone number
- email address
- exact discovery location
- Matching cell
- Copy private details
- storage location
- purchase price
- provenance
- Wishlist private details

A message body is user-authored content. A user may of course choose to type
personal information, but Geek never derives or inserts it on their behalf, and
a Conversation reveals nothing about either participant beyond their Geek
identity.

## Immutability as integrity

Immutability here is a database integrity rule, not only an authorization rule.
Trusted administrative authority does not silently rewrite history.

- Conversation `id`, `participant_low_id`, `participant_high_id`, and
  `created_at` cannot be modified after creation.
- Message `id`, `conversation_id`, `sender_id`, `body`, and `created_at` cannot
  be modified after insertion.
- TradeOffer reference `conversation_id`, `trade_offer_id`,
  `linked_by_user_id`, and `created_at` cannot be modified after insertion.

A Message sender must belong to its Conversation, and that is enforced as a
database invariant rather than only inside the controlled functions: a direct
trusted insert of a Message into the Conversation between `A` and `B` with
sender `C` fails. Because Conversation participants are themselves immutable,
the invariant cannot be invalidated after the fact.

Likewise, a TradeOffer reference is rejected unless the Conversation's two
participants are exactly the TradeOffer's proposer and recipient, which is what
makes participant-scoped read access to references safe.

If future moderation needs to hide content, it must introduce separate
moderation or visibility state rather than rewriting historical message text.
Moderation is not implemented here.

Row deletion is treated differently from rewriting. Clients cannot delete any
Messaging row. Trusted deletion remains possible because a Message is
self-contained history whose removal corrupts no other invariant, and because
future data-erasure obligations will need a trusted path.

## Contact policy and abuse readiness

For this foundation, any authenticated Geek user may send a first message to any
other existing Geek profile addressed by UUID.

This is an intentionally minimal backend capability, and **it is not sufficient
for public launch on its own.** The database is safe in the sense that identity
cannot be spoofed, history cannot be rewritten, and no user can read a
Conversation they do not belong to. That is database security, not abuse
control.

Before public launch Geek must add a contact and abuse policy, likely combining
several of:

- product-context gating for who may initiate contact
- user blocking
- reporting
- rate limits
- spam controls
- moderation review

None of those mechanisms exist yet. This foundation must not be described as
abuse-complete.

## Out of scope

Messaging does not implement groups, attachments, media, reactions, presence,
read receipts, push or email notifications, message search, edits, user
deletion, disappearing messages, threads, calls, contact sharing,
phone-number disclosure, exact-location sharing, TradeCompletion, ownership
transfer, payment, moderation tooling, reporting workflow, blocking, or rate
limiting.
