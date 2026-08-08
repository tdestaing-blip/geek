# ADR 0002 — Geographic privacy and discovery

## Status

Accepted

## Context

Geek's core differentiation requires finding compatible physical games and
collectors nearby. This requires geographic distance computation.

Precise location is sensitive account data and must not become public Profile
or marketplace data.

## Decision

Geek will use PostgreSQL PostGIS for canonical geographic distance operations.

Exact user discovery coordinates will be stored in a dedicated private table.
Normal client roles receive no direct SELECT privilege on exact coordinates.

Geographic discovery is exposed only through controlled server-side queries or
functions that return the data required by the product experience, such as
compatible result IDs and intentionally coarse distance.

`distance_from_me_to_user(target_user_id)` is an internal database primitive.
Normal clients cannot execute arbitrary user-to-user distance lookup, and the
primitive must not become a general-purpose client RPC. Future Search and
Matching will expose an authorized higher-level operation that first decides
which users or results are discoverable and only then returns derived distance.
Exact target coordinates remain inaccessible.

Reciprocal trade Matching implements this architecture by deriving an ephemeral
precision-6 geohash-cell centroid from each exact private location. All
authoritative Matching radius, bucket, and ordering decisions use those derived
locations. Clients cannot read or write them. Exact points may participate only
in a conservatively expanded indexed prefilter that cannot exclude a pair
admitted by the coarse predicate.

## Why not coordinates on profiles

`profiles` is publicly readable. Storing exact coordinates there would create
unnecessary exposure risk and mix public identity with sensitive discovery
infrastructure.

## Search provider independence

Future search systems may use coarse or derived geographic projections, but
exact private location remains canonical in PostgreSQL.

No external search provider may become the source of truth for user location.

## Privacy rule

Client applications must not need another user's exact coordinates to render
nearby discovery.

Low-level distance computation does not establish product-level authorization
to discover another user. Future search and matching workflows must add those
eligibility rules before exposing results.

Approximation is an intentional privacy boundary, not perfect anonymity. A
Matching result can disclose an intentionally discoverable user's approximate
cell, and cell-boundary changes can be observable, but exact locations within a
cell must remain indistinguishable to Matching.
