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

Geographic discovery will later be exposed through controlled server-side
queries or functions that return only the data required by the product
experience, such as compatible result IDs and derived distance.

`distance_from_me_to_user(target_user_id)` is an internal database primitive.
Normal clients cannot execute arbitrary user-to-user distance lookup, and the
primitive must not become a general-purpose client RPC. Future Search and
Matching will expose an authorized higher-level operation that first decides
which users or results are discoverable and only then returns derived distance.
Exact target coordinates remain inaccessible.

The initial schema prepares this architecture without implementing matching.

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
