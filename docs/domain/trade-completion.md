# Trade Completion

## Purpose

TradeCompletion records that a physical exchange actually happened.

The flow is:

TradeOffer
-> accepted
-> participants coordinate physically through their Conversation
-> one participant confirms the exchange happened
-> the other participant confirms the exchange happened
-> Geek completes the Trade atomically
-> Copy ownership changes

Geek cannot observe a physical handover, so it relies on both participants
saying it happened. One person's word is not enough to move ownership. The
second confirmation is therefore the moment the Trade becomes historical fact.

There is no TradeMeeting domain and no separate client-visible finalize
operation.

## TradeCompletion

A TradeCompletion is the immutable historical fact that one accepted TradeOffer
was completed. It exists only after both participants confirmed.

Exactly one TradeCompletion may exist for one TradeOffer. It stores only the
TradeOffer reference and the server-authoritative completion timestamp.

It deliberately does not copy the proposer, the recipient, the Copy identities,
the cash terms, the currency, the Conversation, or any Matching information.
Those facts already live in the immutable `trade_offers` and
`trade_offer_copies` records, so duplicating them would add synchronisation risk
without adding truth.

A TradeCompletion is not a meeting, does not process money, and does not carry
its own lifecycle. It either exists or it does not.

## TradeCompletionConfirmation

A TradeCompletionConfirmation is one participant's append-only statement that
the physical exchange took place.

Each participant may confirm at most once per TradeOffer, and a confirmation is
irreversible. Both confirmations remain historical facts forever after
completion; completing the Trade does not consume or replace them.

Only the proposer or the recipient of the TradeOffer may confirm, and only while
the TradeOffer is `accepted`. That is a database invariant rather than only an
authorization rule: a trusted direct insert naming a third user, or naming an
offer that is not accepted, fails.

## Confirming

Both the first and the second confirmation go through one operation:

`confirm_trade_completion(target_trade_offer_id)`

The caller is always derived from the authenticated session. There is no user
parameter and no way to confirm on someone else's behalf.

The first confirmation changes nothing except recording that the caller
confirmed. The TradeOffer stays `accepted`, every Copy stays reserved, no
ownership moves, and no TradeCompletion exists. The result reports
`completed = false` together with the caller's confirmation timestamp and
whether the counterpart has confirmed, which is what a client needs to render
"You confirmed, waiting for Julie".

The second confirmation completes the Trade inside the same transaction that
records it. The result reports `completed = true` with the canonical
TradeCompletion.

## Completion transaction

Completion is the most consequential transaction in the product, because it is
the only path that moves ownership of a physical object. It follows the
project-wide serialization convention: Copy rows first, in deterministic UUID
order, then the TradeOffer.

1. read the immutable TradeOffer Copy membership
2. lock every involved Copy in ascending Copy UUID order
3. lock and re-read the TradeOffer
4. re-read membership and fail with a retryable error if it changed
5. sample one server-authoritative timestamp after the locks are held
6. require the TradeOffer to be `accepted`
7. record the caller's confirmation if it does not already exist
8. stop here when the counterpart has not confirmed

When both confirmations exist, the same transaction then revalidates:

- every proposer-side Copy is still owned by the proposer
- every recipient-side Copy is still owned by the recipient
- every included Copy carries exactly one `trade_offer` commitment belonging to
  this TradeOffer
- no included Copy is missing its reservation

and then performs, atomically:

1. release every commercial commitment held by this TradeOffer
2. transition the TradeOffer from `accepted` to `completed`
3. transfer every proposer-side Copy to the recipient
4. transfer every recipient-side Copy to the proposer
5. create exactly one TradeCompletion

If any step fails, the whole transaction rolls back, including the second
confirmation that triggered it. There is no committed state in which only some
Copies moved, or in which commitments were released without the ownership change
landing.

Completion deliberately does not revalidate `trade_availability`. Being
`open_to_trade` was an acceptance-time requirement. Once accepted, the
reservation is the authoritative commercial state, so a participant who closed a
Copy to trade after acceptance can still complete the agreed exchange.

## What each side receives

A trade hands over the physical object, not the other participant's private
context or consent.

Each transferred Copy keeps its identity, its Edition, and its component
presence and condition, because those describe the object itself. It arrives
with `visibility` reset to `private` and `trade_availability` reset to
`not_open`.

Without those resets, ownership transfer would republish the new owner's
collection and re-offer their Copy for trade on the strength of the previous
owner's decisions. The new owner opts back in explicitly instead. The resets
happen in the same transaction and under the same Copy locks as the ownership
change, so no committed state exists in which the new owner holds a Copy
carrying the previous owner's consent.

Completion does not touch `copy_private_details` at all. Those rows are keyed by
owner, so the previous owner keeps their purchase price, acquisition date,
provenance, private notes, and storage location, and the new owner never gains
access to them. The Ownership domain describes that model.

## Why the Copy locks matter

The generic ownership-transfer guard refuses to move a Copy while it holds any
commercial commitment. Completion therefore has to release its own commitments
before transferring ownership, which briefly leaves the Copy uncommitted inside
the transaction.

