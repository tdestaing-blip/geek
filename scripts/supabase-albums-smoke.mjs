import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { register } from "node:module";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

register("./typescript-resolver.mjs", import.meta.url);
const {
  addQuickCopy,
  addWishlistIntent,
  getAlbumDetail,
  getAlbums,
  setCopyEdition,
  updateWishlistIntent,
} = await import("../packages/data/src/index.ts");

const status = JSON.parse(
  execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const anonymous = createClient(status.API_URL, status.ANON_KEY, options);
const clients = [
  createClient(status.API_URL, status.ANON_KEY, options),
  createClient(status.API_URL, status.ANON_KEY, options),
  createClient(status.API_URL, status.ANON_KEY, options),
];
const runId = randomUUID().slice(0, 8);
const password = `Albums-${randomUUID()}`;
const results = [];

function record(name, passed, detail) {
  results.push({ name, passed });
  process.stdout.write(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
}

const users = [];
for (const [index, client] of clients.entries()) {
  const auth = await client.auth.signUp({
    email: `albums-${index}-${runId}@example.com`,
    password,
  });
  users.push(auth.data.user.id);
}
const [ownerId, collectorOneId, collectorTwoId] = users;
const [owner, collectorOne, collectorTwo] = clients;
const fixture = { albums: [], games: [], editions: [], platform: null, listings: [] };

try {
  const platform = await admin
    .from("platforms")
    .insert({ slug: `albums-${runId}`, name: `Album Platform ${runId}` })
    .select("id")
    .single();
  fixture.platform = platform.data.id;
  const games = await admin
    .from("games")
    .insert([
      { canonical_title: `Album Game A ${runId}` },
      { canonical_title: `Album Game B ${runId}` },
    ])
    .select("id");
  const [gameA, gameB] = games.data;
  fixture.games.push(gameA.id, gameB.id);
  const editions = await admin
    .from("editions")
    .insert([
      {
        game_id: gameA.id,
        platform_id: platform.data.id,
        edition_name: "PAL",
        region_code: "PAL-FR",
      },
      {
        game_id: gameA.id,
        platform_id: platform.data.id,
        edition_name: "NTSC",
        region_code: "NTSC-J",
      },
      { game_id: gameB.id, platform_id: platform.data.id, edition_name: "B" },
    ])
    .select("id, game_id");
  const [pal, ntsc, editionB] = editions.data;
  fixture.editions.push(pal.id, ntsc.id, editionB.id);

  const albums = await admin
    .from("albums")
    .insert([
      {
        slug: `game-album-${runId}`,
        title: "Game Album",
        target_kind: "game",
        editorial_position: 1,
      },
      {
        slug: `edition-album-${runId}`,
        title: "Edition Album",
        target_kind: "edition",
        editorial_position: 2,
      },
      {
        slug: `draft-album-${runId}`,
        title: "Draft Album",
        target_kind: "game",
        editorial_position: 3,
      },
      {
        slug: `empty-album-${runId}`,
        title: "Empty Album",
        target_kind: "game",
        editorial_position: 4,
      },
      {
        slug: `race-album-${runId}`,
        title: "Race Album",
        target_kind: "game",
        editorial_position: 5,
      },
    ])
    .select("id, slug");
  if (albums.error !== null) throw albums.error;
  const [gameAlbum, editionAlbum, draftAlbum, emptyAlbum, raceAlbum] = albums.data;
  fixture.albums.push(gameAlbum.id, editionAlbum.id, draftAlbum.id, emptyAlbum.id, raceAlbum.id);
  const entries = await admin
    .from("album_entries")
    .insert([
      { album_id: gameAlbum.id, position: 1, game_id: gameA.id },
      { album_id: gameAlbum.id, position: 2, game_id: gameB.id },
      { album_id: editionAlbum.id, position: 1, game_id: gameA.id, edition_id: pal.id },
      { album_id: editionAlbum.id, position: 2, game_id: gameA.id, edition_id: ntsc.id },
      { album_id: draftAlbum.id, position: 1, game_id: gameA.id },
      { album_id: raceAlbum.id, position: 1, game_id: gameA.id },
    ])
    .select("id, album_id");
  await admin
    .from("albums")
    .update({ publication_state: "published" })
    .in("id", [gameAlbum.id, editionAlbum.id]);

  const forbiddenCreate = await owner.from("albums").insert({
    slug: `forbidden-${runId}`,
    title: "Forbidden",
    target_kind: "game",
  });
  const forbiddenUpdate = await owner
    .from("albums")
    .update({ title: "Changed" })
    .eq("id", gameAlbum.id);
  const forbiddenDelete = await owner.from("albums").delete().eq("id", gameAlbum.id);
  const forbiddenEntry = await owner.from("album_entries").insert({
    album_id: gameAlbum.id,
    position: 3,
    game_id: gameA.id,
  });
  record(
    "normal users cannot mutate Albums or entries",
    forbiddenCreate.error !== null &&
      forbiddenUpdate.error !== null &&
      forbiddenDelete.error !== null &&
      forbiddenEntry.error !== null,
  );

  const publishEmpty = await admin
    .from("albums")
    .update({ publication_state: "published" })
    .eq("id", emptyAlbum.id);
  record("empty Albums cannot be published", publishEmpty.error?.code === "23514");

  const raceEntry = entries.data.find((entry) => entry.album_id === raceAlbum.id);
  const [concurrentPublish, concurrentDelete] = await Promise.all([
    admin.from("albums").update({ publication_state: "published" }).eq("id", raceAlbum.id),
    admin.from("album_entries").delete().eq("id", raceEntry.id),
  ]);
  const raceAlbumAfter = await admin
    .from("albums")
    .select("publication_state, album_entries(id)")
    .eq("id", raceAlbum.id)
    .single();
  record(
    "concurrent publication and final-entry deletion cannot create an empty published Album",
    !(concurrentPublish.error === null && concurrentDelete.error === null) &&
      !(
        raceAlbumAfter.data.publication_state === "published" &&
        raceAlbumAfter.data.album_entries.length === 0
      ),
  );

  const [concurrentKindChange, concurrentEntryInsert] = await Promise.all([
    admin.from("albums").update({ target_kind: "edition" }).eq("id", emptyAlbum.id),
    admin.from("album_entries").insert({
      album_id: emptyAlbum.id,
      position: 1,
      game_id: gameA.id,
    }),
  ]);
  const targetRaceAfter = await admin
    .from("albums")
    .select("target_kind, album_entries(edition_id)")
    .eq("id", emptyAlbum.id)
    .single();
  record(
    "concurrent target-kind and entry mutations cannot create mixed granularity",
    !(concurrentKindChange.error === null && concurrentEntryInsert.error === null) &&
      !(
        targetRaceAfter.data.target_kind === "edition" &&
        targetRaceAfter.data.album_entries.some((entry) => entry.edition_id === null)
      ),
  );

  const anonymousAlbums = await anonymous.from("albums").select("id, slug");
  const anonymousEntries = await anonymous.from("album_entries").select("album_id");
  record(
    "draft Album and entries are hidden while published definitions are public",
    anonymousAlbums.data.some((album) => album.id === gameAlbum.id) &&
      !anonymousAlbums.data.some((album) => album.id === draftAlbum.id) &&
      !anonymousEntries.data.some((entry) => entry.album_id === draftAlbum.id),
  );

  const duplicatePosition = await admin.from("album_entries").insert({
    album_id: gameAlbum.id,
    position: 1,
    game_id: gameB.id,
  });
  const duplicateGame = await admin.from("album_entries").insert({
    album_id: gameAlbum.id,
    position: 3,
    game_id: gameA.id,
  });
  const wrongGranularity = await admin.from("album_entries").insert({
    album_id: gameAlbum.id,
    position: 3,
    game_id: gameA.id,
    edition_id: pal.id,
  });
  const crossGameEdition = await admin.from("album_entries").insert({
    album_id: editionAlbum.id,
    position: 3,
    game_id: gameA.id,
    edition_id: editionB.id,
  });
  record(
    "position target granularity and Edition-Game invariants are database-enforced",
    duplicatePosition.error?.code === "23505" &&
      duplicateGame.error?.code === "23505" &&
      wrongGranularity.error?.code === "23514" &&
      crossGameEdition.error?.code === "23503",
    [
      duplicatePosition.error?.code,
      duplicateGame.error?.code,
      wrongGranularity.error?.code,
      crossGameEdition.error?.code,
    ].join(","),
  );

  const quick = await addQuickCopy(owner, gameA.id);
  const listAfterQuick = await getAlbums(owner);
  const gameSummary =
    listAfterQuick.outcome === "ok"
      ? listAfterQuick.data.items.find((album) => album.id === gameAlbum.id)
      : null;
  const editionSummary =
    listAfterQuick.outcome === "ok"
      ? listAfterQuick.data.items.find((album) => album.id === editionAlbum.id)
      : null;
  record(
    "published Game and Edition Albums calculate Quick Copy ownership correctly",
    gameSummary?.progress.ownedSlots === 1 &&
      gameSummary.progress.missingSlots === 1 &&
      editionSummary?.progress.ownedSlots === 0,
  );

  const secondQuick = await addQuickCopy(owner, gameA.id);
  const afterDuplicate = await getAlbumDetail(owner, gameAlbum.slug);
  record(
    "multiple Copies fill one ordered Game slot once",
    afterDuplicate.outcome === "ok" &&
      afterDuplicate.data.progress.ownedSlots === 1 &&
      afterDuplicate.data.entries.map((entry) => entry.position).join(",") === "1,2",
  );
  const beyondLastPage = await getAlbumDetail(owner, gameAlbum.slug, { offset: 50 });
  record(
    "Album detail preserves metadata and progress on an empty bounded page",
    beyondLastPage.outcome === "ok" &&
      beyondLastPage.data.entries.length === 0 &&
      beyondLastPage.data.progress.totalSlots === 2,
  );

  await setCopyEdition(owner, quick.data.id, pal.id);
  const editionAfterEnrichment = await getAlbumDetail(owner, editionAlbum.id);
  record(
    "enriching a Quick Copy immediately fills its exact Edition slot",
    editionAfterEnrichment.outcome === "ok" &&
      editionAfterEnrichment.data.entries.find((entry) => entry.target.editionId === pal.id)?.state
        .owned === true &&
      editionAfterEnrichment.data.entries.find((entry) => entry.target.editionId === ntsc.id)?.state
        .missing === true,
  );

  const broad = await addWishlistIntent(owner, {
    gameId: gameA.id,
    preferredRegionCode: "PAL-FR",
  });
  if (broad.outcome !== "ok") throw new Error("failed to create broad Album fixture intent");
  const wantedByBroad = await getAlbumDetail(owner, editionAlbum.slug);
  record(
    "broad region intent marks only the compatible exact Edition wanted",
    wantedByBroad.outcome === "ok" &&
      wantedByBroad.data.entries.find((entry) => entry.target.editionId === pal.id)?.state
        .wanted === true &&
      wantedByBroad.data.entries.find((entry) => entry.target.editionId === ntsc.id)?.state
        .wanted === false,
  );
  const exact = await addWishlistIntent(owner, { gameId: gameA.id, editionId: ntsc.id });
  const wantedExact = await getAlbumDetail(owner, editionAlbum.id);
  record(
    "exact intent marks its Edition and owned plus wanted may coexist",
    wantedExact.outcome === "ok" &&
      wantedExact.data.entries.find((entry) => entry.target.editionId === ntsc.id)?.state.wanted ===
        true &&
      wantedExact.data.entries.find((entry) => entry.target.editionId === pal.id)?.state.owned ===
        true &&
      wantedExact.data.entries.find((entry) => entry.target.editionId === pal.id)?.state.wanted ===
        true,
  );
  await updateWishlistIntent(owner, exact.data.id, { status: "archived" });
  const afterArchive = await getAlbumDetail(owner, editionAlbum.id);
  record(
    "archived intent stops contributing while active broad intent still marks Game wanted",
    afterArchive.outcome === "ok" &&
      afterArchive.data.entries.find((entry) => entry.target.editionId === ntsc.id)?.state
        .wanted === false &&
      (await getAlbumDetail(owner, gameAlbum.id)).data.entries[0].state.wanted === true,
  );

  const transferable = await addQuickCopy(owner, gameB.id);
  const beforeTransfer = await getAlbums(owner);
  await admin.from("copies").update({ owner_id: collectorOneId }).eq("id", transferable.data.id);
  const afterTransfer = await getAlbums(owner);
  record(
    "ownership transfer changes progress immediately without stored state",
    beforeTransfer.outcome === "ok" &&
      beforeTransfer.data.items.find((album) => album.id === gameAlbum.id)?.progress.ownedSlots ===
        2 &&
      afterTransfer.outcome === "ok" &&
      afterTransfer.data.items.find((album) => album.id === gameAlbum.id)?.progress.ownedSlots ===
        1,
  );

  const hidden = await addQuickCopy(collectorOne, gameA.id);
  const hiddenDetail = await getAlbumDetail(owner, gameAlbum.id);
  const hiddenSignal = hiddenDetail.data.entries[0].network;
  record(
    "hidden private non-actionable inventory does not affect network counts",
    hiddenDetail.outcome === "ok" && hiddenSignal.collectorCount === 0,
  );

  await collectorOne.from("copies").update({ visibility: "public" }).eq("id", hidden.data.id);
  await collectorOne.from("copies").update({ visibility: "public" }).eq("id", secondQuick.data.id);
  const publicDetail = await getAlbumDetail(owner, gameAlbum.id);
  record(
    "public duplicate Copies count their collector once",
    publicDetail.outcome === "ok" &&
      publicDetail.data.entries[0].network.collectorCount === 1 &&
      publicDetail.data.entries[0].network.tradeCollectorCount === 0,
  );

  const actionable = await collectorTwo
    .from("copies")
    .insert({
      owner_id: collectorTwoId,
      game_id: gameA.id,
      edition_id: pal.id,
      visibility: "private",
      availability: "open_to_trade",
    })
    .select("id")
    .single();
  const actionableDetail = await getAlbumDetail(owner, gameAlbum.id);
  record(
    "private collection open-to-trade Copy contributes only safe aggregate activity",
    actionableDetail.outcome === "ok" &&
      actionableDetail.data.entries[0].network.collectorCount === 2 &&
      actionableDetail.data.entries[0].network.tradeCollectorCount === 1,
  );

  const listing = await admin
    .from("listings")
    .insert({
      copy_id: actionable.data.id,
      seller_id: collectorTwoId,
      asking_amount_minor: 4200,
      asking_currency: "EUR",
      status: "active",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  fixture.listings.push(listing.data.id);
  const listedDetail = await getAlbumDetail(owner, editionAlbum.id);
  const palSignal = listedDetail.data.entries.find(
    (entry) => entry.target.editionId === pal.id,
  ).network;
  record(
    "valid Listing drives sale aggregate and removes trade aggregate",
    listedDetail.outcome === "ok" &&
      palSignal.activeListingCount === 1 &&
      palSignal.tradeCollectorCount === 0,
  );
  await admin.from("listings").update({ status: "withdrawn" }).eq("id", listing.data.id);
  const closedListingDetail = await getAlbumDetail(owner, editionAlbum.id);
  record(
    "closed Listing disappears immediately and availability alone never manufactures sale signal",
    closedListingDetail.outcome === "ok" &&
      closedListingDetail.data.entries.find((entry) => entry.target.editionId === pal.id).network
        .activeListingCount === 0,
  );

  const ownListing = await admin
    .from("listings")
    .insert({
      copy_id: quick.data.id,
      seller_id: ownerId,
      asking_amount_minor: 4300,
      asking_currency: "EUR",
      status: "active",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  fixture.listings.push(ownListing.data.id);
  const ownListingDetail = await getAlbumDetail(owner, editionAlbum.id);
  record(
    "the caller own Copies and Listings are excluded from network signals",
    ownListingDetail.outcome === "ok" &&
      ownListingDetail.data.entries.find((entry) => entry.target.editionId === pal.id).network
        .activeListingCount === 0,
  );
  await admin.from("listings").update({ status: "withdrawn" }).eq("id", ownListing.data.id);

  const quickOnlyExact = await getAlbumDetail(owner, editionAlbum.id);
  const ntscSignal = quickOnlyExact.data.entries.find(
    (entry) => entry.target.editionId === ntsc.id,
  ).network;
  record(
    "Quick Copies contribute to Game signals but never fabricate exact Edition signals",
    quickOnlyExact.outcome === "ok" && ntscSignal.collectorCount === 0,
  );

  const serialized = JSON.stringify(await getAlbumDetail(owner, gameAlbum.id));
  record(
    "Album output exposes no private Copy Wishlist geography or auth data",
    ![
      "private_notes",
      "storage_location",
      "max_trade_distance",
      "max_purchase",
      "latitude",
      "longitude",
      "email",
      "owner_id",
    ].some((field) => serialized.includes(field)),
  );

  const absentProgressTables = await Promise.all(
    ["user_albums", "album_progress", "album_completion", "album_slot_state"].map((table) =>
      admin.from(table).select("*").limit(1),
    ),
  );
  record(
    "no persisted user Album progress or slot-state table exists",
    absentProgressTables.every((result) => result.error !== null),
  );

  const anonymousProgress = await getAlbums(anonymous);
  record(
    "Album progress cannot be requested anonymously",
    anonymousProgress.outcome === "unauthenticated",
  );
} finally {
  if (fixture.listings.length) {
    await admin.from("listings").update({ status: "withdrawn" }).in("id", fixture.listings);
  }
  if (fixture.albums.length) {
    await admin.from("albums").update({ publication_state: "draft" }).in("id", fixture.albums);
    await admin.from("albums").delete().in("id", fixture.albums);
  }
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
  if (fixture.editions.length) await admin.from("editions").delete().in("id", fixture.editions);
  if (fixture.games.length) await admin.from("games").delete().in("id", fixture.games);
  if (fixture.platform) await admin.from("platforms").delete().eq("id", fixture.platform);
}

const failed = results.filter((result) => !result.passed);
process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
process.exitCode = failed.length === 0 ? 0 : 1;
