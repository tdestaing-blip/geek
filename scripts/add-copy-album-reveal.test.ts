import assert from "node:assert/strict";
import test from "node:test";

import {
  createAddCopySubmissionCoordinator,
  findAlbumRevealRowIndex,
  findMatchingAlbumEntry,
  groupAlbumRevealEntriesIntoRows,
  parseEuroInput,
  resolveAlbumRevealEntryIndex,
  selectAlbumRevealTarget,
  shouldStageAlbumRevealEntry,
} from "../apps/mobile/navigation/add-copy-flow.ts";

const GAME_ID = "game-1";
const EDITION_ID = "edition-1";

test("euro input converts to integer minor units without floating-point money", () => {
  assert.deepEqual(parseEuroInput("12"), { valid: true, amountMinor: 1200 });
  assert.deepEqual(parseEuroInput("12.50"), { valid: true, amountMinor: 1250 });
  assert.deepEqual(parseEuroInput("12,5"), { valid: true, amountMinor: 1250 });
  assert.deepEqual(parseEuroInput(""), { valid: true, amountMinor: null });
  assert.deepEqual(parseEuroInput("12.501"), { valid: false });
  assert.deepEqual(parseEuroInput("-1"), { valid: false });
});

test("Album matching respects exact Edition targets and broad Game targets", () => {
  const exact = album("exact", "edition", EDITION_ID);
  const otherEdition = album("other", "edition", "edition-2");
  const broad = album("broad", "game", null);

  assert.equal(findMatchingAlbumEntry(exact, GAME_ID, EDITION_ID)?.id, "exact-entry");
  assert.equal(findMatchingAlbumEntry(otherEdition, GAME_ID, EDITION_ID), null);
  assert.equal(findMatchingAlbumEntry(broad, GAME_ID, EDITION_ID)?.id, "broad-entry");
});

test("Album resolution handles zero, one, and many matches without arbitrary selection", () => {
  const exact = album("exact", "edition", EDITION_ID);
  const broad = album("broad", "game", null);

  assert.deepEqual(selectAlbumRevealTarget([], GAME_ID, EDITION_ID), { kind: "none" });
  assert.equal(selectAlbumRevealTarget([exact], GAME_ID, EDITION_ID).kind, "one");
  assert.deepEqual(selectAlbumRevealTarget([exact, broad], GAME_ID, EDITION_ID), {
    kind: "multiple",
    count: 2,
  });
});

test("reveal resolves the exact canonical AlbumEntry and stages ownership visually only", () => {
  const exact = album("exact", "edition", EDITION_ID);
  const entry = exact.entries[0]!;

  assert.equal(resolveAlbumRevealEntryIndex(exact, entry.id, GAME_ID, EDITION_ID), 0);
  assert.equal(resolveAlbumRevealEntryIndex(exact, entry.id, GAME_ID, "edition-2"), null);
  assert.equal(resolveAlbumRevealEntryIndex(exact, "another-entry", GAME_ID, EDITION_ID), null);
  assert.equal(shouldStageAlbumRevealEntry(entry, entry.id, "album_staged"), true);
  assert.equal(shouldStageAlbumRevealEntry(entry, entry.id, "album_revealing"), true);
  assert.equal(shouldStageAlbumRevealEntry(entry, entry.id, "album_revealed"), false);
  assert.equal(entry.state.owned, true);
  assert.equal(exact.progress.ownedSlots, 1);
});

test("two-column reveal scrolling resolves exact Album entries through rendered rows", () => {
  const base = album("odd", "edition", EDITION_ID);
  const entries = Array.from({ length: 9 }, (_, index) => ({
    ...base.entries[0]!,
    id: `entry-${index}`,
    position: index + 1,
  }));
  const rows = groupAlbumRevealEntriesIntoRows(entries, 2);

  assert.deepEqual(
    rows.map((row) => row.entries.length),
    [2, 2, 2, 2, 1],
  );
  assert.equal(findAlbumRevealRowIndex(rows, "entry-0"), 0);
  assert.equal(findAlbumRevealRowIndex(rows, "entry-1"), 0);
  assert.equal(findAlbumRevealRowIndex(rows, "entry-4"), 2);
  assert.equal(findAlbumRevealRowIndex(rows, "entry-8"), 4);
  assert.equal(findAlbumRevealRowIndex(rows, "missing-entry"), null);

  const target = rows[2]!.entries[0]!;
  const sibling = rows[2]!.entries[1]!;
  assert.equal(shouldStageAlbumRevealEntry(target, target.id, "album_staged"), true);
  assert.equal(shouldStageAlbumRevealEntry(sibling, target.id, "album_staged"), false);
});

