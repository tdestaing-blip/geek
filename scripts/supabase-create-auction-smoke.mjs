import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { register } from "node:module";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { createClient } from "@supabase/supabase-js";

register("./typescript-resolver.mjs", import.meta.url);
const {
  createAuction,
  getEditionMarketOpportunities,
  getMyCopyCommercialState,
  getPublicCopyDetail,
} = await import("../packages/data/src/index.ts");
const {
  canCreateAuction,
  CREATE_AUCTION_V1_DURATION_DAYS,
  CREATE_AUCTION_V1_MIN_INCREMENT_MINOR,
  createAuctionStartingPrice,
  parseCurrencyCode,
} = await import("../packages/domain/src/index.ts");
const { createAuctionSubmissionCoordinator, parseAuctionStartingPriceInput } =
  await import("../apps/mobile/navigation/create-auction-flow.ts");
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
const password = `Auction-${randomUUID()}`;
const results = [];
const fixture = {
  users: [],
  platformId: null,
  gameIds: [],
  editionIds: [],
  copyIds: [],
  listingIds: [],
  tradeOfferId: null,
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
  owner.auth.signUp({ email: `auction-owner-${runId}@example.com`, password }),
  other.auth.signUp({ email: `auction-other-${runId}@example.com`, password }),
  buyer.auth.signUp({ email: `auction-buyer-${runId}@example.com`, password }),
]);
const ownerId = requireValue(ownerAuth.data.user?.id, "owner user");
const otherId = requireValue(otherAuth.data.user?.id, "other user");
const buyerId = requireValue(buyerAuth.data.user?.id, "buyer user");
fixture.users.push(ownerId, otherId, buyerId);

