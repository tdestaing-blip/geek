# Reciprocal Trade Matching

## Purpose

Matching answers: "Who around me owns something I want and wants something I
own?"

It is distinct from Search. Search starts from an explicit Catalog query;
Matching derives a personalized opportunity directly from canonical Wishlist,
Copy, Edition, and geographic state. It does not call Search or persist a match.

## Reciprocal eligibility

A reciprocal local trade match exists only when all of the following are true:

1. The caller has an active WishlistIntent with `trade_interest = true`.
2. A different user owns an `open_to_trade` Copy satisfying that want.
3. The other user has an active, public WishlistIntent with
   `trade_interest = true`.
4. The caller owns an `open_to_trade` Copy satisfying that public want.
5. Both users have private discovery locations.
6. Their server-derived Matching locations are within the caller's requested
   radius and the caller want's optional private maximum trade distance.

Both directions are mandatory. One-way compatibility is not a match. Purchase
interest alone does not establish trade intent.

A Game-level want matches any Copy whose Edition belongs to that Game. An
Edition-level want matches only a Copy of that exact Edition. These rules apply
symmetrically.

## Visibility and privacy

The caller's active trade wants participate whether their visibility is private
or public, because they are used only to compute that caller's result. A
counterpart's want participates only when it is public. Counterpart-private
WishlistIntents and all counterpart Wishlist private details are ignored.

Copy visibility is independent from trade availability. An `open_to_trade`
private Copy may participate on either side, while unrelated private Copies do
not. The safe Copy detail projection contains only:

- `copy_id`
- `game_id`
- `edition_id`

Matching never exposes Copy private details, component notes, purchase data,
provenance, or storage location.

## Geography

The caller selects one of the fixed maximum radii 2, 5, 10, 25, 50, 100, or 200
kilometers, defaulting to 25. Arbitrary integer radii are rejected rather than
rounded. Geographic filtering and presentation therefore use the same coarse
boundary system. A caller cannot binary-search a known counterpart's distance
at one-kilometer granularity by varying this parameter.

The caller must have a discovery location; otherwise the operation raises a
distinct missing-location error. Counterparts without locations are silently
ineligible. The server converts both users' exact private discovery locations
to the centroid of their precision-6 geohash cell before applying an
authoritative geographic rule. Clients cannot supply, write, or read this
derived Matching location. Eligibility is strictly below the selected boundary
for 2 through 100 kilometers and includes the final 200-kilometer boundary.

For Matching, an optional caller-private `max_trade_distance_km` is converted
to the greatest supported coarse boundary that does not exceed it:

- below 2: the want contributes no match
- 2–4: 2 km
- 5–9: 5 km
- 10–24: 10 km
- 25–49: 25 km
- 50–99: 50 km
- 100–199: 100 km
- 200 or greater: 200 km

The effective boundary is the smaller of that coarse private boundary and the
requested coarse radius. This conservative conversion means, for example, that
a private 7-kilometer maximum permits the 2-to-5-kilometer bucket, not an exact
7-kilometer threshold. Neighboring arbitrary private values therefore cannot
be used as a finer distance oracle.

A counterpart's private distance preference is deliberately neither read nor
used in this version. Bilateral private-distance-preference semantics require a
later product decision.

The operation computes distance only between the two derived Matching locations
and returns only one of:

- `under_2_km`
- `2_to_5_km`
- `5_to_10_km`
- `10_to_25_km`
- `25_to_50_km`
- `50_to_100_km`
- `100_to_200_km`

Bucket intervals are lower-bound inclusive and upper-bound exclusive, except
`under_2_km` and the final bucket, which includes 200 km. Exact user-to-user
distance is neither calculated for the result nor returned or used as a ranking
tie-breaker. The operation accepts no target user ID and does not expose the
low-level user-to-user distance primitive.

Precision-6 geohash cells are neighborhood scale. Across representative French
latitudes they are approximately 0.78–0.89 kilometers wide and 0.61 kilometers
high. Users may therefore be discoverable to an approximate cell, and crossing
a cell boundary may discretely change results. Two exact locations within the
same cell are indistinguishable to Matching. Radius and bucket behavior is
approximate: centroid distance can create bounded false positives or false
negatives near a selected boundary and is not a claim about exact physical
distance.

An exact-point `ST_DWithin` check remains only as a conservative indexed
prefilter. Its requested radius is expanded by 1.5 kilometers, exceeding twice
the maximum precision-6 center-to-corner displacement (about 0.683 kilometers
at the equator), so it cannot exclude a pair admitted by the authoritative
coarse-centroid predicate. Exact points do not determine any observable radius,
bucket, or ordering result.

Cell-level approximation intentionally trades geographic accuracy for privacy;
it does not provide perfect anonymity. Result presence reveals a reciprocally
eligible collector within a known coarse boundary and repeated calls from many
caller cells may reveal the target's approximate matching cell. Requiring
reciprocal public intent from the counterpart, accepting no target user ID, and
making movement within a cell observationally stable prevent the original
meter-level chosen-origin triangulation oracle. Future abuse controls such as
rate limits and location-write policies remain complementary defenses.

## Result and ranking

`get_reciprocal_trade_matches(max_distance_km, result_limit, result_offset)`
returns one row per counterpart with:

- counterpart user ID
- coarse distance bucket
- caller active trade-want count
- distinct caller wants satisfied by the counterpart
- distinct public counterpart wants satisfied by the caller
- relevant counterpart Copy identities
- relevant caller Copy identities

Counts cover all distinct qualifying wants. Each Copy detail array is
deduplicated, deterministically ordered, and capped at 20 entries, so a count
may exceed the displayed detail rows.

Results order by caller wants satisfied descending, counterpart wants satisfied
descending, coarse bucket nearest first, and counterpart UUID ascending. No
generic recommendation score, money, popularity, activity, exact distance,
Listing, or Auction state affects ranking.

## Lifecycle

A match is a derived discovery opportunity, not canonical state. It creates no
TradeOffer, reservation, commercial commitment, negotiation, meeting, or
ownership transfer. It may disappear immediately when a Wishlist, Copy,
ownership, trade availability, visibility, or discovery location changes.

TradeOffer, completion, value balancing, notifications, and
recommendations unrelated to explicit reciprocal Wishlist intent remain
deferred.
