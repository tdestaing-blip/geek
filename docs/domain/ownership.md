# Ownership

## Copy

A Copy is one specific physical game object owned by one user. It always
identifies its Game and has exactly one current owner while active. Its exact
Edition may be unknown.

A Quick Copy is a real Copy with a known Game and an unknown Edition. It is not
a placeholder or a separate object type. Quick Copy enrichment is progressive:
the owner may attach the matching Edition later without replacing the Copy or
changing its identity. The Edition may be corrected within the same Game when
the Copy has no Edition-specific component assessments and no commercial
commitment. Cross-Game correction is always rejected by database integrity.

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

## Availability

Availability is one finite, product-facing intent independent from visibility:

- `private`
- `open_to_trade`
- `for_sale`
- `in_auction`

`private` means no transaction intent. `open_to_trade` is explicit trade
discoverability intent and does not create a TradeOffer or commitment.
`for_sale` and `in_auction` are driven by trusted Listing and Auction lifecycle
flows and their commercial commitments; clients cannot assert them without the
corresponding relationship.

On Copy creation, only `private` and `open_to_trade` are valid. `availability`
is canonical: the database derives the legacy compatibility value as
`not_open` or `open_to_trade` respectively, ignoring any contradictory legacy
input. A new Copy cannot start `for_sale` or `in_auction` because its required
Listing or Auction commitment cannot exist before the Copy does.

`open_to_trade` availability is explicit discoverability intent independent from general
Collection visibility. A private Copy marked `open_to_trade` may appear through
the minimum safe Trade discovery projection, while the owner's other private
Copies and all private Copy metadata remain inaccessible.

Reciprocal local trade matching uses `open_to_trade` as the Copy-level
discoverability signal on both sides. General Copy visibility is irrelevant to
trade eligibility: a private Copy may satisfy a reciprocal want, but the match
projection exposes only its Copy, Game, and Edition identifiers. Unrelated
private Copies remain undiscoverable. A public Copy is not considered tradeable
unless it is explicitly `open_to_trade`.

A match is derived discovery only. It does not create a TradeOffer, reservation,
commercial commitment, or ownership change.

## Ownership transfer

Ownership is server-authoritative and clients never write it directly. A Copy's
owner changes only through a controlled Geek operation.

Today the only implemented transfer is TradeCompletion: when both participants
of an accepted TradeOffer confirm that the physical exchange happened, the same
transaction releases the TradeOffer's commercial commitments and moves every
included Copy to its new owner.

A Copy cannot change owner while it holds a commercial commitment, so an active
or reserved Listing, a scheduled or won Auction, or an accepted TradeOffer all
block transfer. The transferring operation must release its own commitment and
transfer ownership inside one transaction while holding the Copy row locks, so
no other mechanism can claim the Copy in between.

### Object state versus current-owner state

Some Copy state describes the physical object and must follow it across owners.
The rest describes the current owner's private context or consent and must not.

Object state, preserved on transfer:

- Copy identity, its Game, and its Edition when known
- component presence, condition grade, and condition notes, which describe the
  physical object rather than its owner

Current-owner state, not inherited by the new owner:

- `copy_private_details`: acquisition date, purchase amount and currency,
  provenance notes, private notes, and storage location
- `visibility`, reset to `private`
- `availability`, reset to `private`

### Private details belong to an owner, not to a Copy

Private details are owner-specific data that happens to be about a Copy. A
purchase price, an acquisition date, and a storage location describe one
person's relationship with the object, not the object itself.

`copy_private_details` is therefore keyed by `(copy_id, owner_id)` and its
row-level security scopes each row to `owner_id = auth.uid()`. Access follows
the author of the record rather than whoever currently holds the Copy. A Copy
may accumulate one private record per person who has owned it, and no owner can
read another's.

Ownership transfer consequently does nothing to these rows. The previous owner
keeps their own record and can still read, edit, or erase it. The new owner
starts with none and may create their own. Because the record never moves, "the
previous owner's private data was not handed over" is a property of the schema
rather than something each transfer path has to remember to do.

Creating a record still requires currently owning the Copy, so a former owner
cannot attach new data to a Copy that has moved on. Neither `copy_id` nor
`owner_id` can be rewritten afterwards.

Visibility and availability are consent, not object properties. One
owner's decision to expose ownership of a Copy publicly, or to open it to trade,
says nothing about what the next owner wants. A transferred Copy therefore
arrives private and closed to trade, and the new owner opts in again explicitly
through the normal Ownership flows. Until they do, the Copy appears in neither
collector discovery nor trade discovery nor reciprocal Matching.

The consent resets happen inside the same transaction as the ownership change,
while the Copy row locks are held, so there is no committed moment in which the
new owner holds a Copy that still carries the previous owner's consent.

Geek does not yet keep a general ownership-history ledger. The immutable
TradeOffer, its Copy membership, and the TradeCompletion explain a trade-driven
transition; a broader provenance domain may come later.

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
