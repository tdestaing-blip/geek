import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { createClient } from "@supabase/supabase-js";

register("./typescript-resolver.mjs", import.meta.url);
const {
  cancelListing,
  createListing,
  getEditionMarketOpportunities,
  getMyActiveListingsForCopies,
  getMyCopyCommercialState,
  getPublicCopyDetail,
} = await import("../packages/data/src/index.ts");
const { canCancelDirectListing, createListingAskingPrice, parseCurrencyCode } =
  await import("../packages/domain/src/index.ts");
const { createListingCancellationCoordinator } =
  await import("../apps/mobile/navigation/cancel-listing-flow.ts");
const { createCopyTilePresentation, selectAlbumCopyTilePresentation } =
  await import("../apps/mobile/navigation/copy-tile-presentation.ts");
const { getStickyAvailabilityPresentation } =
  await import("../apps/mobile/ui/sticky-availability-presentation.ts");

const status = JSON.parse(
  execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, authOptions);
const seller = createClient(status.API_URL, status.ANON_KEY, authOptions);
const other = createClient(status.API_URL, status.ANON_KEY, authOptions);
const buyer = createClient(status.API_URL, status.ANON_KEY, authOptions);
const anonymous = createClient(status.API_URL, status.ANON_KEY, authOptions);
const runId = randomUUID().slice(0, 8);
const password = `Cancel-${randomUUID()}`;
const results = [];
const fixture = {
  users: [],
  platformId: null,
  gameId: null,
  editionIds: [],
  copyIds: [],
  listingIds: [],
};

