# Geography

Geek distinguishes private location infrastructure from the geographic values
that may eventually appear in discovery experiences.

## PrivateUserLocation

PrivateUserLocation represents a user-supplied location used for discovery and
distance calculations.

It may eventually originate from:

- device location
- postal-code geocoding
- a manually selected map position
- city selection

The origin mechanism is not implemented in this foundation.

Exact coordinates are sensitive account data. They must never be exposed
through:

- public profiles
- public table reads
- public API payloads
- analytics
- logs
- search indexes intended for clients

PrivateUserLocation belongs to account and discovery infrastructure, not to
public Profile identity.

## Discovery presentation

Public product surfaces may eventually expose derived information such as:

- approximate distance
- city or broad area
- "near you"

These values are presentation projections, not exact stored coordinates.
Clients must not require another user's precise coordinates merely to render
nearby results.

## TradeMeetingLocation

TradeMeetingLocation is deliberately not implemented here. It will represent a
location explicitly proposed and agreed upon for one Trade.

It must remain semantically separate from PrivateUserLocation. Geek must never
reuse a user's private discovery location as a meeting location without
explicit user action.

## Radius

A search or trade radius is a preference, not a location. Wishlist maximum
trade distance is one existing example.

## Location freshness

A private discovery location may eventually require source provenance, user
confirmation, and a last-updated timestamp. This foundation records source,
optional confirmation, and update time, but does not implement automatic
freshness behavior.

## Storage and access

`user_discovery_locations` stores one private WGS84 geographic point per user.
The table is protected by row-level security and normal client roles receive no
direct SELECT privilege.

Authenticated users may create, update, or delete only their own location.
They cannot change the location's owner.

`get_my_discovery_location()` is the only coordinate-read mechanism introduced
by this foundation. It accepts no user ID and returns at most the authenticated
caller's own longitude, latitude, source, accuracy, confirmation time, and
update time.

`distance_from_me_to_user(target_user_id)` returns only derived distance in
meters when both users have stored locations. It never returns exact
coordinates. It is an internal database primitive and normal clients cannot
execute it for arbitrary users. It must not become a general-purpose client
RPC.

The distance function is a low-level geographic primitive, not a product-level
discoverability rule. Reciprocal trade matching is the first authorized
higher-level geographic operation. It discovers only users who satisfy
bidirectional canonical Wishlist and Copy eligibility, accepts no target user
ID, and returns fixed coarse distance buckets. Exact target coordinates remain
inaccessible.

Matching follows an explicit privacy pipeline:

```text
Exact private discovery location
  -> server-derived privacy-safe Matching location
  -> coarse distance and radius semantics
```

The Matching location is the centroid of a precision-6 geohash cell derived
inside the trusted database operation for both caller and counterpart. It is
not persistent state, and clients cannot write or read it. Matching never uses
exact user-to-user distance as its authoritative geographic signal.

The caller chooses one of the fixed 2, 5, 10, 25, 50, 100, or 200 kilometer
boundaries. An exact-location `ST_DWithin` check uses the existing GiST index
only as a conservative broad prefilter, expanded by 1.5 kilometers so it cannot
remove any pair admitted by the coarse-centroid rule. Arbitrary public radius
probes are rejected. A caller-owned Wishlist maximum trade distance is
conservatively converted to the same coarse boundaries before it may narrow
that caller's want. A counterpart's private maximum trade distance is neither
read nor exposed in the first version.

Users may be discoverable to an approximate neighborhood-scale cell. Moving
within that cell does not alter the Matching location; crossing a cell boundary
may produce a discrete result change. This intentionally trades geographic
accuracy for privacy and can create bounded false positives or false negatives
near radius boundaries. It does not provide perfect anonymity: repeated calls
from many caller cells may reveal a counterpart's approximate cell. The design
prevents exact locations within the same cell from being distinguished and
removes meter-level chosen-origin triangulation from Matching. Rate limits and
location-write policies remain useful future abuse controls.

## Deferred behavior

This foundation does not implement geocoding, routing, maps, live or background
location, or TradeMeetingLocation. Reciprocal trade matching uses discovery
locations only for eligibility and coarse presentation; a discovery location
must never become a TradeMeetingLocation without explicit user action.

Future search providers may consume coarse or derived projections, but exact
private location remains canonical in PostgreSQL and must not be copied into
client-facing search infrastructure.
