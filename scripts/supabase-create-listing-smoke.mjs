import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { createClient } from "@supabase/supabase-js";

register("./typescript-resolver.mjs", import.meta.url);
const {
  createListing,
  getEditionMarketOpportunities,
  getMyActiveListingsForCopies,
  getMyCopyCommercialState,
  getMyCopyPhotoRoles,
  getPublicCopyDetail,
} = await import("../packages/data/src/index.ts");
const { canCreateDirectListing, createListingAskingPrice, parseCurrencyCode } =
  await import("../packages/domain/src/index.ts");
const { createListingSubmissionCoordinator, parseListingPriceInput } =
  await import("../apps/mobile/navigation/create-listing-flow.ts");
const {
  copyTilePresentationsOrEmpty,
  createCopyTilePresentation,
  selectAlbumCopyTilePresentation,
} = await import("../apps/mobile/navigation/copy-tile-presentation.ts");
const { formatMoney } = await import("../apps/mobile/ui/format-money.ts");
const { getStickyAvailabilityPresentation } =
  await import("../apps/mobile/ui/sticky-availability-presentation.ts");

const status = JSON.parse(
  execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
const databaseContainer = execFileSync("docker", ["ps", "--format", "{{.Names}}"], {
  encoding: "utf8",
})
  .split("\n")
  .find((name) => name.startsWith("supabase_db_"));
if (!databaseContainer) throw new Error("Local Supabase database container is unavailable");
const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, authOptions);
const owner = createClient(status.API_URL, status.ANON_KEY, authOptions);
const other = createClient(status.API_URL, status.ANON_KEY, authOptions);
const buyer = createClient(status.API_URL, status.ANON_KEY, authOptions);
const anonymous = createClient(status.API_URL, status.ANON_KEY, authOptions);
const runId = randomUUID().slice(0, 8);
const password = `Listing-${randomUUID()}`;
const results = [];
const fixture = {
  users: [],
  platformId: null,
  gameIds: [],
  editionIds: [],
  copyIds: [],
  listingIds: [],
  auctionIds: [],
  tradeOfferId: null,
  photoIds: [],
  photoPaths: [],
};

