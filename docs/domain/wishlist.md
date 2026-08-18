# Wishlist

## WishlistIntent

A WishlistIntent represents one user's desire to acquire or track the acquisition
of a physical Game or Edition. It is acquisition intent, not ownership.

Owning a Copy does not automatically remove or forbid a WishlistIntent. A
collector may still want:

- another Copy
- a better-condition Copy
- another regional Edition
- a duplicate for trade
- a sealed or special Edition in the future

Wishlist state must not be inferred only from the user's current Copies, and an
ownership change does not automatically fulfill a WishlistIntent.

## Broad and exact intent

A WishlistIntent always identifies one Game and may additionally identify one
exact Edition of that Game:

1. Game
2. Edition

A broad WishlistIntent has no Edition and means: "I want this game physically,
without requiring one exact Edition."

An exact WishlistIntent retains the Game and adds an Edition, meaning: "I want
this specific physical release." Database integrity requires the Edition to
belong to the same Game.

Broad intent may be refined to an Edition, and exact intent may become broad
again, without replacing its identity.

## Visibility

Wishlist visibility is separate from acquisition intent. Initial values are:

- `private`
- `public`

Private WishlistIntents are visible only to their owner and trusted Geek
operations. Public WishlistIntents may later appear on public profiles or support
matching and social discovery.

Public visibility does not imply that the user accepts unsolicited offers.

## Acquisition preferences

A WishlistIntent may indicate:

- purchase interest
- trade interest
- an optional maximum purchase price
- an optional maximum local trade distance
- priority

Network-safe optional constraints are:

- preferred region code
- whether completeness is unrestricted, preferred, or required
- a minimum component condition grade on Geek's existing 1-5 component scale

The grade is not an invented overall Copy condition or an average. It is a
universal lower bound applied independently to every catalogued component that
the candidate Copy records as present. Every such component must meet the
threshold. A component with no assessment, or with `unknown` presence, means a
strict future matcher cannot prove the constraint and therefore cannot match on
it. A missing component has no grade and is evaluated by completeness instead.

A Quick Copy without an Edition/component model cannot satisfy a component-grade
constraint until it is enriched. For a broad Game intent, each candidate Copy is
evaluated against the component definitions of its own Edition; Editions may
therefore have different component sets without being collapsed into one score.

Completeness derives only from presence of the Edition components marked
`required_for_complete`; it is not a condition grade. `complete_required` means
all of those required components must be assessed as present.
`complete_preferred` uses the same definition as a future ranking preference,
not a hard eligibility rule. If the catalog lacks an authoritative component
model for an Edition, strict completeness cannot be established and future
matching must treat that as an evaluation limitation rather than redefining
"complete."

Region preference applies only to broad Game intents. When an Edition is set,
its identity is authoritative and the database normalizes
`preferred_region_code` to `NULL`, including during broad-to-exact refinement.
Removing the Edition does not invent a new region preference; the owner may set
one explicitly afterward.

Purchase interest and trade interest are independent. Both may be false so a
user can track a collection goal without being commercially active. They are
public-safe intent fields when the WishlistIntent is public.

Maximum purchase price is a Money value stored as an integer minor amount and
an explicit currency. Amount and currency are either both present or both
absent. This budget is private owner preference data and is never exposed by a
public WishlistIntent.

Maximum trade distance is an optional preference expressed in kilometers. It
is not a location and does not reveal where the user lives. Precise geographic
data remains deferred to the geographic domain.

Priority expresses how urgently the owner wants the target. It is private
because exposing urgency could create negotiation leverage.

The following fields are owner-private and live separately from the public-safe
WishlistIntent data:

- maximum purchase price
- maximum trade distance
- priority
- private notes

A public WishlistIntent must not reveal any of these fields.

## Lifecycle

Initial WishlistIntent states are:

- `active`: the user currently wants or tracks the target
- `fulfilled`: the user considers the acquisition goal satisfied
- `archived`: the user no longer actively tracks the target

Geek does not automatically mark an item fulfilled when ownership changes.
That future behavior requires explicit product rules.

## Duplicate intent

A user may have at most one active WishlistIntent for the same exact target:

- one active broad intent for the same owner and Game
- one active exact intent for the same owner and Edition

Different exact Editions of one Game may coexist, and a broad intent may
coexist with exact intents. Future Match projections may deduplicate overlap.

Historical fulfilled or archived items may coexist with a new active item for
the same target.

## Implemented tables

`wishlist_intents` is the canonical source of truth. It stores required Game
identity, optional Edition identity, public-safe constraints, visibility,
lifecycle status, and purchase/trade interest.

`wishlist_intent_private_details` stores owner-only acquisition preferences:

- maximum purchase amount and currency
- maximum local trade distance
- priority
- private notes

Priority is intentionally small and explicit:

- `1`: low
- `2`: normal
- `3`: high

Separating private details prevents a public WishlistIntent from exposing its
owner's budget or private preferences.

The migration retains read-only `wishlist_items` and
`wishlist_private_details` compatibility views solely for the existing frozen
reciprocal-matching function. They project the canonical tables and store no
state. Application code uses only WishlistIntent names.

## Access

Anonymous users may read only public WishlistIntents. Authenticated users may
read public items and all their own items, and may create, update, or delete
only their own items.

Normal client updates cannot change a WishlistIntent's owner or Game. Owners
may refine or remove the same-Game Edition and update visibility, lifecycle,
interest, and public-safe constraints.

Wishlist private details are available only to the authenticated owner of the
parent WishlistIntent and trusted Geek operations. They remain private even when
the parent WishlistIntent is public. Owners may update their priority through the
private details record.

## Reciprocal trade matching semantics

Reciprocal local trade matching remains a derived projection, never persisted
WishlistIntent state. It interprets targets as follows:

- A Game-target WishlistIntent is potentially compatible with Copies whose
  Edition belongs to that Game.
- An Edition-target WishlistIntent is compatible only with Copies of that exact
  Edition unless future explicit fallback preferences say otherwise.

For the caller, all active WishlistIntents with `trade_interest = true` may
participate, whether private or public. This uses the caller's own private intent
only to compute results for that same caller. Inactive items and purchase
interest without trade interest do not participate.

For a counterpart, only active, public WishlistIntents with
`trade_interest = true` may participate. A counterpart's private WishlistIntents
and private Wishlist details never affect first-version matching.

For Matching only, the caller's private `max_trade_distance_km` is
conservatively converted to the greatest supported 2, 5, 10, 25, 50, 100, or
200 kilometer boundary that does not exceed it. A value below 2 contributes no
match. This may narrow eligibility for its specific want without creating an
arbitrary exact-distance threshold. The stored Wishlist preference is not
changed. The counterpart's private maximum distance is deliberately not used or
exposed until bilateral private-distance semantics are explicitly designed.

Matching still requires an actual `open_to_trade` Copy on each side. Future
Edition, condition, and completeness preferences remain deferred.
