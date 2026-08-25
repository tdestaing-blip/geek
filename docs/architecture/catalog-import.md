# Catalog import

Geek owns canonical Game, Edition, and Platform UUIDs. External providers supply
evidence and metadata through generic mappings; their identifiers never become
Geek primary keys and application code does not depend on provider formats.

The import flow is:

```text
local provider checkout
-> provider adapter
-> normalized platform/game/edition/identifier records
-> trusted database writer
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

## MobyGames source evidence

The MobyGames adapter is server-side tooling. It reads `MOBYGAMES_API_KEY`
only from the importer process environment and calls the official game,
game/platform, and covers endpoints. Mobile and web bundles never receive the
credential or call MobyGames directly. The default request interval is five
seconds, requests are sequential, and retries are bounded to transient network
errors plus HTTP 429/5xx responses.

Run a reviewed Game and Platform pair in dry-run mode before writing locally:

```sh
MOBYGAMES_API_KEY=... pnpm catalog:import:mobygames -- \
  --game-id 3550 \
  --platform-id 9 \
  --dry-run

MOBYGAMES_API_KEY=... pnpm catalog:import:mobygames -- \
  --game-id 3550 \
  --platform-id 9
```

Dry-run fetches and derives the plan but cannot invoke the trusted database
writer. Real mode first upserts the current raw resources into trusted-only
`catalog_source_records`, using `(provider, record_type, source_key)` as Geek's
resource identity. `source_key` is internal reconciliation metadata and is not
presented as a provider ID. An unchanged checksum refreshes `fetched_at`
without incrementing the revision; a changed checksum replaces the current
payload and increments it. Historical snapshots are deliberately out of scope.

`platform_provider_mappings` resolves MobyGames Platform 9 to Geek's existing
`nintendo-64` Platform. `game_provider_mappings` retains MobyGames Game
identity. MobyGames does not provide stable Edition IDs, so canonical Editions
instead link to one or more child records through `edition_source_evidence`.
Evidence fingerprints are Geek-owned internal locators, never MobyGames IDs.
One MobyGames release, product code, or cover group is therefore evidence, not
automatically one Geek Edition. Product codes remain optional, and this
importer introduces no `PackagingVariant`; packaging distinctions remain
source evidence unless approved physical identity and explicit variant
semantics establish an Edition.
If changed evidence cannot be reconciled with exactly one canonical Edition,
the candidate is skipped as ambiguous rather than creating a duplicate or
replacing identity. The writer is source-first and idempotently resumable: a
failure may leave newer trusted source evidence without a successful import
run, and the same plan can safely be retried.

Edition grouping partitions release evidence by Platform and explicit collector
variant, then forms connected components using explicitly recognized strong
physical-media identifiers. Region coverage is derived afterward, so one exact
physical identity distributed across Australia and New Zealand becomes a
deterministic `AU+NZ` candidate rather than duplicate country Editions.
Nintendo Media PN is currently strong; UPC-A and EAN-13 are corroborating
package/product identifiers; ASIN, eBay Product ID, unknown code types, and
generic publisher product codes are weak. Corroborating or weak identifiers are
preserved but cannot bridge contradictory strong identities. This
classification is deliberately closed: unknown code types gain no identity
strength by inference.

Dates and publisher identity support review but are not flat grouping keys.
Country launch dates and distributor differences alone do not split an
Edition. Multiple localized European release and cover rows may support one
`EU` Edition when they share physical identity; Europe is never inferred as
France. Explicit variants such as Preorder, Collector's Edition, Players
Choice, and Limited Edition remain distinct even when a physical-media code is
shared. Cover groups attach only when region and variant evidence identify one
candidate; otherwise they stay unresolved. A release without a strong ID joins
a strong partition only through a unique exact overlap in corroborating UPC-A
or EAN-13 evidence and compatible derived region coverage. Region,
null/Standard variant, dates, publisher, distributor, array position, and weak
commerce identifiers are never sufficient by elimination. Without positive
corroborating evidence, the release becomes source-ambiguous even when only one
strong partition exists. Ambiguous candidates are reported and never
canonicalized.

Every candidate also needs positive evidence that it represents a physical
collector object. A recognized strong physical-media identifier satisfies that
requirement. Without one, region, an explicit variant label, dates, companies,
response uniqueness, UPC-A/EAN-13, and generic cover geography remain
insufficient. The current conservative exception is a physical Front/Back Cover
scan whose non-generic variant label and region identify exactly one matching
candidate; this is recorded as variant-specific package evidence. It does not
make covers generally authoritative and does not promote EAN-only candidates.
Unsupported country labels remain in raw source evidence. Supported Mexico
evidence normalizes to `MX`; MobyGames' non-country `Other` label is preserved
only in the source payload.

Canonical reconciliation follows a separate conservative order. Existing
MobyGames source-evidence links are strongest for repeat imports. Otherwise an
exact typed strong-identifier match may reuse an Edition only when no
conflicting strong identity or variant collision exists. MobyGames exposes no
stable Edition provider ID, so the importer never synthesizes one. A matching
Game, Platform, region, and Edition name detects only a possible collision; it
is never sufficient proof for mutation. An unproven coarse collision is
reported as `RECONCILIATION_AMBIGUOUS`, and the importer neither enriches the
existing row nor silently creates a near-duplicate. Dry-run output exposes the
candidate evidence tiers, release dates, cover association, grouping reasons,
ambiguities, and reconciliation status without credentials or provider request
URLs.

Only Front Cover and Back Cover scans map to current CatalogMedia roles. Other
cover scans remain intact in the source payload. MobyGames image URLs are
retained directly with provider attribution, an internal URL fingerprint for
deduplication, and `restricted` rights status. They are therefore importer
evidence, not Copy photos, and are not exposed by the public CatalogMedia RLS
policy. Any future product publication must use rights appropriate to the
active MobyGames plan and retain the required “Data by MobyGames.com” credit.