test("double confirmation creates one Copy and enrichment failure cannot reopen creation", async () => {
  let createCalls = 0;
  const coordinator = createAddCopySubmissionCoordinator({
    createCopy: async () => {
      createCalls += 1;
      await Promise.resolve();
      return { outcome: "ok", copyId: "copy-1" };
    },
    enrichCopy: async () => {
      throw new Error("transient enrichment failure");
    },
    persistPhotos: async () => true,
    resolveAlbums: async () => ({ kind: "none" }),
  });

  const [first, overlapping] = await Promise.all([coordinator.submit(), coordinator.submit()]);
  assert.equal(first.outcome, "committed");
  assert.equal(first.outcome === "committed" && first.enrichmentWarning, true);
  assert.deepEqual(overlapping, { outcome: "ignored" });
  assert.deepEqual(await coordinator.submit(), { outcome: "ignored" });
  assert.equal(createCalls, 1);
  assert.equal(coordinator.getStatus(), "committed");
});

test("creation failure creates no committed state and can be retried", async () => {
  let calls = 0;
  const coordinator = createAddCopySubmissionCoordinator({
    createCopy: async () => {
      calls += 1;
      return calls === 1 ? { outcome: "failed" } : { outcome: "ok", copyId: "copy-after-retry" };
    },
    enrichCopy: async () => true,
    persistPhotos: async () => true,
    resolveAlbums: async () => ({ kind: "none" }),
  });

  assert.deepEqual(await coordinator.submit(), { outcome: "creation_failed" });
  assert.equal((await coordinator.submit()).outcome, "committed");
  assert.equal(calls, 2);
});

test("photo persistence begins only after Copy creation and cannot recreate after partial failure", async () => {
  const calls: string[] = [];
  const coordinator = createAddCopySubmissionCoordinator({
    createCopy: async () => {
      calls.push("copy");
      return { outcome: "ok", copyId: "copy-1" };
    },
    enrichCopy: async () => {
      calls.push("enrichment");
      return true;
    },
    persistPhotos: async () => {
      calls.push("photos");
      return false;
    },
    resolveAlbums: async () => {
      calls.push("albums");
      return { kind: "none" };
    },
  });

  const result = await coordinator.submit();
  assert.deepEqual(calls, ["copy", "enrichment", "photos", "albums"]);
  assert.equal(result.outcome === "committed" && result.photoWarning, true);
  assert.deepEqual(await coordinator.submit(), { outcome: "ignored" });
  assert.equal(calls.filter((call) => call === "copy").length, 1);
});

test("failed Copy creation uploads no photos", async () => {
  let photoCalls = 0;
  const coordinator = createAddCopySubmissionCoordinator({
    createCopy: async () => ({ outcome: "failed" }),
    enrichCopy: async () => true,
    persistPhotos: async () => {
      photoCalls += 1;
      return true;
    },
    resolveAlbums: async () => ({ kind: "none" }),
  });

  assert.deepEqual(await coordinator.submit(), { outcome: "creation_failed" });
  assert.equal(photoCalls, 0);
});

function album(id: string, targetKind: "game" | "edition", editionId: string | null) {
  if (targetKind === "edition" && editionId === null) {
    throw new Error("An Edition Album fixture requires an Edition id");
  }
  const target =
    targetKind === "game"
      ? {
          kind: "game" as const,
          gameId: GAME_ID,
          gameTitle: "Game",
          editionId: null,
        }
      : {
          kind: "edition" as const,
          gameId: GAME_ID,
          gameTitle: "Game",
          editionId,
          editionName: "Standard",
          regionCode: "EU",
          platformId: "platform-1",
          platformName: "Platform",
        };
  return {
    id,
    slug: id,
    title: id,
    description: null,
    targetKind,
    progress: {
      totalSlots: 1,
      ownedSlots: 1,
      missingSlots: 0,
      wantedSlots: 0,
      completionRatio: 1,
    },
    entries: [
      {
        id: `${id}-entry`,
        position: 1,
        target,
        state: { owned: true, missing: false, wanted: false },
        network: { collectorCount: 0, tradeCollectorCount: 0, activeListingCount: 0 },
      },
    ],
  };
}
