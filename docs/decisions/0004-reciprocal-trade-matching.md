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
WishlistIntents, Copies, Editions, and private discovery locations. No match table
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
anticipated by ADR 0002. It accepts no target user ID and exposes only fixed
coarse distance buckets. Exact coordinates and exact user-to-user distance are
not returned, used for authoritative eligibility, or used as a ranking
tie-breaker.

For every request, PostgreSQL converts the caller's and each candidate's exact
private discovery location to the centroid of its precision-6 geohash cell.
This server-derived Matching location is ephemeral: it is neither persisted nor
client-writable. Precision 6 produces neighborhood-scale cells approximately
0.78–0.89 kilometers wide and 0.61 kilometers high at representative French
latitudes.

All authoritative radius, bucket, and ordering decisions use distance between
the two Matching locations. The existing exact-location GiST index remains
useful through an `ST_DWithin` candidate prefilter expanded by 1.5 kilometers.
That margin exceeds twice the maximum precision-6 center-to-corner displacement
(about 0.683 kilometers at the equator), so the prefilter is a superset of the
coarse predicate rather than a correctness boundary.

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

Coarse locations and buckets are a risk reduction, not a claim of perfect
anonymity. Results still reveal that an intentionally discoverable reciprocal
user is within a known coarse boundary, and observations from many caller cells
may reveal the target's approximate Matching cell. Exact locations within one
cell are indistinguishable to Matching, so meter-level caller movement cannot
recreate the chosen-origin triangulation oracle. Crossing a cell boundary can
discretely change results. Future controls may include rate limits and
location-write policies; they remain complementary and are not part of this
decision.

Centroid-based geography intentionally trades accuracy for privacy. Near a
selected radius, a user's exact physical separation and Matching separation can
fall on opposite sides of the boundary. This bounded false-positive or
false-negative behavior is accepted for local discovery; returned buckets are
approximate and make no exact-distance claim.

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
