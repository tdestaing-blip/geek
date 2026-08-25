import assert from "node:assert/strict";
import test from "node:test";

import type { CatalogMedia, Edition, Game, Platform } from "@geek/domain";

import {
  buildGamePlatformResults,
  buildGameRegionVariants,
  getCatalogRegionPresentation,
  resolveCanonicalMarket,
} from "../apps/mobile/navigation/canonical-catalog.ts";

const game: Game = {
  id: "game-ocarina",
  canonicalTitle: "The Legend of Zelda: Ocarina of Time",
  description: null,
  originalReleaseDate: null,
};
const platform: Platform = { id: "platform-n64", slug: "nintendo-64", name: "Nintendo 64" };
const editions: readonly Edition[] = [
  edition("edition-us-standard", "US", null),
  edition("edition-us-collector", "US", "Preorder + Collector's Edition"),
  edition("edition-players-choice", "CA+MX+US", "Players Choice"),
  edition("edition-eu", "EU", null),
  edition("edition-au-nz", "AU+NZ", "Collector's Edition"),
  edition("edition-jp", "JP", null),
];

test("Game + Platform projection groups canonical Editions into one row", () => {
  const results = buildGamePlatformResults([game], [...editions, editions[0]!], [platform], []);
  assert.deepEqual(results, [
    {
      gameId: game.id,
      platformId: platform.id,
      title: game.canonicalTitle,
      platformName: platform.name,
      platformSlug: platform.slug,
      editionCount: 6,
      artworkUrl: null,
    },
  ]);
});

test("Game region projection preserves every canonical Edition and compound region", () => {
  const rows = buildGameRegionVariants(game, platform, editions, [], null);
  assert.equal(rows.length, 6);
  assert.notEqual(rows[0]?.editionId, rows[2]?.editionId);
  assert.equal(
    rows.find(({ editionId }) => editionId === "edition-players-choice")?.regionCode,
    "CA+MX+US",
  );
  assert.equal(rows.find(({ editionId }) => editionId === "edition-au-nz")?.regionCode, "AU+NZ");
  assert.equal(getCatalogRegionPresentation("EU").label, "EU");
});

test("canonical Market resolver accepts arbitrary consistent IDs and rejects mismatches", () => {
  const edition = editions[0]!;
  assert.equal(resolveCanonicalMarket(game, edition, platform, null, null)?.edition.id, edition.id);
  assert.equal(
    resolveCanonicalMarket({ ...game, id: "another-game" }, edition, platform, null, null),
    null,
  );
  assert.equal(
    resolveCanonicalMarket(game, edition, { ...platform, id: "another-platform" }, null, null),
    null,
  );
});

test("missing canonical inputs never produce a fixture fallback", () => {
  assert.deepEqual(buildGamePlatformResults([], editions, [platform], []), []);
  assert.deepEqual(buildGameRegionVariants(game, platform, [], [], null), []);
});

test("only provided publishable CatalogMedia can become projected artwork", () => {
  const cover = catalogCover();
  assert.equal(
    buildGamePlatformResults([game], editions, [platform], [cover])[0]?.artworkUrl,
    cover.assetUrl,
  );
  assert.equal(buildGamePlatformResults([game], editions, [platform], [])[0]?.artworkUrl, null);
});

function edition(id: string, regionCode: string, editionName: string | null): Edition {
  return {
    id,
    gameId: game.id,
    platformId: platform.id,
    editionName,
    regionCode,
    supportedLanguages: [],
    releaseDate: null,
    publisherName: null,
    packagingType: null,
  };
}

function catalogCover(): CatalogMedia {
  return {
    id: "media-cover",
    gameId: game.id,
    editionId: null,
    kind: "cover_front",
    assetUrl: "https://catalog.invalid/cover.png",
    sourceProvider: "test",
    sourceAssetId: null,
    sourcePageUrl: null,
    rightsStatus: "reusable",
    licenseName: null,
    licenseUrl: null,
    attribution: null,
    width: null,
    height: null,
    isPrimary: true,
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
  };
}
