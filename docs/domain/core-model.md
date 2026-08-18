# Geek Core Domain Model

This document defines the canonical conceptual model of Geek.

It describes product semantics, relationships and invariants.

It is intentionally independent from database implementation.

---

## 1. Domain boundaries

Geek has five primary domain areas:

### Catalog

Describes what physical video games exist.

Core concepts:

- Game
- Edition
- CatalogMedia
- EditionIdentifier
- EditionComponent
- Platform

### Ownership

Describes physical objects owned by users.

Core concepts:

- Copy
- CopyComponentState
- Collection
- WishlistIntent

### Marketplace

Describes ways ownership can be transferred commercially.

Core concepts:

- Listing
- Auction
- Order
- OrderItem

### Trade

Describes direct exchanges between users.

Core concepts:

- TradeOffer
- TradeCompletionConfirmation
- TradeCompletion

### Communication

Describes how two users coordinate a trade inside Geek.

Core concepts:

- Conversation
- Message
- ConversationTradeOffer

These domains may reference each other but must not be conflated.

---

# 2. Catalog

## Game

A Game represents the abstract creative work.

Example:

The Legend of Zelda: The Wind Waker

A Game does not represent a particular physical release.

A Game may have many Editions.

Conceptual properties may include:

- id
- canonical title
- alternate titles
- description
- franchise
- developers
- publishers
- genres
- original release date
- artwork

Catalog metadata may come from external providers, but Geek owns the
canonical Game identity.

---

## Platform

A Platform represents a hardware or software platform on which an
Edition was commercially released.

Examples:

- Nintendo GameCube
- PlayStation 2
- Xbox
- Nintendo Switch

Platform is catalog reference data.

A Platform is not inferred from user ownership.

---

## Edition

An Edition represents a specific commercially released physical version
of a Game.

Examples:

The Wind Waker
Nintendo GameCube
PAL
French retail release

and:

The Wind Waker
Nintendo GameCube
Player's Choice
PAL

are two different Editions.

An Edition belongs to exactly one Game.

A Game can have many Editions.

Conceptual properties may include:

- id
- game
- platform
- region
- supported languages
- release date
- publisher
- packaging type
- edition name
- included physical content
- official cover artwork

Two releases should be separate Editions when the distinction can
materially affect:

- collectability
- compatibility
- physical contents
- market value
- identification

Cosmetic catalog corrections must not create a new Edition.

---

## CatalogMedia

CatalogMedia is provider-independent reference media representing exactly one
Game or Edition. Game-level media may be generic artwork, a logo, or a fallback
cover. Edition-level media may represent the front or back cover of a specific
regional or commercial release.

CatalogMedia is not a photograph of an individual user's Copy and says nothing
about that Copy's condition or appearance. Future Copy and marketplace photos
belong to separate user-generated-media semantics.

Geek's Game, Edition, and CatalogMedia IDs remain canonical. Provider asset
identifiers and media URLs are external references and may be replaced without
changing those identities.

---

## EditionIdentifier

An EditionIdentifier associates an Edition with physical or publisher-issued
identification.

Examples:

- EAN
- UPC
- JAN
- publisher product code

An Edition may have multiple identifiers.

The same identifier type may require contextual information such as
region or source.

External catalog provider IDs are not EditionIdentifiers. They belong in
provider mappings and are not Geek canonical IDs.

Geek must remain able to replace external catalog providers.

---

## EditionComponent

An EditionComponent represents one physical component expected to exist as
part of an Edition.

Examples include:

- primary game disc
- cartridge
- plastic case
- manual
- registration card
- map
- outer cardboard box
- bonus disc
- collector item

An Edition can have many EditionComponents. They describe what the commercial
release contained, not whether a particular user's Copy still contains those
components.

For example, the French PAL GameCube Edition of The Wind Waker may contain:

- Game disc
- GameCube case
- Manual
- Nintendo registration insert

---

# 3. Ownership

## Copy

A Copy represents one specific physical object owned by one user.

This distinction is fundamental.

Game:

The Wind Waker

Edition:

French PAL GameCube release

Copy:

Thomas's particular physical copy of that Edition.

A Copy belongs to exactly one Edition.

A Copy has exactly one current owner while active.

Conceptual properties may include:

