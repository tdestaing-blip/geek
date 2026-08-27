# Auctions

## Auction

An Auction represents explicit intent by the current owner of one Copy to sell
that Copy through competitive bidding during a defined time window.

Auction is not Listing and is not Copy. A Copy may exist without either.
Listings and Auctions remain distinct commercial mechanisms with different
terms, lifecycle, and presentation.

An Auction preserves the seller identity under which it was established.
Current Copy ownership is required while the Auction is being prepared or is
commercially committed, but a historical Auction may remain after a legitimate
future ownership transfer.

## Money and fulfillment

Starting amount, current amount, minimum increment, and private reserve amount
use integer minor units. The Auction has one explicit three-letter currency;
foreign-exchange behavior is not implemented.

Local pickup and shipping are independent capabilities. A scheduled or won
Auction must support at least one. Buyer geography does not belong on Auction,
and exact seller coordinates must never be copied into it.

### Create Auction V1 policy

The first seller creation experience intentionally exposes only the starting
amount. For this V1 policy, the atomic creation boundary fixes the currency to
EUR, the minimum increment to 100 minor units (€1.00), and fulfillment to local
pickup. These are product defaults for V1 rather than universal Auction rules.

The same trusted boundary derives `starts_at` from database transaction time,
sets `ends_at` to exactly seven days later, and creates the Auction directly as
`scheduled`. Mobile clients cannot supply or override the seller, increment, or
authoritative timestamps. A caller-generated stable Auction UUID makes a
network retry resolve to the same canonical Auction without shifting its time
window.

## Lifecycle and temporal phase

Persisted statuses are:

- `draft`: the seller is preparing the Auction
- `scheduled`: published and committed to an immutable bidding window and terms
- `won`: the bidding period produced a winner and the Copy remains committed
- `ended`: the period ended without a valid winner
- `cancelled`: cancelled before bidding commitment became irreversible
- `sold`: a future transaction completed; the Auction remains as history

There is no persisted `live` status. For a scheduled Auction, temporal phase is
derived using server-authoritative time:

- upcoming: now is before `starts_at`
- live: `starts_at` is at or before now and now is before `ends_at`
- awaiting finalization: now is at or after `ends_at`

Normal sellers may create and edit only their own currently-owned draft
Auctions. They may move a draft to `scheduled` or `cancelled`. Once scheduled,
normal clients cannot directly alter its terms or status. `won`, `ended`, and
`sold` are system-managed, and seller cancellation after scheduling is
deliberately deferred.

## Bids

A Bid is an immutable historical event belonging to one Auction and bidder.
Clients cannot directly create, update, or delete Bid rows. An authenticated
bidder uses `place_auction_bid`, which derives bidder identity from `auth.uid()`
and serializes concurrent bids by locking the Auction row.

For controlled Bid placement, `auction_bids.created_at` is the
server-authoritative serialized acceptance time. Geek samples it immediately
after acquiring the Auction row lock and uses that same timestamp for both the
bidding-window decision and the immutable Bid record.

The first Bid must meet the starting amount. Each later Bid must meet the
current amount plus the minimum increment. Proxy bidding, automatic bid
amounts, and anti-sniping extensions are not implemented.

Authenticated users may read only their own raw Bid rows. Anonymous users
cannot read raw Bids, and public Auction data never exposes bidder identity.
Public presentation uses only `current_amount_minor` and `bid_count`.

## Private reserve

Reserve amount is seller-private and stored separately from public-safe
Auction data. It must be at least the Auction's starting amount when present.
It may be created or edited only while the Auction is draft and its seller
still owns the Copy.

Finalization is trusted infrastructure. After the bidding window, an Auction
with no Bids or an unmet reserve becomes `ended`; otherwise it becomes `won`
and retains the winning Bid reference. A future public product may expose only
a derived reserve-met signal.

## Commercial commitment

`copy_commercial_commitments` is internal coordination infrastructure, not a
user-facing marketplace concept or a generic reservation framework. It enforces
at most one open commercial commitment per physical Copy across the supported
sale mechanisms.

Commitment-holding states are:

- Listing: `active`, `reserved`
- Auction: `scheduled`, `won`
- TradeOffer: `accepted`

Draft, paused, pending, declined, withdrawn, expired, ended, cancelled, sold,
and completed mechanisms do not hold a commitment. A completed TradeOffer has
already released its commitments as part of transferring ownership. Draft Listings, draft Auctions, and
pending TradeOffers may coexist. Historical mechanisms may coexist.

The commitment is created, retained, or released atomically with its source
Listing, Auction, or TradeOffer operation. Source/Copy consistency is enforced
by composite foreign keys. Normal clients have no direct access to the
commitment table.

Any commitment blocks Copy ownership transfer. Establishing or maintaining an
Auction commitment locks the Copy and verifies that the Auction seller is the
current owner. Trusted authority cannot bypass that invariant.

## Concurrency and lock ordering

The Copy row is the serialization boundary for commercial commitment
establishment and ownership transfer. Concurrent Listing activation, Auction
scheduling, TradeOffer acceptance, and Copy transfer therefore cannot commit
conflicting outcomes. Bid placement independently serializes on the Auction
row.

Future Order completion for a won Auction must use one trusted transaction to:

1. lock the Copy
2. lock or update the Auction
3. transition `won` to `sold`, releasing its commitment
4. transfer `Copy.owner_id` to the buyer

The Auction, seller, winner, and Bid history remain intact. Future workflows
that acquire locks in another order must handle PostgreSQL deadlock error
`40P01` by retrying the whole transaction.

## Search semantics

Future Geek Search may independently surface:

- fixed-price Listings
- Auctions
- trade-compatible Copies
- collectors or public Copies

A national search may return shipping Listings and shipping Auctions anywhere
in the supported territory. Geographic proximity is not a global Auction
constraint. Local-pickup discovery may later use controlled seller geography,
but Auction stores no exact coordinates.

## Deferred behavior

This foundation does not implement Order, checkout, payment, shipping labels,
addresses, Trade, Search, Matching, messaging, seller offers, proxy bidding,
automatic bid extension, UI, API clients, or ORM behavior.
