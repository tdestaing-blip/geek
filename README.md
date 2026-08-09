# Geek

Geek is a pnpm monorepo for the mobile, web, and administrative clients of the Geek platform. This repository currently contains foundation code only; product functionality has not been implemented.

## Repository structure

```text
apps/
  mobile/          Expo and React Native application
  web/             Next.js customer-facing application
  admin/           Next.js administrative application
packages/
  domain/          Shared domain package (currently empty)
  design-tokens/   Shared design-token package (currently empty)
  supabase/        Generated database types and shared Supabase conventions
  config/          Shared TypeScript, ESLint, and Prettier configuration
docs/
  product/         Product documentation
  domain/          Domain documentation
  architecture/    Architecture documentation
  decisions/       Architecture decision records
```

## Prerequisites

- Node.js `^22.13.0`, `^24.3.0`, or `>=25.0.0`
- pnpm 11.20.0
- The platform tooling required by Expo for the mobile target you want to run

The repository pins its pnpm version in `package.json`. If your Node.js installation includes Corepack, run `corepack enable` before installing dependencies.

## Installation

From the repository root:

```sh
pnpm install
```

## Local setup

The applications read their Supabase connection from environment files, so the local database must be running before they can start. A full first-time setup is:

```sh
pnpm install
pnpm db:start
pnpm db:status          # prints the local API URL and anon key
pnpm db:types
```

Then create an environment file for each application you want to run, copying the placeholders and replacing them with the `API URL` and `anon key` that `pnpm db:status` printed:

```sh
cp apps/mobile/.env.example apps/mobile/.env.local
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
```

The local anon key is stable across resets, so this is a one-time step. Environment files are ignored by Git; only the `.env.example` placeholders are committed.

Each application validates its configuration on startup and fails with a named error if a variable is missing, rather than surfacing an unexplained request failure later.

Only the Supabase URL and anon key belong in these files. The anon key is public by design and ships inside the client bundles; access control comes from Auth and row-level security. The service role key and database credentials must never appear in an application environment file.

## Development

Run all three development servers:

```sh
pnpm dev
```

Run an individual application:

```sh
pnpm dev:mobile
pnpm dev:web
pnpm dev:admin
```

The web application uses port 3000. The admin application uses port 3001. The Expo CLI will print the available mobile launch options after it starts.

## Local database

The local database runs through the repository-pinned Supabase CLI and requires a running Docker-compatible container runtime. Install the repository dependencies before using the database commands.

Start the local Supabase stack:

```sh
pnpm db:start
```

Inspect its current status:

```sh
pnpm db:status
```

Reset the local database and reapply all migrations:

```sh
pnpm db:reset
```

Stop the local stack:

```sh
pnpm db:stop
```

Committed database migrations live in `supabase/migrations/`.

### Database types

`packages/supabase/src/database.types.ts` is generated from the local database and committed. Regenerate it after any migration, with the local stack running:

```sh
pnpm db:types
```

These are infrastructure types describing the current schema. Per ADR 0001 the domain model stays independent of Supabase, so they live outside `packages/domain`.

### Connectivity smoke test

With the local stack running, check that the client configuration reaches the API and that row-level security still denies anonymous access to private tables:

```sh
pnpm db:smoke
```

It reads configuration from the environment, falling back to `supabase status`.

## Linting

```sh
pnpm lint
```

## Type checking

```sh
pnpm typecheck
```

## Formatting

Check formatting or apply the shared Prettier configuration:

```sh
pnpm format:check
pnpm format
```