- id
- owner
- edition
- component states
- personal photos
- provenance
- acquisition date
- purchase price
- private notes
- visibility
- availability preferences

A Copy can exist in Geek without ever becoming available for trade or
sale.

---

## CopyComponentState

A CopyComponentState represents the observed state of one EditionComponent for
one Copy.

It may describe:

- whether the component is present, missing, or unknown
- physical condition when present
- optional notes

A CopyComponentState must reference an EditionComponent belonging to the same
Edition as the Copy.

Absence of a CopyComponentState means the component has not yet been assessed.
It does not mean the component is missing or unknown.

---

## Derived condition and completeness

Completeness describes which expected EditionComponents are present in a Copy.
Condition describes the observed physical state of components that are present.

Geek should derive simplified presentation labels from structured component
state where possible. Labels such as "Complete" or "Very good" are presentation
summaries, not the canonical underlying physical facts. Do not store one
authoritative overall condition or completeness label on Copy.

---

## Collection

A Collection is the set of Copies currently owned by a user.

Collection is primarily an ownership concept.

A user does not need to explicitly create a Collection before adding
Copies.

Collection views may organize Copies by:

- platform
- franchise
- generation
- custom shelves
- value
- status

These views do not change Copy ownership.

---

## WishlistIntent

A WishlistIntent represents one user's acquisition intent.

It is independent from ownership. Owning a Copy does not automatically remove
or forbid a WishlistIntent. A collector may legitimately want another Copy, a
better-condition Copy, another regional Edition, a duplicate for trade, or a
sealed or special Edition in the future.

Wishlist state must not be inferred only from current ownership.

A WishlistIntent always identifies one Game and may optionally identify one
exact Edition of that Game:

1. a Game generally
2. a specific Edition

Examples:

"I want any physical copy of Wind Waker"

and:

"I specifically want the French PAL GameCube release"

are different intents.

A broad WishlistIntent has no Edition. An exact WishlistIntent retains the Game
and adds its specific physical Edition. Broad intent may be refined to an
Edition, and exact intent may become broad again, without replacing the intent.

Database integrity prevents a cross-Game Edition assignment.

Wishlist visibility is separate from acquisition intent. Initial visibility is
either private or public. Private WishlistIntents are visible only to their owner
and trusted Geek operations. Public visibility may later support public
profiles, matching, and social discovery, but does not mean that the user
accepts unsolicited offers.

Acquisition preferences may include:

- purchase interest
- trade interest
- optional maximum purchase price
- optional maximum local trade distance
- priority
- preferred region
- completeness preference
- minimum component condition grade

Purchase interest and trade interest are independent and may both be false so
that a collector can track a collection goal without active acquisition intent.
They are public-safe intent fields when the WishlistIntent is public.

Maximum purchase price is an optional Money value. Maximum purchase price,
maximum trade distance, priority, and private notes are owner-private
acquisition preferences. A public WishlistIntent must never expose them.

Maximum trade distance is expressed in kilometers. It is a preference, not a
location, and does not reveal where the user lives.

Priority expresses how urgently the owner wants the target. It is private
because exposing it could create negotiation leverage.

Condition remains component-oriented. The WishlistIntent grade constrains
future matching of present, assessed components; it is not a canonical overall
Copy condition.

Wishlist preferences express intent and do not guarantee marketplace
availability.

Initial WishlistIntent lifecycle states are:

- active: the user currently wants or tracks the target
- fulfilled: the user considers the acquisition goal satisfied
- archived: the user no longer actively tracks the target

Ownership changes must not automatically mark a WishlistIntent fulfilled until
explicit product rules define that behavior.

A user may have at most one active WishlistIntent for the same exact target:

- one active broad WishlistIntent for the same Game
- one active exact WishlistIntent for the same Edition

Different exact Editions of one Game may coexist, and a broad intent may
coexist with exact intents.

Historical fulfilled or archived items may coexist with a new active item for
the same target.

Reciprocal local trade matching interprets a Game target as compatible with
Copies whose Edition belongs to that Game. An Edition target is compatible only
with Copies of that exact Edition unless future explicit fallback preferences
say otherwise. Caller-owned active trade wants may participate regardless of
Wishlist visibility. A counterpart's want participates only when it is active,
public, and explicitly marked for trade interest.

---

# 4. Copy availability

