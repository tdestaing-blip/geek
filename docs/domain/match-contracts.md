# Match contracts

Match is a calculated, current-state projection over canonical Ownership,
WishlistIntent, Copy availability, Listing, and approximate Geography. It is
explainable but non-authoritative: Geek persists no Match row, lifecycle,
history, score, or recommendation state.

## Canonical contracts

- `WishlistMatch`: another collector's actionable `open_to_trade` Copy satisfies
  one of the caller's active WishlistIntents.
- `ListingMatch`: an actual active Listing and its Listing commitment satisfy
  one of the caller's active WishlistIntents.
- `ReciprocalTradeMatch`: the caller wants an eligible Copy owned by another
  collector and that collector publicly wants an eligible caller-owned Copy.
- `NearbyMatchSignal`: a coarse geographic bucket attached to a valid
  collector-based WishlistMatch or ReciprocalTradeMatch. Geography alone never
  creates a Match.

Every result carries IDs for the intent and Copy (and Listing where applicable),
a public-safe collector summary, and structured eligibility facts. There is no
global score, percentage, free-form explanation, Follow boost, or ranking model.

## Shared WishlistIntent-to-Copy eligibility

All projections use one internal database function for these rules:

- Copy and WishlistIntent Game identities must match.
- An exact intent requires the exact Edition.
- A broad intent accepts an Edition of its Game, or a Quick Copy when no
  Edition-derived evidence is required.
- Broad preferred region requires a candidate Edition with the same region.
- `complete_required` requires an authoritative Edition component model and
  every `required_for_complete` component assessed present.
- `complete_preferred` produces an explanation signal but never excludes.
- A minimum condition grade is a universal per-component lower bound, never an
  overall score or average. Every catalogued component must be assessed; an
  `unknown` state cannot prove the constraint. Present components must have a
  grade at or above the threshold. Missing components remain a completeness
  concern and receive no invented grade.

A Quick Copy can satisfy only an unconstrained broad Game intent: no exact
Edition, preferred region, strict completeness, or component-condition
requirement can be proven without an Edition/component model.

## Availability matrix

| Copy availability | WishlistMatch               | ListingMatch                            | ReciprocalTradeMatch                       |
| ----------------- | --------------------------- | --------------------------------------- | ------------------------------------------ |
| `private`         | no                          | no                                      | no                                         |
| `open_to_trade`   | yes, without any commitment | no                                      | yes, on both sides and without commitments |
| `for_sale`        | no                          | only with its active Listing commitment | no                                         |
| `in_auction`      | no                          | no                                      | no                                         |

ListingMatch additionally verifies that the seller still owns the Copy and the
active Listing is the source of the Copy's commercial commitment. Listing price
is referenced from Listing; Match stores no price. Private budgets are neither
returned nor exposed. Maximum purchase budget does not currently filter
ListingMatch: multi-currency comparison and whether budget is a hard exclusion
remain an explicit future product decision, so this slice does not silently
assume conversion or ranking semantics.

## Reciprocal and nearby semantics

Each reciprocal result makes both directions explicit: my intent, their Copy,
their public intent, and my Copy. Both directions independently use the shared
eligibility rules and require `trade_interest = true`. Counterpart intent must
be public; caller intent may remain private because it is used only for the
caller's own result. Any Copy commitment removes trade eligibility.

Nearby eligibility may decorate a one-way collector WishlistMatch when both
locations exist and their derived Matching locations fall within 200 km. If the
WishlistIntent has a private maximum trade distance, the candidate is eligible
only when both locations exist and the derived distance satisfies its
conservatively rounded boundary. A missing private maximum does not make
geography a prerequisite; the Match remains valid with a null nearby signal.

Reciprocal eligibility applies the applicable private maximum distance from
both intents. Either side may reject the opportunity without revealing which
private value did so.

Nearby evaluation reuses the existing server-derived precision-6 Matching
locations, supported radii, caller-private distance limit, and coarse distance
buckets. Exact coordinates, numeric distance, and either collector's configured
radius are never returned. Follow is deliberately absent from eligibility and
output.

## Privacy and current state

Security-definer RPCs derive the caller from `auth.uid()`, use an empty search
path, accept no requester ID, and return fixed safe columns. They expose no
Wishlist private preferences, Copy private details, component notes, exact
location, auth metadata, or hidden non-actionable inventory. Component state is
consulted only to produce eligibility booleans.

Because every Match is calculated, closing a Listing, changing availability,
adding a commitment, transferring a Copy, or archiving/refining/removing an
intent changes results immediately without cleanup jobs.

## Legacy compatibility

`get_my_reciprocal_trade_match_pairs` is the canonical reciprocal projection.
The unused older `get_reciprocal_trade_matches` aggregate RPC is retired rather
than retained with divergent bounded aggregation. Step 17B `wishlist_items`
compatibility views are removed; all Match evaluation now reads canonical
`wishlist_intents` directly. There is one eligibility implementation, not two
independently authoritative algorithms.

Game/Album network-signal aggregates are deferred to Album query composition;
this slice does not add stored or globally discoverable ownership counts.
