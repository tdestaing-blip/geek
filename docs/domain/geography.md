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
discoverability rule. Future Search and Matching will expose an authorized
higher-level operation that decides which users and results are discoverable
before returning derived distance. Exact target coordinates remain
inaccessible.

## Deferred behavior

This foundation does not implement geocoding, routing, maps, matching, search,
live or background location, or TradeMeetingLocation.

Future search providers may consume coarse or derived projections, but exact
private location remains canonical in PostgreSQL and must not be copied into
client-facing search infrastructure.