Ownership and commercial availability are separate concerns.

A Copy has exactly one transaction-availability mode:

- `private`
- `open_to_trade`
- `for_sale`
- `in_auction`

Collection visibility remains a separate `private` / `public` concern. A Copy
may therefore be hidden from the owner's public profile while intentionally
exposed through a safe trade, Listing, or Auction discovery surface.

Visibility must not imply availability.

Availability must not imply that ownership has changed.

A Copy cannot be simultaneously committed to conflicting transactions.

For example, once a Copy is reserved through an accepted transaction,
Geek must prevent another sale or accepted trade involving the same
Copy.

Geek uses one internal commercial commitment per Copy to coordinate supported
ownership-transfer mechanisms. This is infrastructure rather than a user-facing
marketplace object. Active or reserved Listings, scheduled or won Auctions, and
accepted TradeOffers hold the commitment. Draft Listings, draft Auctions,
pending TradeOffers, and historical mechanisms do not.

The commitment prevents conflicting direct-sale, Auction, and accepted Trade
supply and blocks Copy ownership transfer while the Copy is commercially
committed.

---

# 5. Listings

## Listing

A Listing represents explicit intent by the current owner of one Copy to sell
that Copy for a fixed asking price.

A Listing is not the Copy. A Copy may exist without a Listing, and removing or
closing a Listing does not remove the Copy.

A Listing references exactly one Copy. The seller must own that Copy when the
Listing is created. Creating a Listing does not transfer ownership; the Copy's
current owner remains authoritative.

The Listing preserves the seller identity established at creation. After a
legitimate future ownership transfer, a historical Listing's seller does not
need to equal the Copy's new current owner.

One Copy may have at most one active or reserved direct-sale Listing at a time.
Historical, draft, or otherwise closed Listings may coexist.

Conceptual properties may include:

- id
- copy
- seller
- asking price
- local pickup availability
- shipping availability
- published timestamp
- status

The asking price is a Money value with an integer minor amount and explicit
currency. It belongs to the Listing, not the Copy. Estimated market value and
the owner's private purchase price remain separate concepts.

A Listing may support local pickup, shipping, or both. An active Listing must
support at least one of them. Local pickup does not mean that the Listing is
only discoverable locally, and buyer geography does not belong on Listing.

Seller coordinates must never be copied into Listing. Future local-sale
discovery derives locality through controlled geographic infrastructure.

Changing, closing, or removing a Listing must not destroy the Copy. Direct
client deletion is not supported, and Listings that participate in commercial
history must not be destructively deleted.

---

## Listing lifecycle

Conceptually, a Listing may move through states such as:

- draft
- active
- reserved
- sold
- paused
- expired
- withdrawn

Draft Listings are not publicly available. Active Listings are available for
purchase. Reserved Listings are temporarily committed to an in-progress
transaction. Paused, expired, and withdrawn Listings are unavailable but
retained. Sold means a commercial transaction consumed the Listing.

Normal sellers may manage draft, active, paused, and withdrawn states. Reserved,
sold, and expired are system-managed states that require trusted workflows.
Normal clients cannot modify a Listing while it is in a system-managed state.

A sold Listing must not automatically imply successful fulfillment.

That belongs to the Order lifecycle.

An active Listing may need a future marketplace projection that exposes the
associated Copy's public-safe marketplace data even when the owner's collection
visibility is private. That concern must not make private Copy metadata public
or globally change Copy privacy semantics.

Future Search must distinguish active direct-sale Listings from tradeable
Copies and Auctions. Shipping-enabled Listings may be considered beyond local
proximity, while local Listings may be ranked or filtered using controlled
seller geography.

---

# 6. Auctions

## Auction

An Auction represents explicit intent by the current owner of one Copy to sell
that Copy through competitive bidding during a defined time window.

Auction is not Listing and is not Copy. A Copy may exist without either, and
Listing and Auction remain distinct commercial mechanisms.

An Auction references exactly one Copy. The seller must own that Copy whenever
the Auction is prepared or commercially committed. Auction preserves its
historical seller identity after a legitimate future ownership transfer.

Conceptual properties may include:

- id
- copy
- seller
- start time
- end time
- starting amount and currency
- minimum bid increment
- private reserve amount
- local pickup and shipping availability
- current amount and bid count
- immutable Bid history
- status

