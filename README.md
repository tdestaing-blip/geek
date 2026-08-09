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

### Auth smoke test

With the local stack running, exercise signup and the Profile-creating trigger, sign-in, verified identity, own-Profile access, wrong-password rejection, sign-out, persisted-session restoration, Profile row-level security, the password-reset round trip, and the callback/redirect validation rules:

```sh
pnpm db:smoke:auth
```

Reset the database first (`pnpm db:reset`) for a clean run. The password-reset checks read the emailed link from the local mail server on <http://127.0.0.1:54324>, and are reported as skipped when the local Auth server's hourly email limit has been reached.

Browser and native callback delivery still needs a real runtime: the redirect, classification and route-matching rules are covered here, but a click on an emailed link in a browser, and a `geek://auth/callback` deep link on a device, are not.

### Auth redirect URLs

`supabase/config.toml` allows exactly the local callback routes for web (`127.0.0.1:3000`), admin (`127.0.0.1:3001`) and the native `geek://` scheme. Supabase silently substitutes `site_url` for any redirect target that is not on that list, so a new client URL has to be added there before its links will work.

Expo Go and development builds generate their own `exp://` callback URL. Print it with `Linking.createURL("auth/callback")` and add it to `additional_redirect_urls` locally; it is machine-specific and is not committed.

The absolute URL that web and admin put into Auth emails comes from `APP_ORIGIN`, a server-only variable documented in each app's `.env.example`. It is deliberately not derived from the request's `Host` header, which the person making the request controls. Locally it can be left unset, where it defaults to that app's own origin; a hosted environment has to set it, and add the matching callback route to the project's redirect allow-list.

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
