# Geek Core Domain Model

This document defines the canonical conceptual model of Geek.

It describes product semantics, relationships and invariants.

It is intentionally independent from database implementation.

---

## 1. Domain boundaries

Geek has four primary domain areas:

### Catalog

Describes what physical video games exist.

Core concepts:

- Game
- Edition
- EditionIdentifier
- Platform

### Ownership

Describes physical objects owned by users.

Core concepts:

- Copy
- Collection
- WishlistItem

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
- TradeMeeting
- TradeCompletion

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

A Copy has at most one current owner.

Conceptual properties may include:

- id
- owner
- edition
- condition
- completeness
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

## Copy condition

Condition belongs to the Copy, never to the Edition.

Condition must be capable of describing physical components separately.

For example:

- media / cartridge condition
- box condition
- manual condition
- inserts
- additional included components

Do not reduce condition to a single marketplace adjective when more
structured information is available.

Geek may derive simplified labels for presentation.

---

## Completeness

Completeness describes which expected components of an Edition are
present in a Copy.

Examples:

- loose
- box included
- manual included
- complete
- sealed

Exact terminology may vary by platform and Edition.

The domain model should support component-level completeness rather than
assuming every game consists only of disc + box + manual.

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

## WishlistItem

A WishlistItem represents acquisition intent.

A WishlistItem may target either:

1. a Game generally
2. a specific Edition

Examples:

"I want any physical copy of Wind Waker"

and:

"I specifically want the French PAL GameCube release"

are different intents.

Conceptual preferences may include:

- preferred Editions
- excluded Editions
- minimum condition
- completeness requirements
- maximum price
- maximum trade distance
- willingness to buy
- willingness to trade

Wishlist preferences express intent and do not guarantee marketplace
availability.

---

# 4. Copy availability

Ownership and commercial availability are separate concerns.

A Copy may be:

- private
- visible in the owner's public collection
- open to trade offers
- available through a Listing
- entered in an Auction

Visibility must not imply availability.

Availability must not imply that ownership has changed.

A Copy cannot be simultaneously committed to conflicting transactions.

For example, once a Copy is reserved through an accepted transaction,
Geek must prevent another sale or accepted trade involving the same
Copy.

The exact technical locking mechanism will be defined later.

---

# 5. Listings

## Listing

A Listing represents an owner's explicit intent to sell a Copy at a
defined direct-sale price.

A Listing references a specific Copy.

The Listing does not own the physical object.

The Copy remains owned by the seller until the relevant ownership
transfer is completed.

Conceptual properties may include:

- id
- copy
- seller
- asking price
- currency
- offers allowed
- fulfillment options
- local availability
- shipping availability
- published timestamp
- status

Listing price is not an intrinsic property of the Copy.

Changing or removing a Listing must not destroy the Copy.

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

The final state machine will be specified separately.

A sold Listing must not automatically imply successful fulfillment.

That belongs to the Order lifecycle.

---

# 6. Auctions

## Auction

An Auction represents a time-based method for selling a Copy.

An Auction references a specific eligible Copy.

Conceptual properties may include:

- id
- copy
- seller
- start time
- end time
- starting price
- reserve price
- current bid
- bid history
- status

Auction timing must be server-authoritative.

A Copy committed to an active Auction must not simultaneously be sold
through another conflicting marketplace mechanism.

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

A TradeOffer represents a proposed exchange between two users.

A TradeOffer contains two sides:

Party A offers:

- one or more Copies
- optional monetary compensation

Party B offers:

- one or more Copies
- optional monetary compensation

A TradeOffer may therefore represent:

- one Copy for one Copy
- multiple Copies for one Copy
- multiple Copies for multiple Copies
- Copy plus money for Copy
- other balanced combinations supported by future product rules

Trade must never be modeled as inherently one-to-one.

---

## Trade invariants

A user can only offer Copies they currently own and are allowed to
trade.

The same Copy cannot appear on both sides of a TradeOffer.

Users cannot trade with themselves.

A TradeOffer does not transfer ownership when merely sent.

An accepted TradeOffer reserves the participating Copies.

Ownership transfers only when the trade is successfully completed.

The exact reservation and expiration rules will be specified later.

---

## TradeMeeting

A TradeMeeting represents the agreed logistics for a local physical
exchange.

It is separate from the users' private home locations.

Conceptual properties may include:

- agreed public meeting place
- approximate area
- agreed date and time
- participant confirmations
- status

A meeting location must be explicitly agreed upon by participants.

User home coordinates are never exposed as part of this object.

---

## TradeCompletion

TradeCompletion represents mutual confirmation that the physical
exchange occurred.

Successful completion results in ownership changes for the participating
Copies.

Completion may later include:

- mutual confirmation
- verification code
- QR confirmation
- ratings
- dispute window

Those mechanics are not defined here.

---

# 9. Money

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

# 10. Ownership

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

# 11. Reservations

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

# 12. Geographic concepts

Geek distinguishes:

## Private location

Precise location data owned by a user.

Never public.

## Discovery area

An intentionally approximate representation used for:

- nearby search
- collection matching
- distance estimation

## Meeting location

A location explicitly proposed and agreed upon for a specific trade.

These three concepts must never be conflated.

---

# 13. Search

Search results are projections over domain data.

Search does not own canonical catalog or ownership data.

Search indexes may contain denormalized representations for performance.

The canonical source of truth remains Geek's primary data model.

Search indexes must be replaceable and rebuildable.

---

# 14. Pricing

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

# 15. External market data

External pricing information is evidence used to generate estimates.

It is not canonical Geek transaction history.

Provider data must retain its source and relevant timestamp.

Geek-generated transaction data and externally sourced market data must
remain distinguishable.

---

# 16. Privacy

A Copy can contain both public and private information.

Examples of potentially private Copy data:

- purchase price
- private notes
- storage location
- provenance notes

Visibility must be evaluated field-by-field where necessary.

Making a Copy public must never automatically expose all Copy fields.

---

# 17. Identity and IDs

Geek owns canonical identity for all internal domain objects.

External provider IDs must be stored as mappings.

Changing a provider must not require changing Geek canonical IDs.

The concrete ID format is deliberately not specified in this document.

---

# 18. Core relationships

Conceptually:

Game
has many Editions

Edition
belongs to Game
has many Copies

Copy
belongs to Edition
has one current owner

User
owns many Copies
has many WishlistItems

WishlistItem
targets Game or Edition

Listing
sells one Copy

Auction
auctions one Copy

Order
contains one or more OrderItems

OrderItem
references one Copy

TradeOffer
proposes exchange of multiple Copies between two users

TradeMeeting
coordinates local fulfillment of an accepted TradeOffer

TradeCompletion
confirms successful exchange and ownership transfer

---

# 19. Important non-equivalences

The following concepts must never be treated as equivalent:

Game != Edition

Edition != Copy

Copy != Listing

Listing != Order

Asking price != Market value

Market value != Purchase price

Visibility != Availability

Reservation != Ownership

Trade acceptance != Trade completion

Approximate discovery location != Exact user location

External provider identity != Geek identity

These distinctions are foundational.

---

# 20. Deferred decisions

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
- reservation locking implementation
- auction bid implementation
- dispute mechanics
- rating mechanics
- tax implementation

These decisions require separate specifications.

---

# 21. Domain design rule

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