try {
  await Promise.all([
    admin
      .from("profiles")
      .update({ username: `auction_owner_${runId}` })
      .eq("id", ownerId),
    admin
      .from("profiles")
      .update({ username: `auction_other_${runId}` })
      .eq("id", otherId),
    admin
      .from("profiles")
      .update({ username: `auction_buyer_${runId}` })
      .eq("id", buyerId),
  ]);

  const platform = await admin
    .from("platforms")
    .insert({ slug: `auction-${runId}`, name: `Auction ${runId}` })
    .select("id")
    .single();
  if (platform.error) throw platform.error;
  fixture.platformId = platform.data.id;

  const game = await admin
    .from("games")
    .insert({ canonical_title: `Auction Game ${runId}` })
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
      ...Array.from({ length: 7 }, () => ({
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
    unauthorizedCopy,
    invalidCopy,
    idempotentCopy,
    concurrentCopy,
    listingCopy,
    overrideCopy,
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
  const startingPrice = requireValue(createAuctionStartingPrice(2000, eur), "starting price");
  const requestStartedAt = Date.now();
  const createdId = randomUUID();
  const created = await createAuction(owner, {
    auctionId: createdId,
    copyId: validCopy.id,
    startingPrice,
  });
  const requestFinishedAt = Date.now();
  record(
    "owner atomically creates scheduled Auction for exact owned Copy",
    created.outcome === "ok" &&
      created.data.id === createdId &&
      created.data.copyId === validCopy.id &&
      created.data.sellerId === ownerId &&
      created.data.status === "scheduled",
  );
  record(
    "V1 increment and server-derived seven-day time window are canonical",
    created.outcome === "ok" &&
      created.data.minIncrement.amountMinor === CREATE_AUCTION_V1_MIN_INCREMENT_MINOR &&
      Date.parse(created.data.startsAt) >= requestStartedAt - 5_000 &&
      Date.parse(created.data.startsAt) <= requestFinishedAt + 5_000 &&
      Date.parse(created.data.endsAt) - Date.parse(created.data.startsAt) ===
        CREATE_AUCTION_V1_DURATION_DAYS * 86_400_000,
  );

  const [createdCopy, createdCommitment, ownerState] = await Promise.all([
    admin.from("copies").select("availability").eq("id", validCopy.id).single(),
    admin
      .from("copy_commercial_commitments")
      .select("kind, auction_id")
      .eq("copy_id", validCopy.id)
      .single(),
    getMyCopyCommercialState(owner, validCopy.id),
  ]);
  record(
    "successful Auction establishes commitment and drives in_auction",
    createdCopy.data?.availability === "in_auction" &&
      createdCommitment.data?.kind === "auction" &&
      createdCommitment.data.auction_id === createdId &&
      ownerState.outcome === "ok" &&
      ownerState.data.kind === "auction" &&
      ownerState.data.auction.id === createdId,
  );

  const anonymousResult = await anonymous.rpc("create_auction", {
    request_auction_id: randomUUID(),
    requested_starting_amount_minor: 2000,
    target_copy_id: unauthorizedCopy.id,
  });
  const unauthorizedResult = await createAuction(other, {
    auctionId: randomUUID(),
    copyId: unauthorizedCopy.id,
    startingPrice,
  });
  record(
    "anonymous and other authenticated user are denied",
    anonymousResult.error !== null && unauthorizedResult.outcome === "failed",
  );

  const invalidId = randomUUID();
  const unsafeId = randomUUID();
  const [invalidResult, unsafeResult] = await Promise.all([
    owner.rpc("create_auction", {
      request_auction_id: invalidId,
      requested_starting_amount_minor: -1,
      target_copy_id: invalidCopy.id,
    }),
    owner.rpc("create_auction", {
      request_auction_id: unsafeId,
      requested_starting_amount_minor: Number.MAX_SAFE_INTEGER + 1,
      target_copy_id: invalidCopy.id,
    }),
  ]);
  const [invalidAuction, invalidCopyAfter] = await Promise.all([
    admin.from("auctions").select("id").eq("id", invalidId).maybeSingle(),
    admin.from("copies").select("availability").eq("id", invalidCopy.id).single(),
  ]);
  record(
    "invalid amount rolls back Auction, commitment, and availability",
    invalidResult.error?.code === "22023" &&
      unsafeResult.error?.code === "22023" &&
      invalidAuction.data === null &&
      invalidCopyAfter.data?.availability === "private",
  );

  const idempotentId = randomUUID();
  const firstIdempotent = await createAuction(owner, {
    auctionId: idempotentId,
    copyId: idempotentCopy.id,
    startingPrice,
  });
  const secondIdempotent = await createAuction(owner, {
    auctionId: idempotentId,
    copyId: idempotentCopy.id,
    startingPrice,
  });
  const idempotentRows = await admin.from("auctions").select("id").eq("id", idempotentId);
  record(
    "same request identity retry returns one Auction without shifting time",
    firstIdempotent.outcome === "ok" &&
      secondIdempotent.outcome === "ok" &&
      firstIdempotent.data.id === secondIdempotent.data.id &&
      firstIdempotent.data.startsAt === secondIdempotent.data.startsAt &&
      firstIdempotent.data.endsAt === secondIdempotent.data.endsAt &&
      idempotentRows.data?.length === 1,
  );
  const conflictingPrice = requireValue(
    createAuctionStartingPrice(2100, eur),
    "conflicting starting price",
  );
  const conflictingRetry = await createAuction(owner, {
    auctionId: idempotentId,
    copyId: idempotentCopy.id,
    startingPrice: conflictingPrice,
  });
  record(
    "same request identity with conflicting payload is rejected",
    conflictingRetry.outcome === "failed" && conflictingRetry.failure.code === "23505",
  );

  const overrideIncrementId = randomUUID();
  const overrideTimeId = randomUUID();
  const [overrideIncrement, overrideTime] = await Promise.all([
    owner.rpc("create_auction", {
      request_auction_id: overrideIncrementId,
      requested_starting_amount_minor: 2000,
      target_copy_id: overrideCopy.id,
      min_increment_minor: 500,
    }),
    owner.rpc("create_auction", {
      request_auction_id: overrideTimeId,
      requested_starting_amount_minor: 2000,
      target_copy_id: overrideCopy.id,
      starts_at: new Date(0).toISOString(),
      ends_at: new Date(1).toISOString(),
    }),
  ]);
  const overrides = await admin
    .from("auctions")
    .select("id")
    .in("id", [overrideIncrementId, overrideTimeId]);
  record(
    "seller cannot override increment or authoritative timestamps",
    overrideIncrement.error !== null && overrideTime.error !== null && overrides.data?.length === 0,
  );

  const listing = await owner
    .from("listings")
    .insert({
      copy_id: listingCopy.id,
      seller_id: ownerId,
      asking_amount_minor: 3500,
      asking_currency: "EUR",
      local_pickup: true,
      shipping_available: false,
      status: "active",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (listing.error) throw listing.error;
  fixture.listingIds.push(listing.data.id);
  const listingConflictId = randomUUID();
  const listingConflict = await createAuction(owner, {
    auctionId: listingConflictId,
    copyId: listingCopy.id,
    startingPrice,
  });
  const listingConflictAuction = await admin
    .from("auctions")
    .select("id")
    .eq("id", listingConflictId)
    .maybeSingle();
  record(
    "active Listing conflict rolls back without orphan Auction",
    listingConflict.outcome === "failed" &&
      listingConflictAuction.data === null &&
      (await admin.from("copies").select("availability").eq("id", listingCopy.id).single()).data
        ?.availability === "for_sale",
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
  const tradeConflictId = randomUUID();
  const tradeConflict = await createAuction(owner, {
    auctionId: tradeConflictId,
    copyId: tradeCopy.id,
    startingPrice,
  });
  const tradeConflictAuction = await admin
    .from("auctions")
    .select("id")
    .eq("id", tradeConflictId)
    .maybeSingle();
  record(
    "accepted Trade conflict rolls back without orphan Auction",
    tradeConflict.outcome === "failed" && tradeConflictAuction.data === null,
  );

  const concurrentIds = [randomUUID(), randomUUID()];
  const concurrentResults = await Promise.all(
    concurrentIds.map((auctionId) =>
      createAuction(owner, { auctionId, copyId: concurrentCopy.id, startingPrice }),
    ),
  );
  const concurrentRows = await admin
    .from("auctions")
    .select("id, status")
    .eq("copy_id", concurrentCopy.id);
  record(
    "distinct concurrent requests create at most one current Auction and no draft",
    concurrentResults.filter(({ outcome }) => outcome === "ok").length === 1 &&
      concurrentRows.data?.length === 1 &&
      concurrentRows.data[0]?.status === "scheduled",
  );

  const [market, wrongEdition, publicDetail] = await Promise.all([
    getEditionMarketOpportunities(buyer, game.data.id, edition.id),
    getEditionMarketOpportunities(buyer, game.data.id, otherEdition.id),
    getPublicCopyDetail(buyer, validCopy.id),
  ]);
  record(
    "exact Edition Market and All Offers discover Auction only on its Edition",
    market.outcome === "ok" &&
      market.data.some(
        (opportunity) =>
          opportunity.type === "auction" &&
          opportunity.auctionId === createdId &&
          opportunity.copyId === validCopy.id &&
          opportunity.currentPrice.amountMinor === 2000 &&
          opportunity.bidCount === 0,
      ) &&
      wrongEdition.outcome === "ok" &&
      wrongEdition.data.every((opportunity) => opportunity.copyId !== validCopy.id),
  );
  const publicJson = JSON.stringify(publicDetail);
  record(
    "Public Copy derives zero-bid Auction footer without private owner data",
    publicDetail.outcome === "ok" &&
      publicDetail.data.opportunity?.type === "auction" &&
      publicDetail.data.opportunity.auctionId === createdId &&
      publicDetail.data.opportunity.currentPrice.amountMinor === 2000 &&
      publicDetail.data.opportunity.bidCount === 0 &&
      !publicJson.includes(`private-${runId}`) &&
      !publicJson.includes(`provenance-${runId}`) &&
      !publicJson.includes(`storage-${runId}`),
  );

  const parsedWhole = parseAuctionStartingPriceInput("20");
  const parsedDecimal = parseAuctionStartingPriceInput("20,50");
  record(
    "seller input maps euros to canonical integer minor units",
    parsedWhole.valid &&
      parsedWhole.startingPrice.amountMinor === 2000 &&
      parsedDecimal.valid &&
      parsedDecimal.startingPrice.amountMinor === 2050 &&
      parseAuctionStartingPriceInput("0").valid &&
      !parseAuctionStartingPriceInput("").valid &&
      !parseAuctionStartingPriceInput("-1").valid &&
      !parseAuctionStartingPriceInput("20,999").valid,
  );

  let submissionCount = 0;
  const coordinator = createAuctionSubmissionCoordinator({
    create: async () => {
      submissionCount += 1;
      await delay(10);
      return true;
    },
  });
  const [firstSubmit, secondSubmit] = await Promise.all([
    coordinator.submit(startingPrice),
    coordinator.submit(startingPrice),
  ]);
  const retryCoordinator = createAuctionSubmissionCoordinator({ create: async () => false });
  const failedSubmit = await retryCoordinator.submit(startingPrice);
  record(
    "UI coordinator suppresses double confirm and remains retryable after failure",
    submissionCount === 1 &&
      firstSubmit.outcome === "committed" &&
      secondSubmit.outcome === "ignored" &&
      failedSubmit.outcome === "failed" &&
      retryCoordinator.getStatus() === "idle",
  );

  const sellerFooter =
    created.outcome === "ok"
      ? getStickyAvailabilityPresentation("in_auction", {
          kind: "auction",
          auction: created.data,
        })
      : null;
  record(
    "seller footer derives zero-bid amount and countdown without buyer CTA",
    sellerFooter?.label === "Mise de départ" &&
      sellerFooter.value.includes("20") &&
      sellerFooter.action === "Aux enchères" &&
      sellerFooter.signal?.leading === "0 enchères" &&
      sellerFooter.signal.trailing.startsWith("Fin dans 6j"),
  );
  record(
    "seller eligibility preserves Listing, Auction, and Trade exclusivity",
    canCreateAuction("private", { kind: "none" }) &&
      canCreateAuction("open_to_trade", { kind: "none" }) &&
      created.outcome === "ok" &&
      !canCreateAuction("in_auction", { kind: "auction", auction: created.data }) &&
      !canCreateAuction("for_sale", {
        kind: "listing",
        listing: {
          id: listing.data.id,
          copyId: listingCopy.id,
          sellerId: ownerId,
          askingPrice: requireValue(
            (await import("../packages/domain/src/index.ts")).createListingAskingPrice(3500, eur),
            "listing price",
          ),
          localPickup: true,
          shippingAvailable: false,
          status: "active",
          publishedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
  );

  const failedIds = [
    invalidId,
    unsafeId,
    overrideIncrementId,
    overrideTimeId,
    listingConflictId,
    tradeConflictId,
    ...concurrentIds.filter((id) => !concurrentRows.data?.some((auction) => auction.id === id)),
  ];
  const orphanDrafts = await admin.from("auctions").select("id").in("id", failedIds);
  record("all failed paths leave no orphan draft", orphanDrafts.data?.length === 0);
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
  if (fixture.copyIds.length) {
    const auctions = await admin.from("auctions").select("id").in("copy_id", fixture.copyIds);
    const auctionIds = (auctions.data ?? []).map(({ id }) => id);
    if (auctionIds.length) {
      await admin.from("auctions").update({ status: "cancelled" }).in("id", auctionIds);
      await admin.from("auctions").delete().in("id", auctionIds);
    }
    await admin.from("copies").delete().in("id", fixture.copyIds);
  }
  if (fixture.editionIds.length) await admin.from("editions").delete().in("id", fixture.editionIds);
  if (fixture.gameIds.length) await admin.from("games").delete().in("id", fixture.gameIds);
  if (fixture.platformId) await admin.from("platforms").delete().eq("id", fixture.platformId);
  for (const userId of fixture.users) await admin.auth.admin.deleteUser(userId);
}

const failed = results.filter(({ passed }) => !passed);
process.stdout.write(
  `\n${results.length - failed.length}/${results.length} Create Auction checks passed.\n`,
);
if (failed.length) process.exitCode = 1;
