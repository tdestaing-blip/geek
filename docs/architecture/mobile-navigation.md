# Mobile navigation architecture

Geek's authenticated mobile shell has four persistent roots, in this order:

1. Collection
2. Découvrir (`Discover` internally)
3. Activité (`Activity` internally)
4. Moi (`Me` internally)

Collection is the initial root.

## Product worlds

- Discover answers what exists outside the caller's Collection. V1 is one unified, search-led
  surface without secondary tabs or filters. Market and network opportunities remain content
  dimensions around canonical Games, not persistent roots.
- Collection owns the caller's Albums, physical Copies, and Wishlist.
- Activity is the transaction control center. Its `En cours` and `Historique` views consume one
  caller-scoped canonical projection over Auctions, Auction Orders, and seller Listings.
- Me is the current user's Profile and identity root. Another collector remains the distinct
  `PublicProfile { userId }` fullscreen-modal destination.

## Navigation grammar

- A tab press changes root world. Root tabs are leaf screens and do not own object stacks.
- Canonical Game, Edition, Copy, Album, Public Profile, Listing, and Auction depth lives in the
  outer application stack. Contextual destinations therefore hide the tab bar.
- `Market { gameId, editionId }` remains the contextual marketplace for one canonical Edition. It
  is not replaced by Discover's global discovery surface.
- Action flows retain their existing native sheet or modal presentation. `PublicCopy` and
  `PublicProfile` remain fullscreen modals.

The application retains one `NavigationContainer`, below the existing `AuthProvider`. Auth and
deep-link ownership are independent from navigation presentation.

## Add Game boundary

Add Game is opened from the Collection header and is not a persistent tab-bar action. Its search,
platform, and region steps live in a bounded nested action navigator. Selecting a canonical Album
or Edition replaces the outer Add Game route with `AlbumDetail` or contextual `Market`. Back from
that destination therefore returns to the mounted Collection root without traversing Add Game's
internal history.

## Truthful Discover V1

- The prominent search is inactive by default. Activating it replaces the feed inline with the same
  canonical search home, live results, and platform categories used by Collection's Add Game flow.
- Cancel and root-tab blur clear the local Discover search state and dismiss the keyboard.
- Platform and Game/Platform selection enter the shared bounded catalog navigator through the
  normal-push `DiscoverCatalog` route. Exact Edition and Album selection replace that temporary
  route with canonical `Market` or `AlbumDetail`, so Back returns to the normal Discover feed.
- Published Albums provide an editorial discovery row when available.
- Calculated reciprocal trade matches provide compatible collectors using public-safe identity.
- Sections without truthful data stay hidden. Discover does not synthesize a global marketplace
  feed from Game-scoped APIs.

The existing My Auctions overlay remains an independent urgent/recent shortcut across root screens;
it is not the canonical Activity model.
