import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { register } from "node:module";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

register("./typescript-resolver.mjs", import.meta.url);
const { getAuctionResult, getEditionMarketOpportunities, getPublicCopyDetail } =
  await import("../packages/data/src/index.ts");
const { getAuctionResultPresentation } =
  await import("../apps/mobile/ui/auction-result-presentation.ts");
const { formatAuctionCountdown } = await import("../apps/mobile/ui/auction-countdown.ts");

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
const seller = createClient(status.API_URL, status.ANON_KEY, authOptions);
const buyerA = createClient(status.API_URL, status.ANON_KEY, authOptions);
const buyerB = createClient(status.API_URL, status.ANON_KEY, authOptions);
const ordinary = createClient(status.API_URL, status.ANON_KEY, authOptions);
const anonymous = createClient(status.API_URL, status.ANON_KEY, authOptions);
const runId = randomUUID().slice(0, 8);
const password = `Resolution-${randomUUID()}`;
const results = [];
const fixture = {
  users: [],
  platformId: null,
  gameId: null,
  editionId: null,
  copyIds: [],
  auctionIds: [],
};

function record(name, passed, detail) {
  results.push({ name, passed });
  process.stdout.write(
    `${passed ? "PASS" : "FAIL"}  ${name}${!passed && detail ? ` — ${detail}` : ""}\n`,
  );
}

function requireValue(value, label) {
  if (value === null || value === undefined) throw new Error(`${label} is required`);
  return value;
}

async function createScheduled(copyId, { startsAt, endsAt, statusValue = "scheduled" }) {
  const id = randomUUID();
  const inserted = await admin
    .from("auctions")
    .insert({
      id,
      copy_id: copyId,
      seller_id: sellerId,
      starting_amount_minor: 2000,
      currency: "EUR",
      min_increment_minor: 100,
      local_pickup: true,
      shipping_available: false,
      status: statusValue,
      starts_at: startsAt,
      ends_at: endsAt,
    })
    .select("id, copy_id")
    .single();
  if (inserted.error) throw inserted.error;
  fixture.auctionIds.push(id);
  return inserted.data;
}

async function place(client, auctionId, amountMinor) {
  return client.rpc("place_auction_bid", {
    request_bid_id: randomUUID(),
    target_auction_id: auctionId,
    bid_amount_minor: amountMinor,
  });
}

function first(result) {
  return result.error === null && Array.isArray(result.data) ? result.data[0] : undefined;
}

const [sellerAuth, buyerAAuth, buyerBAuth, ordinaryAuth] = await Promise.all([
  seller.auth.signUp({ email: `resolution-seller-${runId}@example.com`, password }),
  buyerA.auth.signUp({ email: `resolution-a-${runId}@example.com`, password }),
  buyerB.auth.signUp({ email: `resolution-b-${runId}@example.com`, password }),
  ordinary.auth.signUp({ email: `resolution-other-${runId}@example.com`, password }),
]);
const sellerId = requireValue(sellerAuth.data.user?.id, "seller");
const buyerAId = requireValue(buyerAAuth.data.user?.id, "buyer A");
const buyerBId = requireValue(buyerBAuth.data.user?.id, "buyer B");
const ordinaryId = requireValue(ordinaryAuth.data.user?.id, "ordinary caller");
fixture.users.push(sellerId, buyerAId, buyerBId, ordinaryId);