Auction timing must be server-authoritative.

A scheduled Auction represents a commitment for both its upcoming and current
bidding window. A won Auction keeps that commitment pending future transaction
completion. Neither may coexist with an active or reserved Listing for the same
Copy.

Initial persisted Auction statuses are:

- draft
- scheduled
- won
- ended
- cancelled
- sold

Live is a temporal phase derived from a scheduled Auction's timestamps rather
than a stored status. A scheduled Auction is upcoming before `starts_at`, live
from `starts_at` inclusive until `ends_at` exclusive, and awaiting finalization
at or after `ends_at`.

The reserve amount is seller-private. Public Auction presentation exposes the
current amount and bid count, never the reserve amount or bidder identities.

Future Search may independently surface fixed-price Listings, Auctions,
trade-compatible Copies, and collectors or public Copies. Geographic proximity
is not a global Auction constraint: shipping Auctions may be discoverable
throughout the supported territory. Exact seller coordinates never belong on
Auction.

Future support for multi-Copy auction lots may introduce an explicit lot
concept.

Do not model that prematurely.

---

# 7. Orders

## Order

An Order represents a commercial transaction created when a monetary
sale has been agreed.

Examples:

- direct Listing purchase
- accepted monetary offer
- successful Auction

An Order contains one or more OrderItems.

All items in an Order share one buyer and one seller.

Multi-seller Orders are not supported. If a buyer purchases from
multiple sellers, those purchases create separate Orders.

An Order is not the same thing as a Listing.

Listing describes sale intent.

Order describes an agreed transaction and its fulfillment.

Conceptual properties may include:

- id
- buyer
- seller
- currency
- items
- subtotal
- fees
- total
- payment state
- fulfillment method
- fulfillment state
- created timestamp

Order.currency represents the transaction currency shared by the Order.

All OrderItems in a single Order must use the same currency.

Order state must distinguish at minimum between:

- payment
- fulfillment
- completion
- cancellation
- dispute

A successful Order ultimately results in ownership transfer of all
included Copies.

The precise moment at which ownership changes will be specified in the
transaction domain rules.

## OrderItem

An OrderItem represents one Copy included in an Order.

It preserves the item-level commercial agreement at the time the Order
was created.

Conceptual properties may include:

- copy
- source Listing or other monetary sale mechanism
- agreed item price
- currency

An Order contains one or more OrderItems.

A Copy can appear at most once in the same Order.

OrderItem exists so a single Order can support multiple Copies from the
same seller while preserving item-level pricing and provenance.

Do not infer current Listing price after Order creation.
The agreed commercial values must be preserved on the Order.

---

# 8. Trade

## TradeOffer

A TradeOffer represents an explicit proposal from one user to another to
exchange one or more physical Copies.

A TradeOffer contains two sides:

The proposer offers:

- one or more Copies

The recipient is asked to offer:

- one or more Copies

A TradeOffer may also contain one optional positive monetary adjustment paid
in either direction. It therefore may represent:

- one Copy for one Copy
- multiple Copies for one Copy
- multiple Copies for multiple Copies
- Copy plus money for Copy

Trade must never be modeled as inherently one-to-one.

---

## TradeOffer lifecycle

Initial TradeOffer statuses are:

- pending: the proposal exists, but no Copy is reserved
- accepted: the recipient accepted and every involved Copy is reserved by this
  TradeOffer
- declined: the recipient rejected the proposal
- cancelled: the proposer withdrew the proposal before acceptance
- expired: the pending proposal's optional expiration time passed
- completed: both participants confirmed the physical exchange, ownership
  transferred, and the TradeOffer holds no commitment

The proposer may transition a pending TradeOffer to cancelled. The recipient
may transition a pending TradeOffer to declined or accepted. Trusted Geek
infrastructure may transition a pending TradeOffer to expired. An accepted
TradeOffer transitions to completed only through the second participant's
completion confirmation. No other transition is valid.

Partial completion confirmation is not a status. A TradeOffer with one
confirmation is still accepted.

TradeOffer terms are immutable after creation. Changing the participants,
Copies, monetary adjustment, or expiration requires cancelling the pending
offer and creating another one. Counter offers are not implemented.

