# Catalog

Geek's physical-game hierarchy is:

```text
Game
-> Edition
-> Copy
```

A Game is the abstract creative work. An Edition is a specific commercially
released physical version of a Game. A Copy is one particular physical object
owned by a user.

The Catalog implements Game, Edition, and EditionComponent data. Copy belongs
to the Ownership domain rather than the Catalog.

## Implemented tables

The Catalog consists of:

- `platforms`: hardware or software platforms on which Editions were released
- `games`: Geek-owned canonical identities for creative works
- `editions`: specific physical commercial releases of Games
- `edition_components`: expected physical contents of Editions
- `edition_identifiers`: physical or catalog identifiers associated with an
  Edition
- `game_provider_mappings`: mappings between Geek Games and external providers
- `edition_provider_mappings`: mappings between Geek Editions and external
  providers

Games and Editions use Geek-owned UUIDs as their canonical identities. A Game
title is not unique, and an Edition has no natural unique key because two
Editions may differ in ways the current schema does not yet represent.

## Edition identifiers

`edition_identifiers` represents physical and catalog identification such as:

- EAN
- UPC
- JAN
- publisher product code

An Edition may have multiple identifiers. Identifier lookup may return multiple
results when catalog ambiguity exists. Physical identifiers are unique only
within the same Edition, scheme, and value; Geek does not enforce global
uniqueness unless the real-world data guarantees it.

## Edition components

An EditionComponent defines one expected physical component of an Edition.
Examples of semantic component kinds include:

- `primary_media`
- `case`
- `manual`
- `insert`
- `outer_box`
- `bonus_media`
- `collector_item`

The `kind` is an intentionally extensible, catalog-controlled slug rather than
a PostgreSQL enum. A per-Edition `component_key` identifies a component within
one Edition; component keys are not globally unique.

EditionComponents are publicly readable Catalog data. Normal clients may not
create or modify them.

## Provider mappings

External provider IDs are not physical Edition identifiers and must not be
stored in `edition_identifiers`. They belong in `game_provider_mappings` or
`edition_provider_mappings`.

Keeping provider mappings separate preserves Geek-owned canonical identity and
allows external catalog providers to be replaced without changing Geek IDs.

## Access

Catalog data is publicly readable. Catalog writes are controlled by Geek and
are not directly available to normal anonymous or authenticated client users.
Trusted Geek server and administrative workflows will own catalog writes.
