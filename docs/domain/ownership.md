# Ownership

## Copy

A Copy is one specific physical instance of one Edition owned by one user. A
Copy belongs to exactly one Edition and has exactly one current owner while
active.

Creating a Copy does not create a Listing, TradeOffer, or Auction.

Collection is the derived set of active Copies currently owned by a user. There
is no separate `collections` table for the user's default Collection. Future
custom shelves are organizational concepts and are not ownership.

## Public versus private Copy data

The core `copies` record contains only information that may safely be exposed
when a Copy is made public.

Private owner metadata lives separately in `copy_private_details`, including:

- acquisition date
- purchase price
- purchase currency
- private provenance notes
- private notes
- physical storage location

Making a Copy public must never expose these fields.

## Visibility

Copy visibility is independent from commercial availability. Initial
visibility states are:

- `private`
- `public`

A private Copy is visible only to its owner and trusted Geek server operations.
A public Copy may be visible in the owner's collection.

## Trade availability

Trade availability is independent from visibility. Initial values are:

- `not_open`
- `open_to_trade`

Trade availability does not create a TradeOffer. A Copy may be public but not
open to trade.

A private Copy cannot be meaningfully discoverable for trade, but the database
does not enforce visibility and trade availability as a destructive coupling.
Product behavior may guide users toward making tradeable Copies public.

## Edition components

EditionComponents define the expected physical contents of an Edition. They
are Geek-controlled Catalog data.

An EditionComponent has:

- a stable per-Edition component key
- a display name
- a semantic kind
- whether it is required for completeness
- display ordering

Geek does not assume that every Edition contains only a disc, box, and manual.

## Copy component state

For each EditionComponent, a Copy may have a CopyComponentState. Presence is
one of:

- `present`
- `missing`
- `unknown`

Condition is recorded only when physically meaningful and present. Geek uses
an ordinal 1–5 canonical condition grade. The numeric grade is the canonical
stored value; user-facing labels are presentation concerns and may evolve.

Suggested semantic interpretation for documentation only:

1. poor
2. fair
3. good
4. very good
5. excellent

`mint` and `new` are not condition grades. Sealed state is a different product
concept and is deliberately deferred.

Absence of a CopyComponentState means unassessed. It does not automatically
mean missing or unknown.

## Ownership deletion

Owners may remove a Copy they created while no transaction-domain constraints
exist. Deleting a Copy also removes its private details and component states so
referential integrity is preserved.

Future marketplace references may prevent destructive deletion or replace it
with explicit lifecycle behavior.
