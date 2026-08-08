# ADR 0003 — Search and Discovery read architecture

## Status

Accepted

## Context

Geek needs privacy-safe search across Catalog, direct-sale supply, Auctions,
trade availability, and public Collections. These channels derive from several
canonical domains and have different exposure rules.

Search answers explicit intent. Matching will later answer personalized
opportunity questions by combining ownership, Wishlist, reciprocal intent,
geography, and other signals. Treating Search as Matching would prematurely
couple privacy-sensitive domains and ranking behavior.

## Decision

PostgreSQL remains the canonical source for Search and Discovery state. The
initial implementation uses bounded PostgreSQL read functions over canonical
Games, Editions, Copies, Listings, and Auctions. PostgreSQL trigram search
supports lightweight Catalog discovery at the current product stage.

Search is a derived read concern. It does not own mutable canonical state, and
no search-specific table duplicates commercial or ownership state.

Each discovery channel has an explicit safe projection and retains its domain
meaning:

- Catalog returns Games and Editions.
- Buy returns active Listings.
- Auctions returns scheduled Auctions before their end time.
- Trade returns Copies explicitly marked `open_to_trade`.
- Collectors returns only public Copies.

Functions use invoker security when existing grants and RLS are sufficient.
`SECURITY DEFINER` is limited to projections that deliberately cross private
Collection visibility for explicit Listing, Auction, or Trade discoverability.
Those projections expose fixed safe columns rather than source rows.

## External search engines

A future external engine such as Typesense may index projections produced from
PostgreSQL, but:

- PostgreSQL remains canonical.
- Documents use Geek canonical IDs.
- The index is disposable and rebuildable.
- Writes never originate in the search engine.
- Authorization and privacy boundaries are decided before projection.
- Exact coordinates are never indexed.
- Auction reserve amounts are never publicly indexed.
- Bidder identity and raw Bids are never publicly indexed.
- Private Copy details and private Wishlist preferences are never publicly
  indexed.

This decision does not select a synchronization, event, or change-data-capture
architecture and does not install an external search engine.

## Geographic and shipping boundaries

Search does not perform distance or radius queries in this foundation. Exact
locations remain isolated by ADR 0002.

Shipping capability makes a commercial mechanism non-local by default, but it
does not define destination coverage. Countries, addresses, shipping zones,
and territory rules require a later explicit model.

## Consequences

The initial search path is simple, transactional with canonical state, and easy
to validate. Trigram indexes improve common Catalog title and label lookups,
while bounded pagination limits query and payload size.

Public Catalog search also has explicit complexity boundaries: normalized
queries are limited to 120 characters and eight distinct tokens, duplicate
tokens are removed before expansion, tokens below three characters use indexed
exact/prefix matching instead of fuzzy expansion, and textual Game, Platform,
and Edition-name match sets are capped at 200 strongest candidate seeds. Those
sets provide bounded entry into Edition search; their IDs are not the source of
semantic truth once an Edition has entered through any seed.

Semantic eligibility and scoring are evaluated directly from each candidate
Edition's joined canonical Game title, Platform name, and Edition name. Every
distinct token must match at least one of those fields, but different fields
may satisfy different tokens. Phrase match sets may seed and boost candidates
without making their capped membership authoritative. This prevents unrelated
equal-score IDs from suppressing an exact cross-field result.

Each canonical entity seed is capped at 200 Editions only after its Editions
pass that complete all-token semantic test, and the combined semantically
eligible set receives a final 200-Edition cap before result ranking. A matched
Game or Platform's membership is not truncated before semantic intersection.
These bounds apply before final result pagination because a small response
limit does not itself bound intermediate search work.

Joined multi-field Edition search and aggregate discovery remain live
PostgreSQL reads. They are appropriate for the current stage, but query plans
and traffic must be observed as Catalog and marketplace volume grow. A future
external index or derived projection may optimize reads without changing
canonical identity or privacy semantics.