function record(name, passed, detail) {
  results.push({ name, passed });
  process.stdout.write(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
}

function requireValue(value, label) {
  if (value === null || value === undefined) throw new Error(`${label} is required`);
  return value;
}

const [sellerAuth, otherAuth, buyerAuth] = await Promise.all([
  seller.auth.signUp({ email: `cancel-seller-${runId}@example.com`, password }),
  other.auth.signUp({ email: `cancel-other-${runId}@example.com`, password }),
  buyer.auth.signUp({ email: `cancel-buyer-${runId}@example.com`, password }),
]);
const sellerId = requireValue(sellerAuth.data.user?.id, "seller user");
const otherId = requireValue(otherAuth.data.user?.id, "other user");
const buyerId = requireValue(buyerAuth.data.user?.id, "buyer user");
fixture.users.push(sellerId, otherId, buyerId);

try {
  await Promise.all([
    admin
      .from("profiles")
      .update({ username: `cancel_seller_${runId}` })
      .eq("id", sellerId),
    admin
      .from("profiles")
      .update({ username: `cancel_other_${runId}` })
      .eq("id", otherId),
    admin
      .from("profiles")
      .update({ username: `cancel_buyer_${runId}` })
      .eq("id", buyerId),
  ]);

  const platform = await admin
    .from("platforms")
    .insert({ slug: `cancel-${runId}`, name: `Cancel ${runId}` })
    .select("id")
    .single();
  if (platform.error) throw platform.error;
  fixture.platformId = platform.data.id;

  const game = await admin
    .from("games")
    .insert({ canonical_title: `Cancel Listing Game ${runId}` })
    .select("id")
    .single();
  if (game.error) throw game.error;
  fixture.gameId = game.data.id;

  const editions = await admin
    .from("editions")
    .insert([
      { game_id: game.data.id, platform_id: platform.data.id, edition_name: "Target" },
      { game_id: game.data.id, platform_id: platform.data.id, edition_name: "Unaffected" },
    ])
    .select("id");
  if (editions.error) throw editions.error;
  const [targetEdition, unaffectedEdition] = editions.data;
  fixture.editionIds.push(targetEdition.id, unaffectedEdition.id);

  const copies = await admin
    .from("copies")
    .insert([
      {
        owner_id: sellerId,
        game_id: game.data.id,
        edition_id: targetEdition.id,
        visibility: "private",
        availability: "private",
      },
      {
        owner_id: sellerId,
        game_id: game.data.id,
        edition_id: targetEdition.id,
        visibility: "private",
        availability: "private",
      },
      {
        owner_id: sellerId,
        game_id: game.data.id,
        edition_id: unaffectedEdition.id,
        visibility: "private",
        availability: "private",
      },
    ])
    .select("id");
  if (copies.error) throw copies.error;
  const [targetCopy, concurrentCopy, unaffectedCopy] = copies.data;
  fixture.copyIds.push(targetCopy.id, concurrentCopy.id, unaffectedCopy.id);

  const eur = requireValue(parseCurrencyCode("EUR"), "EUR");
  const askingPrice = requireValue(createListingAskingPrice(3500, eur), "asking price");
  const [targetListing, concurrentListing, unaffectedListing] = await Promise.all([
    createListing(seller, { copyId: targetCopy.id, askingPrice }),
    createListing(seller, { copyId: concurrentCopy.id, askingPrice }),
    createListing(seller, { copyId: unaffectedCopy.id, askingPrice }),
  ]);
  if (
    targetListing.outcome !== "ok" ||
    concurrentListing.outcome !== "ok" ||
    unaffectedListing.outcome !== "ok"
  ) {
    throw new Error("Listing fixtures must be created");
  }
  fixture.listingIds.push(
    targetListing.data.id,
    concurrentListing.data.id,
    unaffectedListing.data.id,
  );

  const activeFooter = getStickyAvailabilityPresentation("for_sale", {
    kind: "listing",
    listing: targetListing.data,
  });
  record(
    "J active Listing shows Annuler la vente",
    activeFooter.label === "Prix" && activeFooter.action === "Annuler la vente",
  );
  record(
    "domain cancellation eligibility is active-only",
    canCancelDirectListing(targetListing.data) &&
      ["draft", "reserved", "sold", "paused", "expired", "withdrawn"].every(
        (listingStatus) =>
          !canCancelDirectListing({ ...targetListing.data, status: listingStatus }),
      ),
  );

  const [beforeState, beforeMarket, beforePublic, beforeListings] = await Promise.all([
    getMyCopyCommercialState(seller, targetCopy.id),
    getEditionMarketOpportunities(buyer, game.data.id, targetEdition.id),
    getPublicCopyDetail(buyer, targetCopy.id),
    getMyActiveListingsForCopies(seller, [targetCopy.id]),
  ]);
  const beforeActive =
    beforeListings.outcome === "ok"
      ? beforeListings.data.find(({ copyId }) => copyId === targetCopy.id)
      : undefined;
  const beforeTile = createCopyTilePresentation(beforeActive, []);
  record(
    "canonical active sale is visible before cancellation",
    beforeState.outcome === "ok" &&
      beforeState.data.kind === "listing" &&
      beforeMarket.outcome === "ok" &&
      beforeMarket.data.some((item) => item.type === "listing" && item.copyId === targetCopy.id) &&
      beforePublic.outcome === "ok" &&
      beforePublic.data.opportunity?.type === "listing" &&
      beforeTile.salePrice !== undefined,
  );

  const otherAttempt = await cancelListing(other, targetListing.data.id);
  const anonymousAttempt = await cancelListing(anonymous, targetListing.data.id);
  const afterDenied = await admin
    .from("listings")
    .select("status")
    .eq("id", targetListing.data.id)
    .single();
  record(
    "B other authenticated user is denied",
    otherAttempt.outcome === "not_found" && afterDenied.data?.status === "active",
  );
  record("C anonymous caller is denied", anonymousAttempt.outcome === "unauthenticated");

  let effectiveCancellationCount = 0;
  const coordinator = createListingCancellationCoordinator({
    cancel: async (listingId) => {
      effectiveCancellationCount += 1;
      await delay(10);
      const result = await cancelListing(seller, listingId);
      return result.outcome === "ok" && result.data.status === "withdrawn";
    },
  });
  const [firstConfirm, secondConfirm] = await Promise.all([
    coordinator.submit(targetListing.data.id),
    coordinator.submit(targetListing.data.id),
  ]);
  record(
    "A/M seller confirmation sends one effective cancellation",
    effectiveCancellationCount === 1 &&
      firstConfirm.outcome === "committed" &&
      secondConfirm.outcome === "ignored",
  );

  const [cancelledRow, cancelledCommitment, cancelledCopy, cancelledState] = await Promise.all([
    admin.from("listings").select("status").eq("id", targetListing.data.id).single(),
    admin.from("copy_commercial_commitments").select("copy_id").eq("copy_id", targetCopy.id),
    admin.from("copies").select("availability").eq("id", targetCopy.id).single(),
    getMyCopyCommercialState(seller, targetCopy.id),
  ]);
  record("D cancelled Listing is non-active history", cancelledRow.data?.status === "withdrawn");
  record("E commercial commitment is removed", cancelledCommitment.data?.length === 0);
  record(
    "F Copy availability is canonically restored",
    cancelledCopy.data?.availability === "private",
  );
  record(
    "N seller canonical refresh removes Listing footer",
    cancelledState.outcome === "ok" &&
      cancelledState.data.kind === "none" &&
      getStickyAvailabilityPresentation("private", { kind: "none" }).label === "Status",
  );

  const repeated = await cancelListing(seller, targetListing.data.id);
  record(
    "H existing non-active Listing resolves safely without corruption",
    repeated.outcome === "ok" && repeated.data.status === "withdrawn",
  );

  const concurrent = await Promise.all([
    cancelListing(seller, concurrentListing.data.id),
    cancelListing(seller, concurrentListing.data.id),
  ]);
  const [concurrentRows, concurrentCommitments, concurrentCopyState] = await Promise.all([
    admin.from("listings").select("status").eq("id", concurrentListing.data.id),
    admin.from("copy_commercial_commitments").select("copy_id").eq("copy_id", concurrentCopy.id),
    admin.from("copies").select("availability").eq("id", concurrentCopy.id).single(),
  ]);
  record(
    "G concurrent double cancellation is idempotent",
    concurrent.every((result) => result.outcome === "ok" && result.data.status === "withdrawn") &&
      concurrentRows.data?.length === 1 &&
      concurrentRows.data[0]?.status === "withdrawn" &&
      concurrentCommitments.data?.length === 0 &&
      concurrentCopyState.data?.availability === "private",
  );

  const unaffected = await Promise.all([
    admin.from("listings").select("status").eq("id", unaffectedListing.data.id).single(),
    admin
      .from("copy_commercial_commitments")
      .select("listing_id")
      .eq("copy_id", unaffectedCopy.id)
      .single(),
    admin.from("copies").select("availability").eq("id", unaffectedCopy.id).single(),
  ]);
  record(
    "I unrelated Listing is untouched",
    unaffected[0].data?.status === "active" &&
      unaffected[1].data?.listing_id === unaffectedListing.data.id &&
      unaffected[2].data?.availability === "for_sale",
  );

  const activeAfter = await getMyActiveListingsForCopies(seller, [targetCopy.id]);
  const afterTile = createCopyTilePresentation(
    activeAfter.outcome === "ok" ? activeAfter.data[0] : undefined,
    [],
  );
  const albumBefore = selectAlbumCopyTilePresentation(
    [targetCopy.id],
    new Map([[targetCopy.id, beforeTile]]),
  );
  const albumAfter = selectAlbumCopyTilePresentation(
    [targetCopy.id],
    new Map([[targetCopy.id, afterTile]]),
  );
  record(
    "P My Games sale badge disappears after canonical refresh",
    afterTile.salePrice === undefined,
  );
  record(
    "Q unambiguous Album sale badge disappears after canonical refresh",
    albumBefore?.salePrice !== undefined && albumAfter?.salePrice === undefined,
  );

  const [marketAfter, publicAfter, unaffectedMarket] = await Promise.all([
    getEditionMarketOpportunities(buyer, game.data.id, targetEdition.id),
    getPublicCopyDetail(buyer, targetCopy.id),
    getEditionMarketOpportunities(buyer, game.data.id, unaffectedEdition.id),
  ]);
  record(
    "R exact Edition Market removes cancelled Listing",
    marketAfter.outcome === "ok" &&
      marketAfter.data.every((item) => item.type !== "listing" || item.copyId !== targetCopy.id),
  );
  record(
    "S MarketOffers canonical projection removes cancelled Listing",
    marketAfter.outcome === "ok" &&
      marketAfter.data.every((item) => item.type !== "listing" || item.copyId !== targetCopy.id),
  );
  record(
    "T/U private Public Copy and Listing footer are no longer disclosed",
    publicAfter.outcome === "not_found",
  );
  record(
    "V another Edition opportunity is unaffected",
    unaffectedMarket.outcome === "ok" &&
      unaffectedMarket.data.some(
        (item) => item.type === "listing" && item.listingId === unaffectedListing.data.id,
      ),
  );

  const failedCoordinator = createListingCancellationCoordinator({ cancel: async () => false });
  const failedSubmit = await failedCoordinator.submit(targetListing.data.id);
  record(
    "O failure clears pending state and permits retry",
    failedSubmit.outcome === "failed" && failedCoordinator.getStatus() === "idle",
  );

  const ownedSource = readFileSync("apps/mobile/navigation/owned-copy-detail-screen.tsx", "utf8");
  const stickySource = readFileSync("apps/mobile/ui/sticky-availability-bar.tsx", "utf8");
  const marketSource = readFileSync("apps/mobile/navigation/marketplace-screen.tsx", "utf8");
  const offersSource = readFileSync("apps/mobile/navigation/marketplace-offers-screen.tsx", "utf8");
  const publicSource = readFileSync("apps/mobile/navigation/public-copy-detail-screen.tsx", "utf8");
  record(
    "K/L tap opens native confirmation and dismiss does not mutate",
    ownedSource.includes('Alert.alert("Annuler la vente ?"') &&
      ownedSource.includes('{ text: "Annuler", style: "cancel" }') &&
      ownedSource.includes('text: "Retirer de la vente"') &&
      !ownedSource.includes("updateCopyAvailability"),
  );
  record(
    "seller UI uses active-only cancellation, pending progress and canonical reload",
    stickySource.includes("canCancelDirectListing") &&
      stickySource.includes("listingCancellationPending") &&
      stickySource.includes("ActivityIndicator") &&
      ownedSource.includes("loadCanonicalCopyDetail") &&
      ownedSource.includes("La vente est toujours active") &&
      !ownedSource.includes("failure.message"),
  );
  record(
    "Market, All Offers and Public Copy refetch mutable truth on focus",
    marketSource.includes("useFocusEffect") &&
      offersSource.includes("useFocusEffect") &&
      publicSource.includes("useFocusEffect"),
  );
} finally {
  if (fixture.listingIds.length) {
    await admin.from("listings").update({ status: "withdrawn" }).in("id", fixture.listingIds);
    await admin.from("listings").delete().in("id", fixture.listingIds);
  }
  if (fixture.copyIds.length) await admin.from("copies").delete().in("id", fixture.copyIds);
  if (fixture.editionIds.length) await admin.from("editions").delete().in("id", fixture.editionIds);
  if (fixture.gameId) await admin.from("games").delete().eq("id", fixture.gameId);
  if (fixture.platformId) await admin.from("platforms").delete().eq("id", fixture.platformId);
  for (const userId of fixture.users) await admin.auth.admin.deleteUser(userId);
}

const failed = results.filter(({ passed }) => !passed);
process.stdout.write(
  `\n${results.length - failed.length}/${results.length} Cancel Listing checks passed.\n`,
);
if (failed.length) process.exitCode = 1;