A pending TradeOffer holds no reservation or commercial commitment. Multiple
pending TradeOffers may reference the same Copy, and a pending offer may become
stale as ownership, availability, or commercial commitments change.

Accepting a TradeOffer revalidates every Copy and atomically reserves all
involved Copies through Geek's shared Copy commitment infrastructure. Partial
acceptance is invalid. An accepted TradeOffer does not transfer ownership or
prove that an exchange occurred.

A TradeOffer does not need to originate from Matching and does not depend on
Wishlist state after creation. Matching is derived discovery; a TradeOffer is
an explicit proposal defined by its participants, Copies, optional monetary
adjustment, and lifecycle.

---

## Trade invariants

A user can only offer Copies they currently own and are allowed to
trade.

The same Copy cannot appear on both sides of a TradeOffer.

Users cannot trade with themselves.

A TradeOffer does not transfer ownership when merely sent.

An accepted TradeOffer reserves the participating Copies.

Ownership transfers only when the trade is successfully completed.

TradeCompletion atomically validates an accepted TradeOffer and its commitments,
releases its reservations, transfers the Copies in both directions, preserves
TradeOffer history, and creates TradeCompletion history.

---

## Trade coordination

Geek has no TradeMeeting object. Participants coordinate a local physical
exchange inside the Conversation they already share.

Logistics such as where and when to meet are user-authored message content
agreed between the two participants. Geek does not model a meeting as canonical
state, does not derive a meeting place from either user's private location, and
never exposes home coordinates for coordination purposes.

---

## TradeCompletion

TradeCompletion is the immutable historical fact that the physical exchange
described by an accepted TradeOffer actually occurred.

Geek cannot observe a physical handover, so completion relies on both
participants confirming it. Each participant may record one irreversible
TradeCompletionConfirmation. The first confirmation changes nothing: the
TradeOffer stays accepted, every Copy stays reserved, and no ownership moves.
The second confirmation completes the Trade atomically in the same transaction:
it releases every commitment, transitions the TradeOffer to `completed`,
transfers the Copies in both directions, and creates exactly one
TradeCompletion.

There is no separate client-visible finalize operation and no way to withdraw a
confirmation.

TradeCompletion stores only the TradeOffer reference and the completion
timestamp. It duplicates no TradeOffer terms and no Copy membership.

A trade transfers the physical object, not the previous owner's private context
or consent. Transferred Copies keep their identity, Edition, and component
condition, and arrive private and closed to trade. Private Copy details are
owner-specific rather than object state, so they stay with the owner who
recorded them and never reach the new owner.

Geek does not process the optional monetary adjustment. Confirming means the
participants agree that the physical exchange, including any agreed cash, took
place between them.

Verification codes, QR confirmation, ratings, and dispute windows are not
defined here.

---

# 9. Messaging

Messaging exists so two collectors can coordinate a trade inside Geek without
disclosing a phone number, an email address, or an exact personal location.

The product flow is Matching or Discovery, then Conversation, then TradeOffer,
then Conversation coordination, then TradeCompletion.

## Conversation

A Conversation is a private one-to-one channel between exactly two users.
Exactly one canonical Conversation exists per unordered user pair, and its
participants are immutable historical identity. A Conversation holds no messages
and no trade state of its own, and a user cannot open one with themselves.

A Conversation is not a Match, not a TradeOffer, and not a commercial
commitment. Messaging creates no reservation and no ownership effect.

## Message

A Message is immutable, user-authored, plain-text communication belonging to one
Conversation. Its sender must be one of the two participants. History is
append-only and ordered by server-authoritative creation time.

## ConversationTradeOffer

A ConversationTradeOffer is an immutable reference connecting an existing
TradeOffer to the Conversation between those same two participants. It stores
only the reference; TradeOffer status and terms remain canonical in the Trade
domain and must never be duplicated into Messaging.

A TradeOffer may appear in at most one Conversation, while a Conversation may
accumulate many TradeOffers over time.

## Contact policy

The messaging foundation lets any authenticated user contact any other Geek
profile. That is deliberately minimal and is not sufficient for public launch.
Contact gating, blocking, reporting, rate limits, spam controls, and moderation
are required safety work before Geek opens messaging publicly.

Messaging specifics are defined in the Messaging domain document.

---

# 10. Money

Money is a value object.

It contains:

- integer amount in minor units
- currency

