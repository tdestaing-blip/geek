# Geek

Geek is a premium collection, discovery and marketplace platform for
physical video games.

It allows people to catalog their physical game collection, discover
games and collectors, maintain wishlists, find compatible collectors
nearby, trade games locally, buy and sell games, participate in
auctions, and eventually operate professional seller accounts.

The quality of the user experience is a core competitive advantage.

---

## 1. Product principles

1. Simplicity over feature density.

2. Physical games are objects with identity, history, condition and
   ownership — never just marketplace rows.

3. Collection comes before commerce.
   A user must get value from Geek even if they never buy or sell.

4. The product should feel nostalgic without behaving like an old
   product.
   Nostalgia belongs in art direction, content, motion and emotional
   details — never in interaction friction.

5. Progressive disclosure over overwhelming interfaces.

6. Prefer obvious actions over clever interactions.

7. Search, collection and trade are first-class product experiences.

8. Every marketplace state must be explicit and understandable.

9. Trust and safety are product features, not afterthoughts.

10. Never expose a user's precise home location.
    Geographic discovery uses approximate location and user-controlled
    radius.

11. Accessibility is part of product quality.

12. Mobile is the primary consumer experience.
    Desktop should take advantage of additional space rather than merely
    scaling the mobile UI.

---

## 2. Canonical domain language

These names are canonical and must be used consistently in code,
documentation and APIs.

### Game

The abstract creative work.

Example:
"The Legend of Zelda: The Wind Waker"

A Game is NOT tied to one physical release.

### Edition

A specific commercially released physical version of a Game.

Examples:

- GameCube PAL France
- GameCube Player's Choice PAL
- Japanese release
- Collector's Edition

Edition properties may include:

- platform
- region
- language
- release date
- barcode / EAN / UPC
- packaging
- included content
- reference identifiers

### Copy

A specific physical object owned by a user.

A Copy may include:

- condition
- completeness
- personal photos
- provenance
- purchase price
- acquisition date
- notes
- visibility
- availability for trade
- availability for sale

Never conflate Game, Edition and Copy.

The hierarchy is:

Game
-> Edition
-> Copy

### Collection

The set of Copies owned by a user.

### WishlistItem

A user's desire to acquire a Game or specific Edition.

### Listing

A Copy made available for direct sale.

### TradeOffer

A proposed exchange between users.

It can contain:

- one or more Copies from each party
- optional monetary compensation

### Auction

A time-based selling mechanism for a Copy or eligible group of Copies.

### Order

The commercial transaction resulting from a Listing, accepted monetary
offer or Auction.

Additional domain objects will be defined later.
Do not invent new canonical concepts when an existing domain concept
fits.

---

## 3. Domain architecture

Business rules must live independently from presentation.

Prefer:

packages/domain

for:

- entities
- value objects
- domain rules
- state transitions
- domain validation

UI applications should consume domain behavior rather than recreate it.

Do not put marketplace business logic directly inside React components.

Avoid framework dependencies in the domain package whenever possible.

---

## 4. TypeScript rules

- TypeScript strict mode is mandatory.
- Do not use `any`.
- Avoid unsafe type assertions.
- Prefer explicit domain types over primitive strings.
- Exhaustively handle domain unions and statuses.
- Prefer immutable data where practical.
- Public package APIs must be explicitly typed.
- Do not silently swallow errors.

---

## 5. Money

Never represent money using floating-point values.

Money must use integer minor units.

Example:

€42.50 -> 4250

Every monetary value must explicitly know its currency.

Do not assume EUR globally.

Formatting money is a presentation concern, not a storage concern.

---

## 6. Time

Persist timestamps in UTC.

Business rules involving time must use explicit timestamps rather than
implicit local machine time.

Presentation layers are responsible for displaying local time.

Auction deadlines and transaction state transitions must be
server-authoritative.

---

## 7. Database rules

All database schema changes require migrations.

Never manually mutate production schemas.

Database naming should be explicit and predictable.

Foreign keys should exist where relational integrity requires them.

Critical marketplace state transitions must be transactional.

Do not duplicate derived state unless performance requires it and the
tradeoff is documented.

External provider identifiers must never become Geek's canonical primary
keys.

Geek owns its canonical identifiers.

---

## 8. External providers

Geek must remain replaceable-provider friendly.

Examples include:

- game metadata providers
- price providers
- search providers
- maps
- payments
- shipping

Wrap third-party concepts behind Geek-owned interfaces where it provides
meaningful isolation.

Do not abstract speculative future providers prematurely.

Store provider mappings separately from Geek canonical IDs.

---

## 9. Authentication and authorization

Never rely only on client-side authorization.

