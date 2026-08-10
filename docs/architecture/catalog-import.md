# Catalog import

Geek owns canonical Game, Edition, and Platform UUIDs. External providers supply
evidence and metadata through generic mappings; their identifiers never become
Geek primary keys and application code does not depend on provider formats.

The import flow is:

```text
local provider checkout
-> provider adapter
-> normalized platform/game/edition/identifier records
-> trusted atomic database batch
-> canonical Geek catalog + generic provider mappings
```

## Libretro Database

The first adapter reads the official
[`libretro/libretro-database`](https://github.com/libretro/libretro-database)
clrmamepro DAT files. Acquire it separately so parsing and smoke validation do
not depend on GitHub availability:

```sh
git clone https://github.com/libretro/libretro-database.git /path/to/libretro-database
git -C /path/to/libretro-database rev-parse HEAD
```

The repository is licensed under CC-BY-SA-4.0. Import reports record the exact
Git commit used. Operators remain responsible for retaining required source
attribution when catalog metadata is published or redistributed.

Run one reviewed platform at a time:

```sh
pnpm catalog:import:libretro -- \
  --source /path/to/libretro-database \
  --platform snes \
  --dry-run

pnpm catalog:import:libretro -- \
  --source /path/to/libretro-database \
  --platform snes
```

Always dry-run a new revision first. A real import is safe to repeat: stable
provider mappings resolve existing canonical records, and each platform batch
is one transaction. Existing canonical titles and Edition fields are never
overwritten. Only provider-owned `source_title` metadata may change after
identity is proven; newly observed publisher product codes may be added.

## Reviewed platform mapping

| Key                | Libretro system                                | Geek Platform                       |
| ------------------ | ---------------------------------------------- | ----------------------------------- |
| `nes`              | Nintendo - Nintendo Entertainment System       | Nintendo Entertainment System       |
| `snes`             | Nintendo - Super Nintendo Entertainment System | Super Nintendo Entertainment System |
| `game-boy`         | Nintendo - Game Boy                            | Game Boy                            |
| `game-boy-color`   | Nintendo - Game Boy Color                      | Game Boy Color                      |
| `game-boy-advance` | Nintendo - Game Boy Advance                    | Game Boy Advance                    |
| `nintendo-64`      | Nintendo - Nintendo 64                         | Nintendo 64                         |
| `gamecube`         | Nintendo - GameCube                            | Nintendo GameCube                   |
| `master-system`    | Sega - Master System - Mark III                | Master System / Mark III            |
| `mega-drive`       | Sega - Mega Drive - Genesis                    | Mega Drive / Genesis                |
| `saturn`           | Sega - Saturn                                  | Saturn                              |
| `dreamcast`        | Sega - Dreamcast                               | Dreamcast                           |
| `playstation`      | Sony - PlayStation                             | PlayStation                         |
| `playstation-2`    | Sony - PlayStation 2                           | PlayStation 2                       |

Writes never use fuzzy platform matching. Cartridge systems use the reviewed
No-Intro DAT path; optical systems use the reviewed Redump DAT path.

## Identity and filtering

A Libretro record is treated as release/dump evidence. Its stable hash/serial
fingerprint becomes an Edition provider mapping, not a physical identifier.
Publisher serials alone become `publisher_product_code` EditionIdentifiers.

Trailing Libretro release decorations are separated from display titles at the
source's region boundary; following language, revision, status, and dump/service
tags are metadata. Parenthetical text before that boundary remains part of the
title. The matching key changes only Unicode normalization, letter case, and
repeated whitespace: subtitles, sequel numbers, punctuation, and meaningful
parenthetical title text are preserved.

Accepted records with the same normalized base title are grouped only within
one Platform. Consequently, identical conceptual Games imported for different
Platforms receive separate provisional Geek Game rows. Libretro alone does not
establish cross-platform Game equivalence, and differently titled localized
releases also remain separate candidates. This is conservative import behavior,
not final canonical equivalence. A richer provider or explicit review may
reconcile these rows without changing the generic provider-mapping model. That
reconciliation must happen before production Copies, Wishlists, Listings,
Trades, or other user history depend on duplicate Game IDs.

The importer deliberately does not reorder articles, translate titles, or use
fuzzy similarity. Provider renames with stable Edition fingerprints are
reconciled through existing mappings; ambiguous regrouping fails atomically for
review.

Explicit beta, prototype, sample, demo, hack/translation, homebrew/aftermarket,
pirate, unlicensed, alternate-dump, and digital-service markers are excluded
and counted. Revision markers remain accepted Editions. This is conservative
but not a complete retail classifier; unmarked edge cases require future source
review rather than speculative inference.

These exclusions define Geek's initial consumer-retail catalog policy, not a
claim that excluded games never belong in Geek. In particular, physical
unlicensed, homebrew, and aftermarket releases may become valuable collector
catalog entries through a later explicitly reviewed import policy.

Regions come only from the source `region` field. Recognized multi-region
values are preserved as composite codes such as `EU+US`; unknown regions remain
null.

## Runs, access, and media

Successful real imports record provider revision, Platform, timestamps, and
summary in trusted-only `catalog_import_runs`. Dry runs write nothing. The
transactional RPC and run table are executable/readable only by `service_role`
tooling; no application package receives that credential.

The Libretro adapter emits zero CatalogMedia. In particular,
`libretro-thumbnails` is not acquired or used: its image repository has
heterogeneous third-party sources and no clear repository-wide publishable
image license. The normalized adapter contract has a provider-independent media
shape, but this import writer deliberately rejects nonempty media batches until
an explicitly licensed workflow owns that write path. A future licensed
provider can add normalized media behind the same adapter boundary without
changing Geek canonical identity or weakening CatalogMedia rights checks.