Example:

€42.50

is represented conceptually as:

amount = 4250
currency = EUR

Currency must never be inferred from amount.

Money equality requires both amount and currency.

Arithmetic between different currencies is invalid unless an explicit
conversion operation is performed.

---

# 11. Ownership

Ownership is a critical domain fact.

Geek must be able to determine the current owner of every active Copy.

Ownership changes can result from:

- successful Order completion
- successful TradeCompletion
- explicit ownership corrections allowed by future rules

Creating a Listing does not transfer ownership.

Creating an Auction does not transfer ownership.

Sending a TradeOffer does not transfer ownership.

Accepting a TradeOffer does not by itself complete ownership transfer.

Historical ownership may eventually be retained for provenance and
auditability.

---

# 12. Reservations

A reservation prevents the same Copy from being committed to multiple
incompatible transactions.

Conceptually, a Copy may need reservation because of:

- accepted TradeOffer
- active checkout
- paid Order awaiting completion
- successful Auction awaiting payment

Reservation is not ownership.

Reservation rules must be enforced server-side.

The implementation of reservation will be specified when transaction
architecture is designed.

---

# 13. Geographic concepts

Geek distinguishes:

## PrivateUserLocation

PrivateUserLocation represents a user-supplied location used for discovery and
distance calculations.

It may eventually originate from device location, postal-code geocoding, a
manually selected map position, or city selection. The origin mechanism is not
defined yet.

Precise coordinates are private account and discovery infrastructure. They do
not belong to public Profile identity and must never be exposed through public
profiles, public table reads, public API payloads, analytics, logs, or
client-facing search indexes.

## Discovery presentation

Public product surfaces may eventually expose derived values such as
approximate distance, city or broad area, or "near you." These presentation
values are not equivalent to exact stored coordinates. Clients must not need
another user's coordinates merely to display nearby results.

## Agreed meeting place

A meeting place for one Trade is agreed by the participants as message content
inside their Conversation. It is not a Geek-modelled location object and must
remain entirely separate from PrivateUserLocation.

A user's private discovery location must never become a meeting place, and Geek
must never derive or suggest one from it.

## Radius

A search or trade radius is a preference, not a location. Wishlist maximum
trade distance is one example.

## Location freshness

A PrivateUserLocation may eventually record its source, user confirmation, and
last-updated timestamp. Automatic freshness behavior is deliberately deferred.

Private location, derived discovery presentation, meeting location, and radius
preferences must never be conflated.

---

# 14. Search

Search begins with explicit user intent, such as a Game title, a Platform, or a
specific Edition. It is distinct from Matching, which will later combine what a
user owns or wants with reciprocal intent, geography, availability, and other
ranking signals.

One search target may lead to several semantically distinct discovery channels:

- Catalog: Games and Editions
- Buy: active fixed-price Listings
- Auctions: scheduled Auctions that have not reached their end time
- Trade: Copies explicitly marked `open_to_trade`
- Collectors: Copies whose Collection visibility is public

These channels must not be collapsed into one generic marketplace result type.
Visibility and availability remain independent. An active Listing or a Copy
marked `open_to_trade` is explicit discoverability intent and may be projected
through a narrowly defined safe result even when the Copy's general Collection
visibility is private. Collector discovery, by contrast, includes only public
Copies.

Search results are read projections over canonical Game, Edition, Copy,
Listing, and Auction state. Search does not own canonical catalog, ownership,
or commercial data. Search projections must return Geek canonical IDs and must
never use external provider identifiers as identity.

Search must not expose private Copy details, private Wishlist preferences,
Auction reserve amounts, Bid identities or raw other-user Bids, or exact user
coordinates. Shipping capability does not currently encode destination
coverage and must not be treated as a proximity restriction.

A future external search index may contain denormalized representations for
performance, but it must be replaceable, rebuildable, privacy-reviewed before
projection, and subordinate to PostgreSQL as the canonical source of truth.

---

# 15. Matching

Matching answers a personalized opportunity question from canonical current
state. It is distinct from Search, which begins with an explicit Catalog query.

The first Matching capability is reciprocal local trade matching: find nearby
collectors who own an `open_to_trade` Copy satisfying one of the caller's active
trade wants and who publicly want an `open_to_trade` Copy owned by the caller.
Both directions are required.