Every user-owned resource must be protected server-side.

When database row-level security becomes available, every new
user-owned table requires explicit RLS review.

Do not expose private:

- addresses
- payment data
- exact location
- private collection items
- private notes

through public APIs.

---

## 10. Geographic privacy

Precise user coordinates are private.

Public discovery must use intentionally approximate location.

Exact home coordinates must never appear in:

- public profiles
- search APIs
- map payloads
- analytics events
- logs

Meeting locations are separate objects explicitly agreed upon by users.

---

## 11. UI implementation

Never invent:

- colors
- typography
- spacing
- radii
- shadows
- motion constants

when design tokens exist.

Use tokens.

When implementing from Figma or supplied visual references:

- match hierarchy first
- match layout
- match typography
- match spacing
- match component states
- then refine visual details

Do not reinterpret supplied designs unless there is a technical,
accessibility or platform reason.

If implementation requires a meaningful UX deviation, report it before
making the deviation.

---

## 12. Mobile UX

Prefer native mobile interaction patterns when they improve usability.

Respect:

- safe areas
- keyboard behavior
- touch targets
- platform navigation expectations
- reduced motion
- screen readers

Avoid desktop interaction patterns transplanted directly to mobile.

---

## 13. Web UX

Use semantic HTML.

Keyboard navigation must work.

Interactive elements must have visible focus states.

Do not use divs as buttons.

Public pages should be server-rendered where it materially benefits SEO,
performance or sharing.

---

## 14. Component philosophy

Build reusable components when reuse is real or strongly evident.

Do not create abstractions only because two pieces of UI currently look
similar.

Domain components and primitive UI components should remain distinct.

Prefer composition over large components with many boolean props.

Components should have explicit states.

Relevant components must consider:

- default
- loading
- empty
- error
- disabled
- pressed / active
- unavailable

---

## 15. State management

Use the simplest state model appropriate for the problem.

Do not introduce a global state-management library without a concrete
need.

Server state, local UI state and persisted domain state should not be
conflated.

---

## 16. Performance

Do not prematurely optimize.

However, explicitly consider performance for:

- large collections
- image-heavy grids
- search results
- map markers
- long marketplace feeds
- real-time auctions

Avoid unnecessary client bundles on web.

Images must have appropriate loading and sizing strategies.

---

## 17. Analytics

Analytics must describe meaningful product behavior rather than UI
implementation details.

Prefer:

trade_offer_sent

over:

trade_button_clicked

Do not send:

- precise location
- private messages
- payment data
- sensitive user-entered text

to analytics.

Analytics naming conventions will be defined separately.

---

## 18. Errors

User-facing errors should:

- explain what happened when useful
- preserve user work whenever possible
- provide a recovery action

Internal errors should retain sufficient structured context for
debugging without leaking private user data.

Never display raw provider or database errors directly to users.

---

## 19. Testing philosophy

Tests should protect meaningful behavior.

Domain rules require unit tests.

Critical marketplace workflows require integration tests.

Critical end-to-end flows will require E2E coverage.

Do not write tests merely to increase coverage numbers.

Avoid tests coupled to implementation details.

---

## 20. Git and task scope

Keep changes focused.

Do not opportunistically refactor unrelated code.

Do not introduce dependencies that are not needed for the current task.

Do not build functionality beyond the requested scope.

When a task exposes a larger architectural problem, report it rather
than silently expanding scope.

Prefer small, reviewable commits.

---

## 21. Documentation

Important architectural decisions belong in:

docs/decisions/

Domain specifications belong in:

docs/domain/

Product principles and product behavior belong in:

docs/product/

Architecture documentation belongs in:

docs/architecture/

Code should not be the only source of truth for important business
semantics.

---

## 22. Definition of done

Unless a task explicitly says otherwise, before declaring implementation
complete:

1. Verify the requested behavior.
2. Run formatting checks.
3. Run lint.
4. Run typecheck.
5. Run relevant tests once test infrastructure exists.
6. Check for unintended file changes.
7. Report:
   - what changed
   - architectural decisions
   - tests/checks performed
   - unresolved risks or follow-ups

Do not claim success when required checks are failing.

---

## 23. Agent behavior

Before implementing substantial functionality:

1. Read this file.
2. Read relevant product/domain documentation.
3. Inspect existing implementation patterns.
4. Understand the requested acceptance criteria.
5. Ask or report ambiguity when it materially affects domain behavior.

Prefer the smallest correct implementation.

Never fabricate product requirements.

Never silently make irreversible product, security, financial or data
model decisions.

When unsure whether something is a product decision or implementation
detail, treat it as a product decision and surface it.
