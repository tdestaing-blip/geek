# Trade Offers

## TradeOffer

A TradeOffer is an explicit proposal from one user to another to exchange one
or more physical Copies.

The proposer offers one or more Copies they currently own. The recipient is
asked to provide one or more Copies they currently own. A TradeOffer may also
contain one optional positive monetary adjustment paid in either direction.
Trade is not assumed to be one-to-one.

For example:

Thomas gives:

- Mario Sunshine
- EUR 10

Julie gives:

- Wind Waker
- Metroid Prime

A TradeOffer:

- does not transfer ownership
- does not prove completion
- does not need to originate from a reciprocal Match
- does not depend on Wishlist state after creation

Matching is derived discovery. TradeOffer is canonical proposal state.
Explicitly selected participant and Copy identities define the proposal
regardless of how the users discovered each other.

## Participants and terms

Every TradeOffer has exactly one proposer and one different recipient.
Self-trade is invalid.

Each side contains between one and 20 distinct physical Copies. A Copy is an
individual object and has no quantity. The same Copy cannot appear on both
sides of one TradeOffer.

Terms are immutable after creation:

- proposer
- recipient
- offered and requested Copies
- monetary adjustment
- expiration
- creation timestamp

Normal clients cannot modify terms directly. To change a pending proposal, the
proposer cancels it and creates another TradeOffer. Counter-offer behavior is
not implemented.

Term immutability is a database integrity rule rather than only an
authorization rule. Participants, monetary adjustment, expiration, and creation
time cannot be rewritten after creation, and Copy membership cannot be updated
at all or added to or removed from a TradeOffer that is no longer pending.
Trusted administrative authority does not bypass those rules.

## Monetary adjustment

A TradeOffer may have no monetary adjustment or exactly one positive
adjustment paid in one direction:

- `proposer_pays_recipient`
- `recipient_pays_proposer`

Money uses a positive integer minor-unit amount and an explicit three-letter
uppercase ASCII currency. Signed amounts and foreign-exchange behavior are not
supported. Amount, currency, and direction are either all present or all
absent.

## Lifecycle

Persisted statuses are:

- `pending`: the proposal exists, but no Copy is reserved
- `accepted`: the recipient accepted and every involved Copy is reserved by
  this TradeOffer
- `declined`: the recipient rejected the proposal
- `cancelled`: the proposer withdrew the proposal before acceptance
- `expired`: the pending proposal's optional expiration time passed

Allowed user transitions are:

- proposer: `pending` to `cancelled`
- recipient: `pending` to `declined`
- recipient: `pending` to `accepted`

Trusted Geek infrastructure may transition `pending` to `expired` after the
optional server-authoritative expiration time. No scheduler is introduced by
this foundation. Acceptance independently checks wall-clock expiration and
cannot accept an expired-by-time offer that is still persisted as `pending`.

Normal clients cannot mutate an accepted TradeOffer. `completed`, `traded`,
meeting, and dispute states do not belong to this lifecycle.

## Creation

TradeOffers are created only through the controlled
`create_trade_offer` operation. The authenticated caller is always the
proposer; callers cannot supply another proposer identity.

Creation locks every involved Copy in deterministic UUID order and validates:

- every proposer-side Copy exists, is currently owned by the proposer, and is
  `open_to_trade`
- every recipient-side Copy exists, is currently owned by the recipient, and
  is `open_to_trade`
- no involved Copy has an existing commercial commitment
- Copy arrays are nonempty, distinct, null-free, disjoint, and bounded
- optional cash fields form one valid Money adjustment
- optional expiration is in the future according to server-authoritative time

The TradeOffer and all Copy membership rows are created atomically.

Copy visibility does not control eligibility. `open_to_trade` is the explicit
availability signal, so a private Copy may be included when its owner
intentionally proposes or requests that exact Copy.

## Pending offers

A pending TradeOffer creates no commercial commitment or reservation. Multiple
pending TradeOffers may reference the same Copy. A Copy in a pending offer may
later become unavailable, change owner, close for trade, or become committed
through another supported mechanism.

Pending offers are intentionally optimistic proposals. They are not
automatically cancelled when they become stale.

## Acceptance and reservations

Only the authenticated recipient may accept. Acceptance:

1. identifies the immutable involved Copy set
2. locks every involved Copy in deterministic UUID order
3. locks and re-reads the TradeOffer
4. samples a server-authoritative decision timestamp
5. requires the TradeOffer to remain pending and not expired-by-time
6. revalidates ownership and `open_to_trade` for both sides
7. requires every Copy to remain free of another commercial commitment
8. atomically creates one `trade_offer` commitment for every involved Copy
9. transitions the TradeOffer to `accepted`

All Copies are reserved or none are. A deferred database integrity rule enforces
that relationship independently of the operation used: an accepted TradeOffer
must hold exactly one commitment for every included Copy, and a TradeOffer in
any other status must hold none. Trusted authority cannot commit a partially
reserved accepted TradeOffer, and a future release path must transition the
status and release the commitments inside one transaction.

The shared one-commitment-per-Copy invariant makes accepted TradeOffers mutually
exclusive with:

- active or reserved Listings
- scheduled or won Auctions
- other accepted TradeOffers

It also blocks ownership transfer while an accepted TradeOffer holds a Copy.
Deterministic Copy-first locking serializes overlapping acceptances and avoids
arbitrary multi-Copy lock order.

Acceptance does not transfer ownership or prove the physical exchange occurred.
Participants coordinate the exchange itself in their Conversation.

## Cancellation, decline, and expiration

The proposer may cancel only a pending TradeOffer. The recipient may decline
only a pending TradeOffer. Neither operation releases commitments because
pending offers hold none.

Expiration is a trusted, service-only transition for a pending TradeOffer whose
optional expiration time has passed. No background scheduler is included.

Accepted offers cannot be cancelled, declined, or expired by normal clients in
this foundation.

## Access and privacy

TradeOffer and membership rows use row-level security. Anonymous users have no
access. An authenticated user may read a TradeOffer and its included Copy
identities only when they are the proposer or recipient.

Normal clients receive no direct insert, update, or delete privilege. State
changes occur through controlled database functions. Normal clients also have
no access to the internal commercial commitment table.

TradeOffer membership exposes only the Copy ID and side explicitly included in
the proposal. It does not expose:

- unrelated private Copies
- Copy private details
- purchase price
- provenance
- storage location
- component notes
- exact geography
- private Wishlist details

Wishlist, Matching, and Search functions are not consulted when creating or
transitioning a TradeOffer.

## Future TradeCompletion contract

Future TradeCompletion must operate atomically for an accepted TradeOffer:

1. lock all involved Copies in deterministic UUID order
2. validate the accepted TradeOffer and all its commitments
3. transition or release the TradeOffer reservation safely
4. transfer proposer Copies to the recipient
5. transfer recipient Copies to the proposer
6. preserve TradeOffer history
7. create TradeCompletion history

The current ownership-transfer guard blocks transfer while commitments exist.
Future completion must therefore release or transition the relevant
`trade_offer` commitments and transfer ownership inside one transaction.

TradeCompletion, ownership transfer, negotiation, counter offers, payment,
escrow, shipping, and notifications remain deferred. A TradeOffer may be
referenced from the Conversation between its two participants; that reference
belongs to the Messaging domain and never duplicates offer terms or status.
