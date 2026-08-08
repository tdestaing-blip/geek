# Search and Discovery

## Boundary

Search starts from explicit user intent such as "Wind Waker", "Zelda
GameCube", "Metroid Prime", or a specific Edition. It returns canonical read
projections for a requested target.

Search is not Matching. Matching will later combine Collection, Wishlist,
reciprocal intent, geography, commercial availability, and other ranking
signals. This foundation does not inspect Wishlist state, calculate distance,
or rank opportunities for a particular user.

The same Game can lead to distinct channels:

- Catalog
- Buy
- Auctions
- Trade
- Collectors

The channels are not interchangeable and must remain separately identifiable
in product behavior and APIs.

## Catalog

Catalog search discovers Games and Editions and always returns Geek canonical
IDs. External provider mappings are neither result identity nor part of the
search result.

Game search uses `games.canonical_title`. Edition presentation is derived from
the Edition's existing canonical fields together with its Game title and
Platform name. Search does not add a duplicate canonical title to Edition.

Ranking is deterministic and favors exact matches, then prefixes, then
substring and trigram similarity. It does not use popularity, personalization,
or recommendation signals.

Catalog queries are normalized by trimming outer whitespace, collapsing
repeated whitespace, and lowercasing before search. A normalized query is
limited to 120 characters and eight distinct tokens. Repeated tokens are
deduplicated before candidate expansion. Tokens shorter than three characters
use only indexed exact and prefix matching; substring and trigram expansion
require at least three characters. This keeps short identifiers such as `F1`
useful without allowing one- or two-character fuzzy fan-out.

Candidate bounding follows canonical entity boundaries. Each token produces at
most 200 strongest textual matches independently for Games, Platforms, and
Edition names. Exact matches precede prefixes, substrings, and trigram matches,
with canonical UUIDs providing deterministic tie-breaking.

Edition eligibility is then derived through `Edition.game_id` and
`Edition.platform_id`. Every distinct token must match at least one of the
Edition's Game, Platform, or Edition-name dimensions; different tokens may be
satisfied by different dimensions. Membership of an exactly matched Game or
Platform is never truncated before applying this all-token semantic test. Each
canonical entity seed retains at most 200 Editions after that test, and their
union receives a final deterministic 200-Edition cap before result ranking.
This bounds relationship fan-out and final ranking work without sacrificing
normal cross-field recall such as `Zelda GameCube`.

## Buy

Buy discovery contains only active fixed-price Listings. A Listing is explicit
commercial intent, so its safe marketplace projection may include the Copy ID
even when the Copy's general Collection visibility is private.

Buy results contain Listing and canonical Catalog identity, seller identity,
asking Money, fulfillment capabilities, and publication time. They never
contain `copy_private_details`, purchase information, provenance, storage
location, private notes, or seller coordinates.

Shipping and local pickup are independent capabilities. Shipping discovery is
not restricted by proximity. `shipping_available` does not yet describe
destination territory, country coverage, an address, or a shipping zone.

## Auctions

Auction discovery contains scheduled Auctions that are still capable of
receiving Bids at one server reference time. Presentation phase is derived as:

- `upcoming`: the reference time is before `starts_at`
- `live`: `starts_at` is at or before the reference time and the reference time
  is before `ends_at`

A scheduled Auction at or beyond `ends_at` is awaiting finalization and is not
active Auction supply. Discovery time is a read/presentation decision; it does
not replace the post-lock `clock_timestamp()` deadline decision used by
`place_auction_bid`.

Auction discovery exposes only public-safe Auction fields. It never exposes a
reserve amount, `leading_bid_id`, `winning_bid_id`, bidder identity, or raw Bid
row. Shipping Auctions are not restricted by proximity.

## Trade

Trade discovery contains Copies explicitly marked `open_to_trade`. This flag is
discoverability intent independent from Collection visibility. A private Copy
may therefore appear, but only through the minimum safe projection:

- Copy canonical ID
- owner canonical Profile ID
- Game canonical ID
- Edition canonical ID

Trade discovery never exposes the owner's other private Collection items,
component state or notes, private Copy details, coordinates, or distance. It
requires authentication and does not create or evaluate a TradeOffer.

## Collectors

Collector discovery represents Collection visibility, not commercial intent.
It contains only public Copies and returns the same minimal canonical identity
projection used for safe discovery.

A private Copy must not appear in Collector discovery merely because it is
open to trade. Trade and Collector discovery remain separate.

## Target semantics

Every discovery function starts from a required Game ID and accepts an optional
Edition ID. With no Edition target, results include all Editions belonging to
the Game. With an Edition target, results are restricted to that exact Edition.
An Edition that does not belong to the supplied Game is rejected rather than
silently producing misleading results.

Results use bounded offset pagination and deterministic ordering. The offset is
validated but not given an arbitrary ceiling; large-offset usage should be
observed and may move to cursor pagination when scale justifies it. Search does
not calculate proximity, currency conversion, cheapest cross-currency price,
estimated market value, or shipping territory.

## Discovery summary

The summary uses the same channel definitions as the individual discovery
functions. It returns Buy totals and fulfillment counts, upcoming and live
Auction totals and fulfillment counts, Trade count, and Collector count.

The summary requires authentication because its Trade count is derived from
the authenticated-only Trade discovery population. It does not expose the
underlying private Copy rows.

## Database security

`search_catalog` and Collector discovery use invoker security because existing
Catalog access and public-Copy RLS already provide the required rows.

Buy and Auction discovery use `SECURITY DEFINER` only to project an explicitly
commercial Copy across Collection visibility. Trade discovery uses it only to
project Copies explicitly marked `open_to_trade`. The summary uses it to count
those same safe populations. These functions have an empty `search_path`, use
fully qualified relations and functions, contain no dynamic SQL, expose only
fixed return columns, validate target relationships and pagination bounds, and
have explicit execution ACLs.

No Search or Discovery function reads exact discovery locations,
`copy_private_details`, `wishlist_private_details`, Auction private details, or
raw Bid rows.

## Canonical and external search state

PostgreSQL remains canonical. The PostgreSQL functions derive results directly
from Games, Editions, Copies, Listings, and Auctions; there is no mutable
search-owned source-of-truth table.

A future external search engine may index disposable projections containing
Geek canonical IDs. Privacy and authorization boundaries must be applied
before projection, and exact coordinates, private Copy or Wishlist data,
Auction reserves, and bidder identity must never enter a public index.

Search synchronization, external engine selection, Matching, geographic
ranking, recommendations, and UI are deferred.
