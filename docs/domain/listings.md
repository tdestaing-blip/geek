# Listings

## Listing

A Listing represents explicit intent by the current owner of one Copy to sell
that Copy for a fixed asking price.

A Listing is not the Copy. A Copy may exist without a Listing, and removing or
closing a Listing does not remove the Copy.

A Listing references exactly one Copy. The seller must be the current owner of
that Copy when the Listing is created. Creating a Listing does not transfer
ownership; the Copy owner remains authoritative.

Ownership must be true when the Listing identity is established. The Listing's
`seller_id` preserves the seller at that time. After a legitimate future
ownership transfer, the historical seller does not need to equal the Copy's
new current owner.

## Asking price

A Listing asking price is a Money value containing:

- an integer amount in minor units
- an explicit currency

The price belongs to the Listing, not the Copy. Estimated market value and the
owner's private purchase price remain separate concepts.

One Listing uses one currency. Foreign-exchange conversion is not implemented.

## Fulfillment availability

Geek supports two independent direct-sale fulfillment capabilities:

- local pickup
- shipping

A Listing may support local pickup only, shipping only, or both. An active
Listing must enable at least one fulfillment capability. A draft Listing may
have neither enabled while the seller prepares it.

Local pickup does not mean that a Listing should only be discoverable locally.
Shipping-enabled Listings may later be discoverable nationally or
internationally according to explicit product and Search rules.

Buyer geography does not belong on Listing.

## Local sale geography

Seller coordinates must never be copied into Listing. Future geographic sale
discovery derives seller locality through Geek's controlled geographic
infrastructure.

Exact private discovery locations remain inaccessible to marketplace clients.

## Lifecycle

Initial Listing statuses are:

- `draft`: not publicly available
- `active`: available for purchase
- `reserved`: temporarily committed to an in-progress transaction
- `sold`: consumed by a successful commercial transaction
- `paused`: temporarily unavailable but retained
- `expired`: availability ended automatically or by future duration rules
- `withdrawn`: intentionally removed from availability by the seller

A sold Listing does not itself prove Order fulfillment. The future Order
lifecycle will own payment and fulfillment state.

Normal sellers may manage these statuses directly:

- `draft`
- `active`
- `paused`
- `withdrawn`

These statuses are system-managed:

- `reserved`
- `sold`
- `expired`

Normal clients cannot set system-managed statuses or modify other commercial
fields on a Listing that is already in a system-managed status. Future trusted
transaction and expiration workflows will manage those states. This foundation
does not implement a full state machine.

`published_at` is historical publication metadata when present. Draft Listings
do not require it, and this foundation does not automatically invent timestamps
through a state-machine trigger.

## Listing history

Listings that have participated in commercial history must not be destructively
deleted. Direct client DELETE is not supported in this foundation. Sellers
manage availability through explicit lifecycle status changes.

## Copy relationship

A Copy may have at most one Listing in `active` or `reserved` state at a time.
Historical, draft, and closed Listings may coexist with a later active Listing.

The database validates that the Listing seller owns its Copy when the Listing
identity is created or changed. It does not require that relationship to remain
true forever, because a completed future transaction may transfer Copy
ownership while the historical Listing retains its original seller. Copy
ownership is not inferred from Listing, and creating a Listing never transfers
ownership.

The database does not require `Copy.visibility = public`. Future marketplace
queries need an explicit projection that makes the public-safe information for
an actively listed Copy readable without changing collection privacy globally.
That projection must never expose `copy_private_details`.

## Access

Anonymous users may read only active Listings. Authenticated users may read
active Listings and all Listings they own.

Authenticated sellers may create Listings only for their own Copies and may
update current commercial fields only while both the current and requested
status are seller-manageable. Listing and Copy identity remain immutable
through normal client updates. Normal clients cannot delete Listings.

## Future Search semantics

Search is broader than geographic matching and is deliberately not implemented
here.

Future Search for a Game or Edition must keep these result types distinct:

- Buy: active Listings
- Trade: Copies whose trade availability and future matching rules allow it
- Auctions: future Auction records

Shipping-enabled Listings may be searched beyond local proximity. Local-pickup
Listings may be ranked or filtered through controlled seller geography. A
search for one Game may eventually combine national shipping Listings, local
Listings, local trade-compatible Copies, Auctions, and collectors or Copies,
but those results remain semantically distinct.

## Deferred behavior

This foundation does not implement checkout, Orders, payments, shipping labels,
addresses, offers, Auctions, Trade, Search, Matching, messaging, or Listing UI.
