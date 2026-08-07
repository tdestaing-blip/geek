# Wishlist

## WishlistItem

A WishlistItem represents one user's desire to acquire or track the acquisition
of a physical Game or Edition. It is acquisition intent, not ownership.

Owning a Copy does not automatically remove or forbid a WishlistItem. A
collector may still want:

- another Copy
- a better-condition Copy
- another regional Edition
- a duplicate for trade
- a sealed or special Edition in the future

Wishlist state must not be inferred only from the user's current Copies, and an
ownership change does not automatically fulfill a WishlistItem.

## Target

A WishlistItem targets exactly one of:

1. Game
2. Edition

It can never target both.

A Game-level WishlistItem means: "I want this game physically, without
requiring one exact Edition."

An Edition-level WishlistItem means: "I want this specific physical Edition."

A Game-level item may later gain Edition preferences or exclusions. Those
preference tables are deliberately deferred.

## Visibility

Wishlist visibility is separate from acquisition intent. Initial values are:

- `private`
- `public`

Private WishlistItems are visible only to their owner and trusted Geek
operations. Public WishlistItems may later appear on public profiles or support
matching and social discovery.

Public visibility does not imply that the user accepts unsolicited offers.

## Acquisition preferences

A WishlistItem may indicate:

- purchase interest
- trade interest
- an optional maximum purchase price
- an optional maximum local trade distance
- priority

Purchase interest and trade interest are independent. Both may be false so a
user can track a collection goal without being commercially active. They are
public-safe intent fields when the WishlistItem is public.

Maximum purchase price is a Money value stored as an integer minor amount and
an explicit currency. Amount and currency are either both present or both
absent. This budget is private owner preference data and is never exposed by a
public WishlistItem.

Maximum trade distance is an optional preference expressed in kilometers. It
is not a location and does not reveal where the user lives. Precise geographic
data remains deferred to the geographic domain.

Priority expresses how urgently the owner wants the target. It is private
because exposing urgency could create negotiation leverage.

The following fields are owner-private and live separately from the public-safe
WishlistItem data:

- maximum purchase price
- maximum trade distance
- priority
- private notes

A public WishlistItem must not reveal any of these fields.

## Lifecycle

Initial WishlistItem states are:

- `active`: the user currently wants or tracks the target
- `fulfilled`: the user considers the acquisition goal satisfied
- `archived`: the user no longer actively tracks the target

Geek does not automatically mark an item fulfilled when ownership changes.
That future behavior requires explicit product rules.

## Duplicate intent

A user may have at most one active WishlistItem for the same exact target:

- one active Game-target item for the same Game
- one active Edition-target item for the same Edition

Historical fulfilled or archived items may coexist with a new active item for
the same target.

## Implemented tables

`wishlist_items` stores the target, public-safe acquisition intent, visibility,
lifecycle status, and purchase and trade interest flags.

`wishlist_private_details` stores owner-only acquisition preferences:

- maximum purchase amount and currency
- maximum local trade distance
- priority
- private notes

Priority is intentionally small and explicit:

- `1`: low
- `2`: normal
- `3`: high

Separating private details prevents a public WishlistItem from exposing its
owner's budget or private preferences.

## Access

Anonymous users may read only public WishlistItems. Authenticated users may
read public items and all their own items, and may create, update, or delete
only their own items.

Normal client updates cannot change a WishlistItem's owner or target. Owners
may update only visibility, status, purchase interest, and trade interest on
the public-safe WishlistItem row.

Wishlist private details are available only to the authenticated owner of the
parent WishlistItem and trusted Geek operations. They remain private even when
the parent WishlistItem is public. Owners may update their priority through the
private details record.

## Future matching semantics

Matching is deliberately not implemented yet.

Future matching should interpret targets as follows:

- A Game-target WishlistItem is potentially compatible with Copies whose
  Edition belongs to that Game.
- An Edition-target WishlistItem is compatible only with Copies of that exact
  Edition unless future explicit fallback preferences say otherwise.

Matching must eventually consider:

- Copy visibility
- Copy trade availability
- Wishlist visibility where required by the product flow
- purchase interest
- trade interest
- distance
- future Edition preferences
- future condition and completeness requirements
