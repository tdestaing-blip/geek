# Activity V1

Activity is a caller-relative read projection over canonical transactional truth. It does not own
an event table, notification state, read state, or a parallel transaction lifecycle.

## V1 sources

`get_my_activity` normalizes three existing domains:

- bidder and seller Auctions;
- buyer and seller Auction Orders in `awaiting_payment`;
- seller Listings in the deliberately supported states below.

The database derives the caller internally from `auth.uid()`. Mobile cannot request another
user's Activity. The security-definer function has an empty search path, exposes a fixed safe
shape, and remains independent from service-role application access.

## Segments and attention

`current` contains active or unresolved work. Only an outbid bidder and an Auction Order buyer
awaiting payment require attention in V1. Seller rows, leading Auctions, resolving Auctions, and
active Listings remain passive.

`history` retains the canonical Auction result even when a related `awaiting_payment` Order is
current. The Order is the current obligation; the Auction row is the historical result. This
avoids two active rows describing the same obligation without erasing Auction history.

Current rows order attention first, then canonical occurrence time descending, then stable
Activity identity. History orders occurrence time descending, then stable Activity identity. The
RPC applies this ordering before bounded keyset pagination. The default page is 20 and the maximum
is 50.

## Listing status audit

| Listing status | Activity V1 | Label              | Reason                                                                                      |
| -------------- | ----------- | ------------------ | ------------------------------------------------------------------------------------------- |
| `draft`        | omitted     | —                  | Not published and not transactional Activity.                                               |
| `active`       | `current`   | `Vente · En ligne` | Canonically available for purchase.                                                         |
| `reserved`     | omitted     | —                  | No canonical buyer transaction/destination exists yet.                                      |
| `sold`         | `history`   | `Vente · Vendue`   | Truthfully records that the Listing was consumed; it does not claim payment or fulfillment. |
| `paused`       | omitted     | —                  | Retained but unavailable, without a required V1 Activity action.                            |
| `expired`      | `history`   | `Vente · Expirée`  | Canonical terminal availability result.                                                     |
| `withdrawn`    | `history`   | `Vente · Retirée`  | Canonical seller-initiated terminal availability result.                                    |

Listing rows are exposed only while the caller still owns the Copy because their existing
canonical destination is Owned Copy Detail. Historical Listing ownership remains preserved in the
Listing itself; a future seller transaction/history destination can safely widen this projection.

## Navigation

- bidder Auction and buyer Order rows open `PublicCopy { copyId, auctionId }`;
- seller Auction, seller Order, and Listing rows open `Copy { copyId }`.

Activity introduces no detail screen and no second navigation container. The existing My Auctions
shortcut remains the urgent bidder-focused surface; every participation it represents is also
recoverable from Activity.

## Privacy

The output contains only safe catalog presentation, public Profile presentation where useful,
canonical Money, caller-relative state, timestamps, and stable navigation references. It never
returns raw Bid rows or winning Bid identifiers, private Copy photos/details, auth metadata,
emails, Wishlist preferences, notes, exact geography, or service credentials. Existing source
table RLS remains unchanged.

## Deferred Trades

Trade Activity is intentionally deferred. `TradeOffer` and `TradeCompletion` exist canonically,
but Geek has no canonical mobile TradeOffer or Conversation destination. Before Trades enter
Activity, product and navigation contracts must define:

- the canonical TradeOffer detail target;
- sender and receiver experiences;
- accepted, declined, cancelled, and expired presentation;
- TradeCompletion visibility;
- the relationship with conversation/messaging if the product requires it.

Activity must not create an Activity-only Trade screen or invent a Conversation route to bypass
that prerequisite.
