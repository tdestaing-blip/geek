# Albums

An Album is a finite, curated editorial collection target. It is not an
exhaustive platform catalog, user folder, persisted collection, marketplace
category, or Match entity. Geek's Panini-style Album experience derives each
slot from current canonical state.

## Editorial definition

Each Album has one target granularity: `game` or `edition`.

- A Game Album entry identifies one Game and has no Edition.
- An Edition Album entry identifies an exact Edition and its Game. The database
  enforces that the Edition belongs to that Game.

Positions are positive and unique within an Album. Identical targets cannot be
repeated. An Edition Album may contain multiple exact Editions of one Game.
Published Albums cannot be empty.

Albums and entries are trusted catalog data. Anonymous and authenticated roles
may read only published definitions and receive no write privileges. Drafts are
visible only to trusted catalog operations; normal application code uses no
service role. This slice adds no Admin UI and no user-created Albums.

The first intended editorial Album is **Pokémon Game Boy PAL FR**. The repository
does not contain a verified, deterministic production set of those Editions, so
this migration deliberately seeds no Album or uncertain catalog IDs. Curation
can begin after the relevant PAL-FR catalog data has been imported and verified.

## Current collector state

Album state is calculated for the authenticated caller. There is no
`user_albums`, progress, completion, or slot-state table.

For a Game slot, `owned` is true when the caller owns at least one Copy with the
same `game_id`; Quick Copies count. For an Edition slot, `owned` requires an
exact `edition_id`; a Quick Copy cannot prove it. Visibility and availability do
not change the owner's ownership, and multiple matching Copies fill a slot only
once. `missing` is always `!owned`.

`wanted` is independent and may overlap `owned`. Only active canonical
WishlistIntents count:

- any active broad or exact intent for the Game marks a Game slot wanted;
- an exact intent marks only its exact Edition slot;
- a broad intent marks an Edition slot when its optional region preference is
  compatible with that Edition.

Completeness and component-condition preferences constrain acceptable physical
Copies, not whether the Game or Edition identity is wanted, and therefore do not
alter Album wanted state. Private WishlistIntent preferences are never returned.

Progress contains exact integer `totalSlots`, `ownedSlots`, `missingSlots`, and
`wantedSlots`. Missing is total minus owned; wanted is independent. Completion
ratio is derived in the domain/data boundary and is never persisted.

## Network signal

Each detail slot carries a calculated, identity-based aggregate about other
collectors. It is not a second Match algorithm and does not apply condition,
completeness, budget, distance, or reciprocal-trade rules.

- `collectorCount` counts distinct other collectors with at least one matching
  Copy that is public through Collection visibility, safely open to trade, or
  backed by a valid active Listing. A private, non-actionable Copy is excluded.
- `tradeCollectorCount` counts distinct other collectors with a matching
  `open_to_trade` Copy and no commercial commitment.
- `activeListingCount` counts matching active Listings only when the seller
  still owns the `for_sale` Copy and the exact Listing commitment exists.

Game slots match all Copies with that Game identity, including Quick Copies.
Edition slots require the exact Edition. The caller's own Copies and Listings
are excluded. Multiple Copies never inflate collector counts, and no Auction
signal is included.

Signals are computed from current Copies, Listings, commitments, and visibility.
They expose no identities, hidden inventory details, Copy-private fields,
Wishlist private preferences, geography, or authentication metadata. No counter
is stored or synchronized.

## Read contracts

- `getAlbums` returns published Album summaries and current-caller progress.
- `getAlbumDetail` returns metadata, bounded ordered slots, catalog target
  summaries, caller state, and aggregate network signals.

Both derive caller identity from authentication and accept no user ID. Album
entries retain canonical Game/Edition IDs; existing batched CatalogMedia APIs
remain the single cover/media source, so Album storage duplicates no media.

Adding or enriching a Quick Copy, correcting an Edition, transferring ownership,
changing visibility or availability, opening or closing a Listing, changing a
commitment, or adding/refining/archiving/removing a WishlistIntent changes the
next Album read immediately. There is no projection cache or cleanup job.
