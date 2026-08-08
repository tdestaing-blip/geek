# ADR 0004 — Reciprocal local trade matching

## Status

Accepted

## Context

Geek needs a first Matching capability that answers a narrow collection-first
trade question: which nearby collectors own something the caller explicitly
wants and publicly want something the caller owns?

Search cannot answer this question safely. Reciprocal matching combines
caller-private intent, explicit trade availability, counterpart-public intent,
and private geography. Persisting candidates would duplicate rapidly changing
canonical state and add synchronization and privacy risk.

## Decision

PostgreSQL derives reciprocal local trade matches at request time from canonical
WishlistItems, Copies, Editions, and private discovery locations. No match table
or external search system is introduced.

The authenticated caller is derived from `auth.uid()`. Caller active trade
wants participate regardless of visibility. Counterpart wants participate only
when active, public, and marked for trade interest. Both sides must contribute a
currently owned Copy explicitly marked `open_to_trade`; general Collection
visibility is not required.

Game targets resolve through the Edition-to-Game relationship. Edition targets
remain exact. Both reciprocal directions must exist.

## Geographic privacy boundary

The matching operation is the higher-level authorized geographic operation
anticipated by ADR 0002. It uses `ST_DWithin` against private geography, accepts
no target user ID, and exposes only fixed coarse distance buckets. Exact
coordinates and exact distance are not returned or used as a ranking
tie-breaker.

The caller may request only the same fixed boundaries used by presentation: 2,
5, 10, 25, 50, 100, or 200 kilometers. Arbitrary radius probes are rejected
rather than rounded. Eligibility is below the selected boundary except that the
final 200-kilometer boundary is inclusive. Aligning filtering and presentation
prevents binary-searching a known counterpart's distance at one-kilometer
granularity through result presence.

A caller-owned Wishlist private maximum is conservatively converted to the
greatest supported boundary that does not exceed it before Matching. Values
below 2 contribute no match; values from 2 through 199 map into the supported
2, 5, 10, 25, 50, or 100 boundaries; values of 200 or greater map to 200. The
effective limit is the smaller of the requested boundary and this converted
private boundary. The stored preference remains unchanged.

A counterpart's private maximum distance is deliberately not consulted because
bilateral private-distance semantics have not been established and the private
threshold could become inferable.

Coarse buckets are a risk reduction, not a claim of perfect anonymity. Results
still reveal that an intentionally discoverable reciprocal user is within a
known coarse boundary. Repeated caller-location changes retain some
triangulation risk even though neither the RPC parameter nor a private Wishlist
maximum provides finer-than-bucket probes. Future controls may include rate
limits and location-write policies; they are not part of this decision.

## Security boundary

The function uses `SECURITY DEFINER` because ordinary RLS correctly prevents a
caller from directly reading other users' private Copies and exact locations.
It has an empty search path, fully qualified references, no dynamic SQL, strict
parameter bounds, and a fixed safe return projection. Execution is revoked from
`PUBLIC` and `anon` and granted only to `authenticated`.

The safe projection includes counterpart identity, coarse distance, aggregate
compatibility counts, and only the relevant Copy, Game, and Edition IDs. It
excludes Wishlist private details, Copy private details, exact geography,
Listings, Auctions, reserves, and Bids.

## Consequences

Results always reflect current canonical state and may disappear when inputs
change. Matching creates no TradeOffer, reservation, commercial commitment, or
ownership transfer.

The implementation is intentionally not a recommendation engine. It does not
score value, trust, activity, popularity, Listings, Auctions, or unrelated
interests. Future TradeOffer workflows and bilateral preferences remain
separate decisions.