try {
  const platform = await admin
    .from("platforms")
    .insert({ slug: `resolution-${runId}`, name: `Resolution ${runId}` })
    .select("id")
    .single();
  if (platform.error) throw platform.error;
  fixture.platformId = platform.data.id;

  const game = await admin
    .from("games")
    .insert({ canonical_title: `Resolution Game ${runId}` })
    .select("id")
    .single();
  if (game.error) throw game.error;
  fixture.gameId = game.data.id;

  const edition = await admin
    .from("editions")
    .insert({
      game_id: game.data.id,
      platform_id: platform.data.id,
      edition_name: "Resolution Exact",
    })
    .select("id")
    .single();
  if (edition.error) throw edition.error;
  fixture.editionId = edition.data.id;

  const copies = await admin
    .from("copies")
    .insert(
      Array.from({ length: 10 }, () => ({
        owner_id: sellerId,
        game_id: game.data.id,
        edition_id: edition.data.id,
        visibility: "private",
        availability: "private",
      })),
    )
    .select("id");
  if (copies.error) throw copies.error;
  fixture.copyIds.push(...copies.data.map(({ id }) => id));
  const [
    zeroCopy,
    reserveCopy,
    wonCopy,
    futureCopy,
    concurrentCopy,
    malformedCopy,
    batchCopy,
    boundedCopy,
    overlapCopy,
    raceCopy,
  ] = copies.data;

  await admin.from("copy_private_details").insert({
    copy_id: wonCopy.id,
    owner_id: sellerId,
    private_notes: `secret-note-${runId}`,
    provenance: `secret-provenance-${runId}`,
    storage_location: `secret-location-${runId}`,
  });

  const now = Date.now();
  const pastStart = new Date(now - 3_600_000).toISOString();
  const pastEnd = new Date(now - 1_000).toISOString();
  const liveStart = new Date(now - 60_000).toISOString();
  const liveEnd = new Date(now + 3_600_000).toISOString();

  const zeroAuction = await createScheduled(zeroCopy.id, {
    startsAt: pastStart,
    endsAt: pastEnd,
  });
  const futureAuction = await createScheduled(futureCopy.id, {
    startsAt: liveStart,
    endsAt: liveEnd,
  });
  const futureFinalize = await admin.rpc("finalize_auction", {
    target_auction_id: futureAuction.id,
  });
  const futureState = await admin
    .from("auctions")
    .select("status")
    .eq("id", futureAuction.id)
    .single();
  record(
    "future scheduled Auction is not finalized",
    futureFinalize.error?.code === "23514" && futureState.data?.status === "scheduled",
  );

  const zeroFinalized = await admin.rpc("finalize_auction", {
    target_auction_id: zeroAuction.id,
  });
  const zeroAfter = await admin
    .from("auctions")
    .select("status, winning_bid_id, bid_count, current_amount_minor")
    .eq("id", zeroAuction.id)
    .single();
  const zeroCopyAfter = await admin
    .from("copies")
    .select("availability")
    .eq("id", zeroCopy.id)
    .single();
  const zeroCommitment = await admin
    .from("copy_commercial_commitments")
    .select("auction_id")
    .eq("copy_id", zeroCopy.id);
  record(
    "due zero-bid Auction ends, releases commitment, and restores private Copy",
    zeroFinalized.error === null &&
      zeroAfter.data?.status === "ended" &&
      zeroAfter.data.winning_bid_id === null &&
      zeroAfter.data.bid_count === 0 &&
      zeroAfter.data.current_amount_minor === null &&
      zeroCopyAfter.data?.availability === "private" &&
      zeroCommitment.data?.length === 0,
  );

  const reserveAuctionId = randomUUID();
  const reserveDraft = await admin.from("auctions").insert({
    id: reserveAuctionId,
    copy_id: reserveCopy.id,
    seller_id: sellerId,
    starting_amount_minor: 2000,
    currency: "EUR",
    min_increment_minor: 100,
    local_pickup: true,
    shipping_available: false,
    status: "draft",
  });
  if (reserveDraft.error) throw reserveDraft.error;
  fixture.auctionIds.push(reserveAuctionId);
  const reserveDetails = await admin
    .from("auction_private_details")
    .insert({ auction_id: reserveAuctionId, reserve_amount_minor: 3000 });
  if (reserveDetails.error) throw reserveDetails.error;
  await admin
    .from("auctions")
    .update({ status: "scheduled", starts_at: liveStart, ends_at: liveEnd })
    .eq("id", reserveAuctionId);
  const reserveBid = await place(buyerA, reserveAuctionId, 2000);
  await admin.from("auctions").update({ ends_at: pastEnd }).eq("id", reserveAuctionId);
  await admin.rpc("finalize_auction", { target_auction_id: reserveAuctionId });
  const reserveAfter = await admin
    .from("auctions")
    .select("status, winning_bid_id, current_amount_minor, bid_count")
    .eq("id", reserveAuctionId)
    .single();
  record(
    "unmet reserve ends without discarding canonical Bid aggregates",
    first(reserveBid)?.result_code === "accepted" &&
      reserveAfter.data?.status === "ended" &&
      reserveAfter.data.winning_bid_id === null &&
      reserveAfter.data.current_amount_minor === 2000 &&
      reserveAfter.data.bid_count === 1,
    JSON.stringify({
      bid: first(reserveBid),
      bidError: reserveBid.error,
      state: reserveAfter.data,
    }),
  );

  const wonAuction = await createScheduled(wonCopy.id, {
    startsAt: liveStart,
    endsAt: liveEnd,
  });
  const lowerBid = await place(buyerA, wonAuction.id, 2000);
  const winningBid = await place(buyerB, wonAuction.id, 2500);
  await admin.from("auctions").update({ ends_at: pastEnd }).eq("id", wonAuction.id);
  const wonFinalized = await admin.rpc("finalize_auction", {
    target_auction_id: wonAuction.id,
  });
  const wonAfter = await admin
    .from("auctions")
    .select("status, winning_bid_id, leading_bid_id, current_amount_minor, bid_count, updated_at")
    .eq("id", wonAuction.id)
    .single();
  const wonCopyAfter = await admin
    .from("copies")
    .select("availability")
    .eq("id", wonCopy.id)
    .single();
  const wonCommitment = await admin
    .from("copy_commercial_commitments")
    .select("auction_id")
    .eq("copy_id", wonCopy.id);
  record(
    "valid multiple-Bid Auction wins with canonical leading Bid and retained commitment",
    first(lowerBid)?.result_code === "accepted" &&
      first(winningBid)?.result_code === "accepted" &&
      wonFinalized.error === null &&
      wonAfter.data?.status === "won" &&
      wonAfter.data.winning_bid_id === first(winningBid)?.bid_id &&
      wonAfter.data.winning_bid_id === wonAfter.data.leading_bid_id &&
      wonAfter.data.current_amount_minor === 2500 &&
      wonAfter.data.bid_count === 2 &&
      wonCopyAfter.data?.availability === "in_auction" &&
      wonCommitment.data?.[0]?.auction_id === wonAuction.id,
    JSON.stringify({
      lower: first(lowerBid),
      lowerError: lowerBid.error,
      winner: first(winningBid),
      winnerError: winningBid.error,
      finalError: wonFinalized.error,
      state: wonAfter.data,
      copy: wonCopyAfter.data,
      commitment: wonCommitment.data,
    }),
  );

  const wonRetry = await admin.rpc("finalize_auction", { target_auction_id: wonAuction.id });
  const wonAfterRetry = await admin
    .from("auctions")
    .select("status, winning_bid_id, current_amount_minor, bid_count, updated_at")
    .eq("id", wonAuction.id)
    .single();
  record(
    "resolved retry is an idempotent no-op",
    wonRetry.error === null &&
      wonAfterRetry.data?.status === wonAfter.data?.status &&
      wonAfterRetry.data.winning_bid_id === wonAfter.data.winning_bid_id &&
      wonAfterRetry.data.current_amount_minor === wonAfter.data.current_amount_minor &&
      wonAfterRetry.data.bid_count === wonAfter.data.bid_count &&
      wonAfterRetry.data.updated_at === wonAfter.data.updated_at,
  );

  const concurrentAuction = await createScheduled(concurrentCopy.id, {
    startsAt: pastStart,
    endsAt: pastEnd,
  });
  const concurrentFinalizers = await Promise.all([
    admin.rpc("finalize_auction", { target_auction_id: concurrentAuction.id }),
    admin.rpc("finalize_auction", { target_auction_id: concurrentAuction.id }),
  ]);
  const concurrentState = await admin
    .from("auctions")
    .select("status")
    .eq("id", concurrentAuction.id)
    .single();
  record(
    "concurrent finalization is idempotent",
    concurrentFinalizers.every(({ error }) => error === null) &&
      concurrentState.data?.status === "ended",
  );

  const raceAuction = await createScheduled(raceCopy.id, {
    startsAt: pastStart,
    endsAt: pastEnd,
  });
  const [lateBid, raceFinalize] = await Promise.all([
    place(buyerA, raceAuction.id, 2000),
    admin.rpc("finalize_auction", { target_auction_id: raceAuction.id }),
  ]);
  const raceState = await admin
    .from("auctions")
    .select("status, bid_count")
    .eq("id", raceAuction.id)
    .single();
  record(
    "post-deadline Bid/finalize race is coherent",
    first(lateBid)?.result_code !== "accepted" &&
      raceFinalize.error === null &&
      raceState.data?.status === "ended" &&
      raceState.data.bid_count === 0,
  );

  const malformedAuction = await createScheduled(malformedCopy.id, {
    startsAt: liveStart,
    endsAt: liveEnd,
  });
  const batchAuction = await createScheduled(batchCopy.id, {
    startsAt: liveStart,
    endsAt: liveEnd,
  });
  const boundedAuction = await createScheduled(boundedCopy.id, {
    startsAt: liveStart,
    endsAt: liveEnd,
  });
  await admin
    .from("auctions")
    .update({ current_amount_minor: 2000, bid_count: 1 })
    .eq("id", malformedAuction.id);
  await admin
    .from("auctions")
    .update({ starts_at: "1999-12-31T00:00:00Z", ends_at: "2000-01-01T00:00:00Z" })
    .eq("id", malformedAuction.id);
  await admin
    .from("auctions")
    .update({ starts_at: "2000-01-01T00:00:00Z", ends_at: "2000-01-02T00:00:00Z" })
    .eq("id", batchAuction.id);
  await admin
    .from("auctions")
    .update({ starts_at: "2000-01-02T00:00:00Z", ends_at: "2000-01-03T00:00:00Z" })
    .eq("id", boundedAuction.id);
  const batch = await admin.rpc("finalize_due_auctions", { requested_batch_size: 2 });
  const batchStates = await admin
    .from("auctions")
    .select("id, status")
    .in("id", [malformedAuction.id, batchAuction.id, boundedAuction.id]);
  const byId = new Map(batchStates.data?.map((row) => [row.id, row.status]));
  record(
    "bounded batch isolates one malformed Auction and resolves the next due Auction",
    batch.error === null &&
      first(batch)?.processed_count === 2 &&
      first(batch)?.resolved_count === 1 &&
      first(batch)?.failed_count === 1 &&
      byId.get(malformedAuction.id) === "scheduled" &&
      byId.get(batchAuction.id) === "ended" &&
      byId.get(boundedAuction.id) === "scheduled",
    JSON.stringify({ batch: batch.data, error: batch.error, states: batchStates.data }),
  );
  await admin.from("auctions").update({ status: "cancelled" }).eq("id", malformedAuction.id);
  const repeatedBatch = await admin.rpc("finalize_due_auctions", { requested_batch_size: 2 });
  const boundedState = await admin
    .from("auctions")
    .select("status")
    .eq("id", boundedAuction.id)
    .single();
  record(
    "repeated bounded batch resolves remaining due work harmlessly",
    repeatedBatch.error === null && boundedState.data?.status === "ended",
  );

  const overlapAuction = await createScheduled(overlapCopy.id, {
    startsAt: pastStart,
    endsAt: pastEnd,
  });
  const overlapping = await Promise.all([
    admin.rpc("finalize_due_auctions", { requested_batch_size: 1 }),
    admin.rpc("finalize_due_auctions", { requested_batch_size: 1 }),
  ]);
  const overlapState = await admin
    .from("auctions")
    .select("status")
    .eq("id", overlapAuction.id)
    .single();
  record(
    "overlapping batch runs do not double-finalize",
    overlapping.every(({ error }) => error === null) && overlapState.data?.status === "ended",
  );

  const [sellerResult, winnerResult, loserResult, ordinaryResult, anonymousResult] =
    await Promise.all([
      getAuctionResult(seller, wonAuction.id),
      getAuctionResult(buyerB, wonAuction.id),
      getAuctionResult(buyerA, wonAuction.id),
      getAuctionResult(ordinary, wonAuction.id),
      anonymous.rpc("get_auction_result", { target_auction_id: wonAuction.id }),
    ]);
  record(
    "seller, winner, and losing bidder receive only caller-relative safe result",
    sellerResult.outcome === "ok" &&
      sellerResult.data.callerOutcome === "seller_won" &&
      winnerResult.outcome === "ok" &&
      winnerResult.data.callerOutcome === "won" &&
      loserResult.outcome === "ok" &&
      loserResult.data.callerOutcome === "lost" &&
      winnerResult.data.finalPrice?.amountMinor === 2500 &&
      winnerResult.data.bidCount === 2,
    JSON.stringify({ sellerResult, winnerResult, loserResult }),
  );
  const safeResultText = JSON.stringify({ sellerResult, winnerResult, loserResult });
  record(
    "ordinary and anonymous callers are denied and result exposes only public winner identity",
    ordinaryResult.outcome === "not_found" &&
      anonymousResult.error !== null &&
      !safeResultText.includes(sellerId) &&
      !safeResultText.includes(buyerAId) &&
      safeResultText.includes(buyerBId) &&
      !safeResultText.includes(ordinaryId) &&
      !safeResultText.includes("winning_bid_id") &&
      !safeResultText.includes("bidder_id"),
  );
  const loserRawBids = await buyerA
    .from("auction_bids")
    .select("id, bidder_id")
    .eq("auction_id", wonAuction.id);
  record(
    "losing bidder cannot read the winning Bid row",
    loserRawBids.error === null &&
      loserRawBids.data?.length === 1 &&
      loserRawBids.data[0]?.bidder_id === buyerAId,
  );

  const [sellerCopy, winnerCopy, loserCopy, ordinaryCopy, anonymousCopy] = await Promise.all([
    getPublicCopyDetail(seller, wonCopy.id),
    getPublicCopyDetail(buyerB, wonCopy.id),
    getPublicCopyDetail(buyerA, wonCopy.id),
    getPublicCopyDetail(ordinary, wonCopy.id),
    getPublicCopyDetail(anonymous, wonCopy.id),
  ]);
  const winnerCopyText = JSON.stringify(winnerCopy);
  const loserCopyText = JSON.stringify(loserCopy);
  record(
    "won Auction seller and winner retain the same safe Public Copy projection",
    sellerCopy.outcome === "ok" &&
      winnerCopy.outcome === "ok" &&
      !winnerCopyText.includes(`secret-note-${runId}`) &&
      !winnerCopyText.includes(`secret-provenance-${runId}`) &&
      !winnerCopyText.includes(`secret-location-${runId}`),
  );
  record(
    "losing bidder retains the same safe Copy while unrelated and anonymous viewers remain denied",
    loserCopy.outcome === "ok" &&
      !loserCopyText.includes(`secret-note-${runId}`) &&
      !loserCopyText.includes(`secret-provenance-${runId}`) &&
      !loserCopyText.includes(`secret-location-${runId}`) &&
      ordinaryCopy.outcome === "not_found" &&
      anonymousCopy.outcome === "not_found",
    JSON.stringify({
      loser: loserCopy.outcome,
      ordinary: ordinaryCopy.outcome,
      anonymous: anonymousCopy.outcome,
    }),
  );
  const zeroSellerResult = await getAuctionResult(seller, zeroAuction.id);
  const zeroOrdinaryCopy = await getPublicCopyDetail(ordinary, zeroCopy.id);
  record(
    "zero-bid result is seller-only and unrelated caller loses private Copy access",
    zeroSellerResult.outcome === "ok" &&
      zeroSellerResult.data.callerOutcome === "seller_no_sale" &&
      zeroSellerResult.data.finalPrice === null &&
      zeroOrdinaryCopy.outcome === "not_found",
  );

  const marketAfter = await getEditionMarketOpportunities(ordinary, game.data.id, edition.data.id);
  record(
    "Market and All Offers projections contain no resolved Auction action",
    marketAfter.outcome === "ok" &&
      !marketAfter.data.some(
        (opportunity) =>
          opportunity.type === "auction" &&
          [zeroAuction.id, reserveAuctionId, wonAuction.id].includes(opportunity.auctionId),
      ),
  );

  const authenticatedFinalize = await buyerA.rpc("finalize_auction", {
    target_auction_id: futureAuction.id,
  });
  const authenticatedBatch = await buyerA.rpc("finalize_due_auctions", {
    requested_batch_size: 1,
  });
  record(
    "authenticated mobile caller cannot invoke trusted finalizers",
    authenticatedFinalize.error !== null && authenticatedBatch.error !== null,
  );

  const cronRows = Number(
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
        "-Atc",
        "select count(*) from cron.job where jobname = 'geek-finalize-due-auctions' and schedule = '* * * * *' and active;",
      ],
      { encoding: "utf8" },
    ).trim(),
  );
  record("pg_cron Auction resolver is registered exactly once", cronRows === 1);

  const countdown = formatAuctionCountdown(new Date(Date.now() - 60_000).toISOString());
  const resultPresentations = ["seller_no_sale", "seller_won", "won", "lost"].map((outcome) =>
    getAuctionResultPresentation(outcome),
  );
  const presentationText = JSON.stringify(resultPresentations);
  record(
    "resolved UI is non-negative, caller-truthful, and has no payment or bid action",
    countdown === "00:00" &&
      resultPresentations.every(
        ({ heading, stateLabel }) => heading.length > 0 && stateLabel.length > 0,
      ) &&
      !/payer|checkout|enchérir/i.test(presentationText),
  );

  const resultAfterRelaunch = await getAuctionResult(buyerB, wonAuction.id);
  record(
    "canonical resolved result survives a fresh read",
    resultAfterRelaunch.outcome === "ok" &&
      winnerResult.outcome === "ok" &&
      JSON.stringify(resultAfterRelaunch.data) === JSON.stringify(winnerResult.data),
  );
} finally {
  if (fixture.auctionIds.length) {
    const orderItems = await admin
      .from("order_items")
      .select("order_id")
      .in("auction_id", fixture.auctionIds);
    const orderIds = orderItems.data?.map(({ order_id }) => order_id) ?? [];
    await admin.from("order_items").delete().in("auction_id", fixture.auctionIds);
    if (orderIds.length) await admin.from("orders").delete().in("id", orderIds);
    // Reserve-detail deletion is intentionally draft-only. Return isolated
    // smoke Auctions to draft before deleting their private fixture rows.
    await admin
      .from("auctions")
      .update({ status: "draft" })
      .in("id", fixture.auctionIds)
      .in("status", ["scheduled", "won", "ended", "cancelled"]);
    await admin.from("auction_private_details").delete().in("auction_id", fixture.auctionIds);
    await admin
      .from("auctions")
      .update({
        leading_bid_id: null,
        winning_bid_id: null,
        current_amount_minor: null,
        bid_count: 0,
      })
      .in("id", fixture.auctionIds);
    await admin.from("auction_bids").delete().in("auction_id", fixture.auctionIds);
    await admin.from("auctions").delete().in("id", fixture.auctionIds);
  }
  if (fixture.copyIds.length) await admin.from("copies").delete().in("id", fixture.copyIds);
  if (fixture.editionId) await admin.from("editions").delete().eq("id", fixture.editionId);
  if (fixture.gameId) await admin.from("games").delete().eq("id", fixture.gameId);
  if (fixture.platformId) await admin.from("platforms").delete().eq("id", fixture.platformId);
  for (const userId of fixture.users) await admin.auth.admin.deleteUser(userId);
}

const failed = results.filter(({ passed }) => !passed);
process.stdout.write(
  `\n${results.length - failed.length}/${results.length} Auction Resolution checks passed.\n`,
);
if (failed.length) process.exitCode = 1;
