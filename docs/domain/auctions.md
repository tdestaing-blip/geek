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
cannot read raw Bids. Cross-user history is available only through the bounded
safe Auction history projection, which exposes accepted Money/timestamp and the
bidder's deliberately public Profile identity. It never exposes raw Bid IDs or
private/auth Profile fields.

## Private reserve

Reserve amount is seller-private and stored separately from public-safe
Auction data. It must be at least the Auction's starting amount when present.
It may be created or edited only while the Auction is draft and its seller
still owns the Copy.

Finalization is trusted infrastructure. After the bidding window, an Auction
with no Bids or an unmet reserve becomes `ended`; otherwise it becomes `won`
and retains the winning Bid reference. A future public product may expose only
a derived reserve-met signal.

## Resolution V1

Postgres is the canonical Auction resolution worker. The `pg_cron` job
`geek-finalize-due-auctions` runs every minute and asks a trusted bounded batch
to resolve at most 100 due scheduled Auctions in deterministic end-time and ID
order. Overlapping runs skip Auction rows already being resolved, and one
malformed Auction is isolated from the rest of its batch.

`finalize_auction` uses the Auction row as the same serialization boundary as
Bid placement and samples database time after acquiring that lock. Therefore a
Bid accepted before the canonical deadline is part of the aggregate seen by
finalization, while a Bid evaluated at or after the deadline is rejected.
Retries of an already `ended` or `won` Auction return its unchanged canonical
row.

Resolution does not create a second winner identity. A `won` Auction's
`winning_bid_id` references its immutable canonical leading Bid. The
caller-aware result projection derives seller, winner, and losing-bidder roles
from `auth.uid()` and exposes only status, final aggregate amount, bid count,
end time, and the caller-relative outcome. Resolved Auction history is not
globally readable.

The seller and every accepted bidder may continue to read the existing
marketplace-safe Public Copy projection after an Auction resolves. This gives a
winner or losing bidder historical continuity without broadening access for an
unrelated caller. The exception never exposes private Copy photos or details,
precise location, auth metadata, or private Wishlist preferences.

Resolution determines a winner but does not transfer Copy ownership. A won
result may expose the winner's deliberately public Profile id, display name,
and avatar separately from the unchanged current owner. Settlement, Order, and
ownership transfer remain deferred.

## Live Experience V1

Bid placement remains serialized on the Auction row and uses the canonical
database acceptance timestamp. A genuinely new accepted Bid with strictly less
than 60 seconds remaining moves `ends_at` to that acceptance timestamp plus 60
seconds. Exactly 60 seconds does not extend. A Bid at or after the current
canonical deadline is rejected, and an idempotent retry returns its stored Bid
and stored deadline without applying another extension.

Because `finalize_auction` takes the same Auction lock and rechecks the current
`ends_at`, a final-minute extension cannot race with resolution against a stale
deadline. The existing minute-based cron cadence is unchanged.

The live Auction projection exposes only current Money, Bid count, minimum Bid,
deadline, status, and a caller-relative `none`, `leading`, or `outbid` state.
Seller and anonymous callers receive no bidder-relative state. No Bid ID,
bidder identity, Bid history, or authentication metadata is returned. Mobile
updates countdown presentation locally each second and polls this narrow
canonical projection every five seconds only while the Public Copy screen is
focused and live.

## Presence and history V1

An authenticated caller has one global bidder-participation projection for
Auctions where they placed an accepted Bid. It returns every currently live
participation plus at most the ten most recent `won` or `ended` results,
ordered by canonical Auction end time. Each row contains only safe catalog
presentation and caller-relative state. Live rows expose `leading` or `outbid`;
resolved rows expose `won`, `lost`, or `ended`. Seller-only and future Auctions
are excluded.

The mobile shell polls this single projection at a bounded five-second cadence
only while at least one live or resolving participation exists and the app is foreground.
The same response atomically moves a row from **En cours** to **Terminées**,
preserving safe navigation after Market correctly stops showing the resolved
Auction. Countdowns remain local presentation using one shared clock per
expanded panel and never appear on resolved rows. Between the canonical
deadline and server resolution, a narrow `resolving` phase keeps the row visible
without a countdown or leading/outbid claim, so polling cannot stop before the
result exists. No acknowledgement state, notification, or full Activity history
is persisted.

Bid history is newest-first with an internal deterministic Bid-id tie-breaker,
but the fixed output omits that raw ID and is capped at 50 accepted Bids. A live
safe Auction viewer may read it. After resolution, the seller, winner, accepted
losing bidders, or a caller independently allowed by public Copy visibility may
read it. Raw Bid RLS remains bidder-private.

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

## Auction Order V1

A canonically `won` Auction creates exactly one canonical `Order` with exactly
one `OrderItem`. The Order starts in `awaiting_payment`: buyer and seller have
an agreed commercial transaction, but payment has not been authorized,
captured, or completed. The Order does not imply fulfillment, ownership
transfer, or an Auction `sold` transition.

Order identity, parties, Copy, winning Bid, agreed integer-minor-unit Money, and
currency derive inside the database from the locked Auction. A trigger runs the
trusted idempotent creation boundary in the same transaction after winner
selection. Its unique Auction item relationship and Auction row lock prevent
duplicate or orphan Orders under retries and concurrency. Existing won Auctions
are reconciled through the same boundary.

Auction fulfillment fields remain seller capabilities. V1 intentionally stores
no selected Order fulfillment method because the buyer and seller have not yet
made that choice. It also introduces no checkout, payment provider, payment
record, webhook, payout, refund, shipping, or dispute state.

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

This foundation does not implement checkout, payment, shipping labels,
addresses, Order fulfillment, Trade, Search, Matching, messaging, seller
offers, proxy bidding, automatic bid extension, or payment-provider behavior.