The Copy row locks are what make that safe. Every mechanism that can claim a
Copy — Listing activation, Auction scheduling, TradeOffer acceptance, and any
ownership write — takes the same Copy row lock first. A concurrent attempt to
list, auction, or re-trade an involved Copy blocks until completion commits, and
then fails because the Copy has a new owner. No transaction can slip into the
gap between releasing the reservation and transferring ownership.

## Lifecycle

`completed` joins the TradeOffer lifecycle additively:

- `accepted`: the offer is accepted and every involved Copy is reserved, but the
  exchange is not yet canonically complete
- `completed`: both participants confirmed, ownership transferred, a
  TradeCompletion exists, and the TradeOffer holds no commitments

The normal client path is `pending` to `accepted` to `completed`. `declined`,
`cancelled`, and `expired` remain terminal.

Partial confirmation is not a TradeOffer status. An offer with one confirmation
is still simply `accepted`; the partial state lives in the confirmations.

There is deliberately no `disputed`, `failed`, or `completion_pending` status.

## Committed-state integrity

The completion invariants are database rules, not merely rules of the operation,
and they are checked with deferred constraint triggers so that a transaction may
be temporarily inconsistent internally while only valid committed state
survives.

At commit, for a TradeOffer that is `completed`:

- exactly two confirmations exist, one from the proposer and one from the
  recipient
- exactly one TradeCompletion exists
- no `trade_offer` commercial commitment remains
- every proposer-side Copy is owned by the recipient
- every recipient-side Copy is owned by the proposer
- Copies remain present on both sides

For a TradeOffer that is `accepted`:

- no TradeCompletion exists
- at most one confirmation exists, because the second confirmation must complete
  the Trade in the same transaction

For every other status, no confirmations and no TradeCompletion may exist.

These checks validate the transaction that records the completion. They are
deliberately not re-evaluated by unrelated later activity, because a completed
Trade must not prevent the new owner from trading the same Copy again
afterwards.

## Trusted authority

Trusted SQL may bypass product authorization, but it must not be able to commit
a false history. It cannot set a TradeOffer to `completed` without the full
completion state, invent a confirmation from a third user, record only one
confirmation, create a TradeCompletion without the ownership transfer, transfer
only some of the Copies, leave commitments behind, or release the commitments of
an accepted TradeOffer without completing it. Confirmations and TradeCompletions
also cannot be rewritten after creation.

Superuser DDL and `TRUNCATE` remain outside this threat model, following the
existing project-wide convention.

## Idempotency

Network retries are safe. Confirming again while waiting for the counterpart
returns the same waiting state and never changes the original confirmation
timestamp. Confirming again after completion returns the canonical
TradeCompletion and creates nothing. Two concurrent confirmations from the same
participant produce exactly one confirmation row.

## Cash adjustment

Geek does not process the optional monetary adjustment.

When a TradeOffer says the proposer pays the recipient EUR 10, both
confirmations mean the participants agree that the physical exchange, including
that cash, took place between them. Geek records no payment, no ledger entry, no
cash transaction, and no payment-provider event. The cash terms remain immutable
historical TradeOffer facts only.

## Access

Confirmations and TradeCompletions use row-level security. Anonymous users have
no access. A participant in the parent TradeOffer may read both their own and
their counterpart's confirmation, and the TradeCompletion, which is what lets a
client show "You confirmed, waiting for Julie" and later "Trade completed".
Unrelated users see zero rows.

Clients receive no direct insert, update, or delete privilege. Confirmation and
completion happen only through the controlled operation.

## Relationship to Messaging

Messaging is not modified and gains no completion state. A Conversation may
already reference the TradeOffer; once that TradeOffer becomes `completed`, the
existing reference renders the canonical completed status through the TradeOffer
domain. There is no conversation-completion table, no system message, and no
event record.

Completion does not require a Conversation to exist.

## Ownership history

No general Copy ownership-history ledger is introduced. The immutable
TradeOffer, its Copy membership, and the TradeCompletion together already
explain this specific ownership transition. A broader provenance domain may come
later.

## No retraction, and what that costs

Confirmations are irreversible, and there is no operation to withdraw one.

This has a real consequence that must be solved before public launch: **an
accepted TradeOffer whose exchange never happens stays reserved indefinitely.**
Its Copies remain committed, so they cannot be listed, auctioned, re-traded, or
transferred, and neither participant can undo that today. A first confirmer who
changes their mind has no route back either.

Geek therefore needs an accepted-trade cancellation and dispute workflow before
launch, covering at least mutual cancellation of an accepted TradeOffer,
unilateral abandonment after some period, and dispute handling when the
participants disagree about whether the exchange occurred. That workflow will
have to release commitments and transition lifecycle atomically, the same way
completion does. None of it is implemented here.

## Out of scope

TradeCompletion does not implement meeting logistics, location agreement,
payment, escrow, disputes, cancellation of accepted TradeOffers, confirmation
retraction, shipping, ratings, reputation, notifications, or any Messaging
change.
