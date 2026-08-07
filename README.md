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