function record(name, passed, detail) {
  results.push({ name, passed });
  process.stdout.write(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
}

function requireValue(value, label) {
  if (value === null || value === undefined) throw new Error(`${label} is required`);
  return value;
}

const [ownerAuth, otherAuth, buyerAuth] = await Promise.all([
  owner.auth.signUp({ email: `listing-owner-${runId}@example.com`, password }),
  other.auth.signUp({ email: `listing-other-${runId}@example.com`, password }),
  buyer.auth.signUp({ email: `listing-buyer-${runId}@example.com`, password }),
]);
const ownerId = requireValue(ownerAuth.data.user?.id, "owner user");
const otherId = requireValue(otherAuth.data.user?.id, "other user");
const buyerId = requireValue(buyerAuth.data.user?.id, "buyer user");
fixture.users.push(ownerId, otherId, buyerId);

try {
  await Promise.all([
    admin
      .from("profiles")
      .update({ username: `listing_owner_${runId}` })
      .eq("id", ownerId),
    admin
      .from("profiles")
      .update({ username: `listing_other_${runId}` })
      .eq("id", otherId),
    admin
      .from("profiles")
      .update({ username: `listing_buyer_${runId}` })
      .eq("id", buyerId),
  ]);

  const platform = await admin
    .from("platforms")
    .insert({ slug: `listing-${runId}`, name: `Listing ${runId}` })
    .select("id")
    .single();
  if (platform.error) throw platform.error;
  fixture.platformId = platform.data.id;

  const game = await admin
    .from("games")
    .insert({ canonical_title: `Listing Game ${runId}` })
    .select("id")
    .single();
  if (game.error) throw game.error;
  fixture.gameIds.push(game.data.id);

  const editions = await admin
    .from("editions")
    .insert([
      { game_id: game.data.id, platform_id: platform.data.id, edition_name: "Exact" },
      { game_id: game.data.id, platform_id: platform.data.id, edition_name: "Other" },
    ])
    .select("id");
  if (editions.error) throw editions.error;
  const [edition, otherEdition] = editions.data;
  fixture.editionIds.push(edition.id, otherEdition.id);

  const copies = await admin
    .from("copies")
    .insert([
      ...Array.from({ length: 6 }, () => ({
        owner_id: ownerId,
        game_id: game.data.id,
        edition_id: edition.id,
        visibility: "private",
        availability: "private",
      })),
      {
        owner_id: ownerId,
        game_id: game.data.id,
        edition_id: edition.id,
        visibility: "private",
        availability: "open_to_trade",
      },
      {
        owner_id: otherId,
        game_id: game.data.id,
        edition_id: edition.id,
        visibility: "private",
        availability: "open_to_trade",
      },
    ])
    .select("id");
  if (copies.error) throw copies.error;
  fixture.copyIds.push(...copies.data.map(({ id }) => id));
  const [
    validCopy,
    zeroCopy,
    negativeCopy,
    unauthorizedCopy,
    duplicateCopy,
    auctionCopy,
    tradeCopy,
    otherTradeCopy,
  ] = copies.data;

  await admin.from("copy_private_details").insert({
    copy_id: validCopy.id,
    owner_id: ownerId,
    private_notes: `private-${runId}`,
    provenance: `provenance-${runId}`,
    storage_location: `storage-${runId}`,
  });

  const eur = requireValue(parseCurrencyCode("EUR"), "EUR");
  const askingPrice = requireValue(createListingAskingPrice(3500, eur), "asking price");
  const created = await createListing(owner, { copyId: validCopy.id, askingPrice });
  record(
    "owner creates positive Listing for owned Copy",
    created.outcome === "ok" && created.data.askingPrice.amountMinor === 3500,
  );
  if (created.outcome === "ok") fixture.listingIds.push(created.data.id);

  const photoRows = ["cartridge", "box", "manual", null].map((photoRole) => {
    const id = randomUUID();
    const storagePath = `${validCopy.id}/${id}.jpg`;
    fixture.photoIds.push(id);
    fixture.photoPaths.push(storagePath);
    return {
      id,
      copy_id: validCopy.id,
      photo_role: photoRole,
      storage_path: storagePath,
      mime_type: "image/jpeg",
      width: 1200,
      height: 900,
      byte_size: 1024,
    };
  });
  const photoBytes = new Uint8Array(1024);
  photoBytes.set([0xff, 0xd8, 0xff, 0xd9]);
  const uploadedPhotos = await Promise.all(
    fixture.photoPaths.map((storagePath) =>
      admin.storage
        .from("copy-photos")
        .upload(storagePath, photoBytes, { contentType: "image/jpeg", upsert: false }),
    ),
  );
  const uploadFailure = uploadedPhotos.find(({ error }) => error !== null)?.error;
  if (uploadFailure) throw uploadFailure;
  const insertedPhotos = await admin.from("copy_photos").insert(photoRows);
  if (insertedPhotos.error) throw insertedPhotos.error;

  const [validCopyAfter, validCommitment] = await Promise.all([
    admin.from("copies").select("availability").eq("id", validCopy.id).single(),
    admin
      .from("copy_commercial_commitments")
      .select("kind, listing_id")
      .eq("copy_id", validCopy.id)
      .single(),
  ]);
  record(
    "valid Listing creates commitment and drives for_sale",
    validCopyAfter.data?.availability === "for_sale" &&
      validCommitment.data?.kind === "listing" &&
      validCommitment.data?.listing_id === (created.outcome === "ok" ? created.data.id : null),
  );

  const zero = await owner.from("listings").insert({
    copy_id: zeroCopy.id,
    seller_id: ownerId,
    asking_amount_minor: 0,
    asking_currency: "EUR",
    status: "active",
    published_at: new Date().toISOString(),
  });
  const negative = await owner.from("listings").insert({
    copy_id: negativeCopy.id,
    seller_id: ownerId,
    asking_amount_minor: -1,
    asking_currency: "EUR",
    status: "active",
    published_at: new Date().toISOString(),
  });
  const invalidCopies = await admin
    .from("copies")
    .select("id, availability")
    .in("id", [zeroCopy.id, negativeCopy.id]);
  record(
    "zero and negative prices are database-rejected without availability drift",
    zero.error?.code === "23514" &&
      negative.error?.code === "23514" &&
      invalidCopies.data?.every(({ availability }) => availability === "private") === true,
  );

  const unauthorized = await other.from("listings").insert({
    copy_id: unauthorizedCopy.id,
    seller_id: otherId,
    asking_amount_minor: 3500,
    asking_currency: "EUR",
    status: "active",
    published_at: new Date().toISOString(),
  });
  const anon = await anonymous.from("listings").insert({
    copy_id: unauthorizedCopy.id,
    seller_id: ownerId,
    asking_amount_minor: 3500,
    asking_currency: "EUR",
    status: "active",
    published_at: new Date().toISOString(),
  });
  record(
    "other user and anonymous caller cannot list owned Copy",
    unauthorized.error !== null && anon.error !== null,
  );

  const concurrent = await Promise.all([
    createListing(owner, { copyId: duplicateCopy.id, askingPrice }),
    createListing(owner, { copyId: duplicateCopy.id, askingPrice }),
  ]);
  const duplicateRows = await admin
    .from("listings")
    .select("id")
    .eq("copy_id", duplicateCopy.id)
    .in("status", ["active", "reserved"]);
  fixture.listingIds.push(...(duplicateRows.data ?? []).map(({ id }) => id));
  record(
    "concurrent confirms create at most one active Listing",
    concurrent.filter(({ outcome }) => outcome === "ok").length === 1 &&
      duplicateRows.data?.length === 1,
  );

  const now = Date.now();
  const auction = await admin
    .from("auctions")
    .insert({
      copy_id: auctionCopy.id,
      seller_id: ownerId,
      starting_amount_minor: 1000,
      currency: "EUR",
      min_increment_minor: 100,
      status: "scheduled",
      starts_at: new Date(now - 60_000).toISOString(),
      ends_at: new Date(now + 3_600_000).toISOString(),
    })
    .select("id")
    .single();
  if (auction.error) throw auction.error;
  fixture.auctionIds.push(auction.data.id);
  const auctionConflict = await createListing(owner, { copyId: auctionCopy.id, askingPrice });
  record(
    "current Auction commitment rejects Listing",
    auctionConflict.outcome === "failed" && auctionConflict.failure.code === "23505",
  );

  const tradeOffer = await owner.rpc("create_trade_offer", {
    recipient_user_id: otherId,
    offered_copy_ids: [tradeCopy.id],
    requested_copy_ids: [otherTradeCopy.id],
  });
  if (tradeOffer.error) throw tradeOffer.error;
  fixture.tradeOfferId = tradeOffer.data;
  const accepted = await other.rpc("accept_trade_offer", {
    target_trade_offer_id: tradeOffer.data,
  });
  if (accepted.error) throw accepted.error;
  const tradeConflict = await createListing(owner, { copyId: tradeCopy.id, askingPrice });
  const tradeState = await getMyCopyCommercialState(owner, tradeCopy.id);
  record(
    "accepted Trade commitment rejects Listing and is owner-visible",
    tradeConflict.outcome === "failed" &&
      tradeConflict.failure.code === "23505" &&
      tradeState.outcome === "ok" &&
      tradeState.data.kind === "accepted_trade",
  );

  const [market, wrongEdition, publicDetail] = await Promise.all([
    getEditionMarketOpportunities(buyer, game.data.id, edition.id),
    getEditionMarketOpportunities(buyer, game.data.id, otherEdition.id),
    getPublicCopyDetail(buyer, validCopy.id),
  ]);
  record(
    "exact Edition Market and All Offers projection discover new Listing",
    market.outcome === "ok" &&
      market.data.some(
        (opportunity) =>
          opportunity.type === "listing" &&
          opportunity.copyId === validCopy.id &&
          opportunity.askingPrice.amountMinor === 3500,
      ) &&
      wrongEdition.outcome === "ok" &&
      wrongEdition.data.every((opportunity) => opportunity.copyId !== validCopy.id),
  );
  const publicJson = JSON.stringify(publicDetail);
  record(
    "Public Copy derives Listing footer without private owner data",
    publicDetail.outcome === "ok" &&
      publicDetail.data.opportunity?.type === "listing" &&
      publicDetail.data.opportunity.askingPrice.amountMinor === 3500 &&
      !publicJson.includes(`private-${runId}`) &&
      !publicJson.includes(`provenance-${runId}`) &&
      !publicJson.includes(`storage-${runId}`),
  );

  const [tileListings, tilePhotoRoles] = await Promise.all([
    getMyActiveListingsForCopies(owner, [validCopy.id, zeroCopy.id]),
    getMyCopyPhotoRoles(owner, [validCopy.id, zeroCopy.id]),
  ]);
  const activeListing =
    tileListings.outcome === "ok"
      ? tileListings.data.find((listing) => listing.copyId === validCopy.id)
      : undefined;
  const validRoles =
    tilePhotoRoles.outcome === "ok"
      ? (tilePhotoRoles.data.find((summary) => summary.copyId === validCopy.id)?.photoRoles ?? [])
      : [];
  const listedTile = createCopyTilePresentation(activeListing, validRoles);
  const unlistedTile = createCopyTilePresentation(undefined, []);
  const presentations = new Map([
    [validCopy.id, listedTile],
    [zeroCopy.id, createCopyTilePresentation(undefined, ["box"])],
  ]);
  record(
    "My Games active Listing produces a canonical sale badge",
    activeListing?.askingPrice.amountMinor === 3500 && listedTile.salePrice !== undefined,
  );
  record(
    "sale badge price derives from canonical minor units and currency",
    created.outcome === "ok" && listedTile.salePrice === formatMoney(created.data.askingPrice),
  );
  record(
    "canonical money formatting avoids iOS-Hermes-only Intl inputs",
    formatMoney({ amountMinor: 3500, currency: "EUR" }) === "35\u00a0€" &&
      formatMoney({ amountMinor: 3550, currency: "EUR" }) === "35,50\u00a0€" &&
      !readFileSync("apps/mobile/ui/format-money.ts", "utf8").includes("BigInt") &&
      !readFileSync("apps/mobile/ui/format-money.ts", "utf8").includes("formatToParts"),
  );
  record("Copy without active Listing has no sale badge", unlistedTile.salePrice === undefined);
  record(
    "optional tile enrichment failure preserves an empty presentation map",
    copyTilePresentationsOrEmpty({ outcome: "error" }).size === 0 &&
      copyTilePresentationsOrEmpty({ outcome: "unauthenticated" }).size === 0,
  );
  record(
    "for_sale without a resolvable active Listing cannot fabricate a badge price",
    createCopyTilePresentation(undefined, []).salePrice === undefined,
  );
  record(
    "unambiguous Album Copy inherits its active Listing badge",
    selectAlbumCopyTilePresentation([validCopy.id], presentations)?.salePrice ===
      listedTile.salePrice,
  );
  record(
    "ambiguous Album Copies select no commercial truth",
    selectAlbumCopyTilePresentation([validCopy.id, zeroCopy.id], presentations) === undefined,
  );
  record("cartridge photo produces gamepad role", listedTile.photoRoles.includes("cartridge"));
  record("box photo produces box role", listedTile.photoRoles.includes("box"));
  record("manual photo produces file-text role", listedTile.photoRoles.includes("manual"));
  record("generic photo_role null produces no role icon", listedTile.photoRoles.length === 3);
  record(
    "photo icons preserve gamepad, box, file-text order",
    JSON.stringify(listedTile.photoRoles) === JSON.stringify(["cartridge", "box", "manual"]),
  );
  record(
    "Album never aggregates photo roles across multiple Copies",
    selectAlbumCopyTilePresentation([validCopy.id, zeroCopy.id], presentations) === undefined,
  );
  const sellerFooter =
    created.outcome === "ok"
      ? getStickyAvailabilityPresentation("for_sale", {
          kind: "listing",
          listing: created.data,
        })
      : null;
  record("seller footer renders Prix", sellerFooter?.label === "Prix");
  record(
    "seller footer renders canonical formatted Listing amount",
    created.outcome === "ok" && sellerFooter?.value === formatMoney(created.data.askingPrice),
  );
  record(
    "seller Listing footer omits Status and En vente",
    sellerFooter !== null &&
      !`${sellerFooter.label} ${sellerFooter.value} ${sellerFooter.action}`.includes("Status") &&
      !`${sellerFooter.label} ${sellerFooter.value} ${sellerFooter.action}`.includes("En vente"),
  );
  const gridSource = readFileSync("apps/mobile/ui/game-grid-item.tsx", "utf8");
  record(
    "tile role glyph mapping and sale fallback remain explicit",
    gridSource.includes('cartridge: "gamepad"') &&
      gridSource.includes('manual: "file-text"') &&
      !gridSource.includes('price ?? "34€"'),
  );

  const parsedWhole = parseListingPriceInput("35");
  const parsedDecimal = parseListingPriceInput("35,50");
  record(
    "price input maps euros to positive integer minor units",
    parsedWhole.valid &&
      parsedWhole.askingPrice.amountMinor === 3500 &&
      parsedDecimal.valid &&
      parsedDecimal.askingPrice.amountMinor === 3550 &&
      !parseListingPriceInput("").valid &&
      !parseListingPriceInput("0").valid &&
      !parseListingPriceInput("-1").valid &&
      !parseListingPriceInput("35,999").valid,
  );

  let submissionCount = 0;
  const coordinator = createListingSubmissionCoordinator({
    create: async () => {
      submissionCount += 1;
      await delay(10);
      return true;
    },
  });
  const [firstSubmit, secondSubmit] = await Promise.all([
    coordinator.submit(askingPrice),
    coordinator.submit(askingPrice),
  ]);
  const retryCoordinator = createListingSubmissionCoordinator({ create: async () => false });
  const failedSubmit = await retryCoordinator.submit(askingPrice);
  record(
    "UI coordinator suppresses double submit and resets after failure",
    submissionCount === 1 &&
      firstSubmit.outcome === "committed" &&
      secondSubmit.outcome === "ignored" &&
      failedSubmit.outcome === "failed" &&
      retryCoordinator.getStatus() === "idle",
  );
  record(
    "seller eligibility blocks existing Listing and Auction commitments",
    created.outcome === "ok" &&
      canCreateDirectListing("private", { kind: "none" }) &&
      canCreateDirectListing("open_to_trade", { kind: "none" }) &&
      !canCreateDirectListing("for_sale", { kind: "listing", listing: created.data }) &&
      !canCreateDirectListing("in_auction", { kind: "auction", auctionId: auction.data.id }),
  );
} finally {
  if (fixture.tradeOfferId) {
    const escapedId = fixture.tradeOfferId.replaceAll("'", "''");
    execFileSync(
      "docker",
      [
        "exec",
        databaseContainer,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `begin; update public.trade_offers set status = 'pending' where id = '${escapedId}'; delete from public.copy_commercial_commitments where trade_offer_id = '${escapedId}'; delete from public.trade_offer_copies where trade_offer_id = '${escapedId}'; delete from public.trade_offers where id = '${escapedId}'; commit;`,
      ],
      { stdio: "ignore" },
    );
  }
  if (fixture.listingIds.length) {
    await admin.from("listings").update({ status: "withdrawn" }).in("id", fixture.listingIds);
    await admin.from("listings").delete().in("id", fixture.listingIds);
  }
  if (fixture.photoIds.length) await admin.from("copy_photos").delete().in("id", fixture.photoIds);
  if (fixture.photoPaths.length) {
    await admin.storage.from("copy-photos").remove(fixture.photoPaths);
  }
  if (fixture.auctionIds.length) {
    await admin.from("auctions").update({ status: "cancelled" }).in("id", fixture.auctionIds);
    await admin.from("auctions").delete().in("id", fixture.auctionIds);
  }
  if (fixture.copyIds.length) await admin.from("copies").delete().in("id", fixture.copyIds);
  if (fixture.editionIds.length) {
    await admin.from("editions").delete().in("id", fixture.editionIds);
  }
  if (fixture.gameIds.length) await admin.from("games").delete().in("id", fixture.gameIds);
  if (fixture.platformId) await admin.from("platforms").delete().eq("id", fixture.platformId);
  for (const userId of fixture.users) await admin.auth.admin.deleteUser(userId);
}

const failed = results.filter(({ passed }) => !passed);
process.stdout.write(
  `\n${results.length - failed.length}/${results.length} Create Listing checks passed.\n`,
);
if (failed.length) process.exitCode = 1;