A reciprocal match is a derived discovery opportunity. It is not persisted,
does not create a TradeOffer, reservation, commercial commitment, or ownership
change, and may disappear as Wishes, Copies, availability, visibility, or
locations change.

Copy visibility is independent from explicit `open_to_trade` availability. A private
Copy may participate only when it is `open_to_trade`, and Matching exposes only
its safe Copy, Game, and Edition identities. Counterpart-private WishlistIntents
and Wishlist private details never contribute to the first matching version.

Matching uses private discovery locations internally, but returns only fixed
coarse distance buckets. It accepts no target user ID and never returns exact
coordinates or exact distance. Caller-owned per-Wishlist maximum trade distance
may narrow that caller's result; counterpart-private distance preferences are
deliberately not used.

---

# 16. Pricing

Geek distinguishes:

## Asking price

The price requested by a seller through a Listing.

## Transaction price

The actual monetary amount agreed during a completed commercial
transaction.

## Estimated market value

A derived estimate produced from market data.

## Purchase price

The amount a Copy owner personally paid when acquiring their Copy.

These values are not interchangeable.

Estimated market value must never overwrite historical transaction or
purchase values.

---

# 17. External market data

External pricing information is evidence used to generate estimates.

It is not canonical Geek transaction history.

Provider data must retain its source and relevant timestamp.

Geek-generated transaction data and externally sourced market data must
remain distinguishable.

---

# 18. Privacy

A Copy can contain both public and private information.

Examples of potentially private Copy data:

- purchase price
- private notes
- storage location
- provenance notes

Visibility must be evaluated field-by-field where necessary.

Making a Copy public must never automatically expose all Copy fields.

---

# 19. Identity and IDs

Geek owns canonical identity for all internal domain objects.

External provider IDs must be stored as mappings.

Changing a provider must not require changing Geek canonical IDs.

The concrete ID format is deliberately not specified in this document.

---

# 20. Core relationships

Conceptually:

Game
has many Editions

Edition
belongs to Game
has many EditionComponents
has many Copies

EditionComponent
belongs to Edition

Copy
belongs to Edition
has one current owner
has many CopyComponentStates

CopyComponentState
belongs to Copy
references one EditionComponent from the same Edition

User
owns many Copies
has many WishlistIntents

WishlistIntent
targets Game or Edition

Listing
sells one Copy

Auction
auctions one Copy

Bid
belongs to one Auction and one bidder

Order
contains one or more OrderItems

OrderItem
references one Copy

TradeOffer
proposes exchange of multiple Copies between two users

TradeCompletionConfirmation
records one participant's confirmation of one TradeOffer exchange

TradeCompletion
confirms successful exchange and ownership transfer for one TradeOffer

Conversation
connects exactly two users as one canonical private channel

Message
belongs to one Conversation and is authored by one participant

ConversationTradeOffer
references one TradeOffer from the Conversation between the same two users

---

# 21. Important non-equivalences

The following concepts must never be treated as equivalent:

Game != Edition

Edition != Copy

Copy != Listing

Copy != Auction

Listing != Auction

Listing != Order

Asking price != Market value

Market value != Purchase price

Visibility != Availability

Reservation != Ownership

Trade acceptance != Trade completion

Completion confirmation != Trade completion

Conversation != TradeOffer

Message != TradeOffer state

Approximate discovery location != Exact user location

External provider identity != Geek identity

These distinctions are foundational.

---

# 22. Deferred decisions

This document deliberately does NOT decide:

- database tables
- database technology
- canonical ID format
- exact status enums
- event architecture
- payment provider
- search provider
- maps provider
- pricing provider
- shipping provider
- ownership-event persistence strategy
- additional commercial commitment mechanisms beyond Listing, Auction, and
  accepted TradeOffer
- proxy/max bidding
- automatic bid extension
- dispute mechanics
- rating mechanics
- tax implementation

These decisions require separate specifications.

---

# 23. Domain design rule

When adding future functionality, ask:

1. Is this describing the game itself?
2. A commercially released Edition?
3. A user's physical Copy?
4. A user's intent?
5. A transaction mechanism?
6. A transaction outcome?

Do not attach behavior to the wrong layer merely because it is easier
to implement.

The model should preserve the real-world meaning of the physical object.
