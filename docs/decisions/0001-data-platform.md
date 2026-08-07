# ADR 0001 — Primary data platform

## Status

Accepted

## Context

Geek is a relational marketplace and collection platform.

Its core model includes strong relationships between:

- users
- games
- editions
- physical copies
- ownership
- listings
- auctions
- orders
- trades

The platform also requires:

- transactional integrity
- authorization
- geospatial capabilities
- auditability
- migrations
- server-side constraints
- future realtime behavior

## Decision

Geek will use PostgreSQL as its canonical primary datastore.

Supabase will provide the initial managed PostgreSQL platform and local
development environment.

Geek's domain model must remain conceptually independent from Supabase.

Application code must not treat Supabase-specific concepts as canonical
business concepts.

## Why PostgreSQL

PostgreSQL is a strong fit because Geek's domain is relational and
requires transactional consistency.

Important workflows such as:

- ownership transfer
- reservation
- checkout
- auction completion
- trade completion

must eventually be enforceable atomically.

## Why Supabase

Supabase provides:

- PostgreSQL
- local development tooling
- migrations
- authentication
- row-level security
- storage
- realtime capabilities

while preserving direct access to PostgreSQL.

## Canonical identity

Geek-owned domain entities will use UUID primary keys.

For the initial implementation, PostgreSQL-generated random UUIDs are
the default.

External provider IDs must be stored separately as mappings and must
never become primary keys.

Do not introduce human-readable IDs as canonical identifiers.

## Authorization

Authorization must be enforced server-side.

User-owned data will use PostgreSQL Row Level Security where
appropriate.

Every future user-owned table requires explicit RLS design and review.

RLS must not be treated as the only authorization layer for complex
marketplace business rules.

## Money

Monetary amounts will be stored as integer minor units plus explicit
currency.

Do not use PostgreSQL floating-point types for money.

## Time

Persistent timestamps will use timezone-aware PostgreSQL timestamps and
be treated as UTC.

## Migrations

All schema changes must be represented as committed migrations.

Production schemas must never be changed manually.

## Provider independence

Supabase is infrastructure, not the Geek domain.

The architecture should preserve the ability to move to another
PostgreSQL host in the future without redefining Geek's domain model.
