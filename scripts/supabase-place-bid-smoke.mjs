import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { register } from "node:module";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

register("./typescript-resolver.mjs", import.meta.url);
const { createPlaceBidSubmissionCoordinator, parseBidAmountInput } =
  await import("../apps/mobile/navigation/place-bid-flow.ts");
const { getAuctionForBidding, getEditionMarketOpportunities, getPublicCopyDetail } =
  await import("../packages/data/src/index.ts");
const { createMoney, getAuctionMinimumBid, parseCurrencyCode } =
  await import("../packages/domain/src/index.ts");

const status = JSON.parse(
  execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, authOptions);
const seller = createClient(status.API_URL, status.ANON_KEY, authOptions);
const buyerA = createClient(status.API_URL, status.ANON_KEY, authOptions);
const buyerB = createClient(status.API_URL, status.ANON_KEY, authOptions);
const anonymous = createClient(status.API_URL, status.ANON_KEY, authOptions);
const runId = randomUUID().slice(0, 8);
const password = `Bid-${randomUUID()}`;
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
  process.stdout.write(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
}

function requireValue(value, label) {
  if (value === null || value === undefined) throw new Error(`${label} is required`);
  return value;
}

function row(result) {
  return result.error === null && Array.isArray(result.data) ? result.data[0] : undefined;
}

async function place(client, bidId, auctionId, amountMinor) {
  return client.rpc("place_auction_bid", {
    request_bid_id: bidId,
    target_auction_id: auctionId,
    bid_amount_minor: amountMinor,
  });
}

const [sellerAuth, buyerAAuth, buyerBAuth] = await Promise.all([
  seller.auth.signUp({ email: `bid-seller-${runId}@example.com`, password }),
  buyerA.auth.signUp({ email: `bid-a-${runId}@example.com`, password }),
  buyerB.auth.signUp({ email: `bid-b-${runId}@example.com`, password }),
]);
const sellerId = requireValue(sellerAuth.data.user?.id, "seller");
const buyerAId = requireValue(buyerAAuth.data.user?.id, "buyer A");
const buyerBId = requireValue(buyerBAuth.data.user?.id, "buyer B");
fixture.users.push(sellerId, buyerAId, buyerBId);

try {
  const eur = requireValue(parseCurrencyCode("EUR"), "EUR");
  const parsedBid = parseBidAmountInput("21,50");
  record(
    "buyer amount input maps to canonical integer minor units",
    parsedBid.valid && parsedBid.amount.amountMinor === 2150,
  );
  const attempts = [];
  let releaseFirst;
  const firstPending = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const coordinator = createPlaceBidSubmissionCoordinator({
    createId: () => randomUUID(),
    place: async (attempt, amount) => {
      attempts.push({ ...attempt, amount: amount.amountMinor });
      if (attempts.length === 1) await firstPending;
      return {
        outcome: "failed",
        failure: { source: "database", message: "offline", code: null, details: null, hint: null },
      };
    },
  });
  const bid21 = requireValue(createMoney(2100, eur), "€21");
  const firstSubmission = coordinator.submit(bid21);
  const duplicateSubmission = await coordinator.submit(bid21);
  releaseFirst();
  await firstSubmission;
  await coordinator.submit(bid21);
  const bid22 = requireValue(createMoney(2200, eur), "€22");
  await coordinator.submit(bid22);
  record(
    "UI suppresses duplicate confirm, retries transport with the same id, and changes id for a new amount",
    duplicateSubmission.outcome === "ignored" &&
      attempts.length === 3 &&
      attempts[0].bidId === attempts[1].bidId &&
      attempts[2].bidId !== attempts[1].bidId,
  );
  const staleAttempts = [];
  const oneEuro = requireValue(createMoney(100, eur), "€1");
  const staleCoordinator = createPlaceBidSubmissionCoordinator({
    createId: () => randomUUID(),
    place: async (attempt, amount) => {
      staleAttempts.push(attempt);
      return staleAttempts.length === 1
        ? {
            outcome: "bid_too_low",
            data: {
              auctionId: randomUUID(),
              currentPrice: bid21,
              bidCount: 1,
              minIncrement: oneEuro,
              minimumBid: bid22,
              endsAt: new Date(Date.now() + 60_000).toISOString(),
              status: "scheduled",
            },
          }
        : {
            outcome: "failed",
            failure: {
              source: "database",
              message: `retry ${amount.amountMinor}`,
              code: null,
              details: null,
              hint: null,
            },
          };
    },
  });
  await staleCoordinator.submit(bid21);
  const staleAttemptCleared = staleCoordinator.getAttempt() === null;
  await staleCoordinator.submit(bid22);
  record(
    "stale minimum requires a new explicit request identity",
    staleAttemptCleared &&
      staleAttempts.length === 2 &&
      staleAttempts[0].bidId !== staleAttempts[1].bidId,
  );

  await Promise.all([
    admin
      .from("profiles")
      .update({ username: `bid_seller_${runId}` })
      .eq("id", sellerId),
    admin
      .from("profiles")
      .update({ username: `bid_a_${runId}` })
      .eq("id", buyerAId),
    admin
      .from("profiles")
      .update({ username: `bid_b_${runId}` })
      .eq("id", buyerBId),
  ]);

  const platform = await admin
    .from("platforms")
    .insert({ slug: `bid-${runId}`, name: `Bid ${runId}` })
    .select("id")
    .single();
  if (platform.error) throw platform.error;
  fixture.platformId = platform.data.id;

  const game = await admin
    .from("games")
    .insert({ canonical_title: `Bid Game ${runId}` })
    .select("id")
    .single();
  if (game.error) throw game.error;
  fixture.gameId = game.data.id;

  const edition = await admin
    .from("editions")
    .insert({ game_id: game.data.id, platform_id: platform.data.id, edition_name: "Bid Exact" })
    .select("id")
    .single();
  if (edition.error) throw edition.error;
  fixture.editionId = edition.data.id;

  const copies = await admin
    .from("copies")
    .insert(
      Array.from({ length: 6 }, () => ({
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

  const now = Date.now();
  const liveStart = new Date(now - 60_000).toISOString();
  const liveEnd = new Date(now + 3_600_000).toISOString();
  const auctionDefinitions = [
    { copy: copies.data[0], starts: liveStart, ends: liveEnd },
    { copy: copies.data[1], starts: liveStart, ends: liveEnd },
    { copy: copies.data[2], starts: liveStart, ends: liveEnd },
    {
      copy: copies.data[3],
      starts: new Date(now + 3_600_000).toISOString(),
      ends: new Date(now + 7_200_000).toISOString(),
    },
    {
      copy: copies.data[4],
      starts: new Date(now - 7_200_000).toISOString(),
      ends: new Date(now - 3_600_000).toISOString(),
    },
    { copy: copies.data[5], starts: liveStart, ends: liveEnd },
  ].map(({ copy, starts, ends }) => ({
    id: randomUUID(),
    copy_id: copy.id,
    seller_id: sellerId,
    starting_amount_minor: 2000,
    currency: "EUR",
    min_increment_minor: 100,
    local_pickup: true,
    shipping_available: false,
    status: "scheduled",
    starts_at: starts,
    ends_at: ends,
  }));
  const auctions = await admin.from("auctions").insert(auctionDefinitions).select("id, copy_id");
  if (auctions.error) throw auctions.error;
  fixture.auctionIds.push(...auctions.data.map(({ id }) => id));
  const [mainAuction, equalAuction, higherAuction, upcomingAuction, endedAuction, otherAuction] =
    auctions.data;

  const initialBidContext = await getAuctionForBidding(buyerA, mainAuction.id);
  const initialMinimum =
    initialBidContext.outcome === "ok" ? getAuctionMinimumBid(initialBidContext.data) : null;
  record(
    "bid sheet reads the canonical zero-bid minimum",
    initialBidContext.outcome === "ok" &&
      initialMinimum?.amountMinor === 2000 &&
      initialMinimum.currency === "EUR",
  );

  const oldRpc = await buyerA.rpc("place_auction_bid", {
    target_auction_id: mainAuction.id,
    bid_amount_minor: 2000,
  });
  record("old non-idempotent two-argument RPC is unavailable", oldRpc.error !== null);

  const anonymousBid = await place(anonymous, randomUUID(), mainAuction.id, 2000);
  record("anonymous caller is denied", anonymousBid.error !== null);

  const sellerBid = await place(seller, randomUUID(), mainAuction.id, 2000);
  record("seller cannot bid on own Auction", row(sellerBid)?.result_code === "seller_forbidden");

  const tooLowId = randomUUID();
  const tooLow = await place(buyerA, tooLowId, mainAuction.id, 1999);
  const afterLow = await admin
    .from("auctions")
    .select("current_amount_minor, bid_count")
    .eq("id", mainAuction.id)
    .single();
  record(
    "zero-bid minimum is starting amount and rejection changes nothing",
    row(tooLow)?.result_code === "bid_too_low" &&
      row(tooLow)?.minimum_bid_minor === 2000 &&
      afterLow.data.current_amount_minor === null &&
      afterLow.data.bid_count === 0 &&
      (await admin.from("auction_bids").select("id").eq("id", tooLowId)).data?.length === 0,
  );

  const firstBidId = randomUUID();
  const firstBid = await place(buyerA, firstBidId, mainAuction.id, 2000);
  record(
    "eligible buyer places first integer-minor-unit EUR Bid",
    row(firstBid)?.result_code === "accepted" &&
      row(firstBid)?.bid_id === firstBidId &&
      row(firstBid)?.accepted_amount_minor === 2000 &&
      row(firstBid)?.current_amount_minor === 2000 &&
      row(firstBid)?.bid_count === 1 &&
      row(firstBid)?.currency === "EUR" &&
      row(firstBid)?.minimum_bid_minor === 2100,
  );

  const firstRetry = await place(buyerA, firstBidId, mainAuction.id, 2000);
  const firstBidRows = await admin.from("auction_bids").select("id").eq("id", firstBidId);
  record(
    "same request identity returns one Bid and increments once",
    row(firstRetry)?.result_code === "accepted" &&
      row(firstRetry)?.bid_id === firstBidId &&
      row(firstRetry)?.bid_count === 1 &&
      firstBidRows.data?.length === 1,
  );

  const subsequentLow = await place(buyerB, randomUUID(), mainAuction.id, 2099);
  record(
    "subsequent minimum is current amount plus increment",
    row(subsequentLow)?.result_code === "bid_too_low" &&
      row(subsequentLow)?.minimum_bid_minor === 2100 &&
      row(subsequentLow)?.bid_count === 1,
  );

  const higherBidId = randomUUID();
  const higherBid = await place(buyerB, higherBidId, mainAuction.id, 2500);
  record(
    "higher Bid atomically updates canonical amount and count",
    row(higherBid)?.result_code === "accepted" &&
      row(higherBid)?.current_amount_minor === 2500 &&
      row(higherBid)?.bid_count === 2 &&
      row(higherBid)?.minimum_bid_minor === 2600,
  );

  const [marketAfterBid, publicAfterBid] = await Promise.all([
    getEditionMarketOpportunities(buyerA, game.data.id, edition.data.id),
    getPublicCopyDetail(buyerA, mainAuction.copy_id),
  ]);
  const publicProjection = JSON.stringify(publicAfterBid);
  record(
    "Market, All Offers, and Public Copy reread canonical amount/count without bidder identity",
    marketAfterBid.outcome === "ok" &&
      marketAfterBid.data.some(
        (opportunity) =>
          opportunity.type === "auction" &&
          opportunity.auctionId === mainAuction.id &&
          opportunity.currentPrice.amountMinor === 2500 &&
          opportunity.bidCount === 2,
      ) &&
      publicAfterBid.outcome === "ok" &&
      publicAfterBid.data.opportunity?.type === "auction" &&
      publicAfterBid.data.opportunity.currentPrice.amountMinor === 2500 &&
      publicAfterBid.data.opportunity.bidCount === 2 &&
      !publicProjection.includes(buyerAId) &&
      !publicProjection.includes(buyerBId),
  );

  const retryAfterHigher = await place(buyerA, firstBidId, mainAuction.id, 2000);
  record(
    "retry after a later Bid remains idempotent and returns current projection",
    row(retryAfterHigher)?.result_code === "accepted" &&
      row(retryAfterHigher)?.bid_id === firstBidId &&
      row(retryAfterHigher)?.accepted_amount_minor === 2000 &&
      row(retryAfterHigher)?.current_amount_minor === 2500 &&
      row(retryAfterHigher)?.bid_count === 2,
  );

  const [conflictingAmount, conflictingAuction, conflictingBidder] = await Promise.all([
    place(buyerA, firstBidId, mainAuction.id, 2100),
    place(buyerA, firstBidId, otherAuction.id, 2000),
    place(buyerB, firstBidId, mainAuction.id, 2000),
  ]);
  const conflictText = JSON.stringify(conflictingBidder.error ?? {});
  record(
    "conflicting request identity is rejected without private bidder leakage",
    conflictingAmount.error?.code === "23505" &&
      conflictingAuction.error?.code === "23505" &&
      conflictingBidder.error?.code === "23505" &&
      !conflictText.includes(buyerAId) &&
      !conflictText.includes(`bid-a-${runId}`),
  );

  const endedAt = new Date(Date.now() - 1_000).toISOString();
  await admin
    .from("auctions")
    .update({ starts_at: new Date(Date.now() - 3_600_000).toISOString(), ends_at: endedAt })
    .eq("id", mainAuction.id);
  const retryAfterEnd = await place(buyerA, firstBidId, mainAuction.id, 2000);
  record(
    "retry after Auction end still resolves the original Bid",
    row(retryAfterEnd)?.result_code === "accepted" &&
      row(retryAfterEnd)?.bid_id === firstBidId &&
      row(retryAfterEnd)?.created_at === row(firstBid)?.created_at &&
      row(retryAfterEnd)?.bid_count === 2,
  );

  const upcoming = await place(buyerA, randomUUID(), upcomingAuction.id, 2000);
  const ended = await place(buyerA, randomUUID(), endedAuction.id, 2000);
  record(
    "new Bids are denied outside the canonical live window",
    row(upcoming)?.result_code === "auction_upcoming" &&
      row(ended)?.result_code === "auction_ended",
  );

  const identicalId = randomUUID();
  const identical = await Promise.all([
    place(buyerA, identicalId, equalAuction.id, 2000),
    place(buyerA, identicalId, equalAuction.id, 2000),
  ]);
  const identicalRows = await admin.from("auction_bids").select("id").eq("id", identicalId);
  const equalAfterIdentical = await admin
    .from("auctions")
    .select("bid_count")
    .eq("id", equalAuction.id)
    .single();
  record(
    "concurrent identical retries create one Bid and increment once",
    identical.every((result) => row(result)?.result_code === "accepted") &&
      identicalRows.data?.length === 1 &&
      equalAfterIdentical.data.bid_count === 1,
  );

  await admin
    .from("auctions")
    .update({ current_amount_minor: null, bid_count: 0, leading_bid_id: null })
    .eq("id", equalAuction.id);
  await admin.from("auction_bids").delete().eq("id", identicalId);
  const equalBidIds = [randomUUID(), randomUUID()];
  const equalResults = await Promise.all([
    place(buyerA, equalBidIds[0], equalAuction.id, 2000),
    place(buyerB, equalBidIds[1], equalAuction.id, 2000),
  ]);
  const equalRows = await admin.from("auction_bids").select("id").eq("auction_id", equalAuction.id);
  const equalState = await admin
    .from("auctions")
    .select("current_amount_minor, bid_count")
    .eq("id", equalAuction.id)
    .single();
  record(
    "different concurrent equal-minimum Bids accept at most one",
    equalResults.filter((result) => row(result)?.result_code === "accepted").length === 1 &&
      equalResults.filter((result) => row(result)?.result_code === "bid_too_low").length === 1 &&
      equalRows.data?.length === 1 &&
      equalState.data.current_amount_minor === 2000 &&
      equalState.data.bid_count === 1,
  );

  const differentResults = await Promise.all([
    place(buyerA, randomUUID(), higherAuction.id, 2000),
    place(buyerB, randomUUID(), higherAuction.id, 2500),
  ]);
  const differentRows = await admin
    .from("auction_bids")
    .select("id")
    .eq("auction_id", higherAuction.id);
  const differentState = await admin
    .from("auctions")
    .select("current_amount_minor, bid_count")
    .eq("id", higherAuction.id)
    .single();
  record(
    "concurrent different Bids preserve coherent highest canonical state",
    differentResults.every((result) =>
      ["accepted", "bid_too_low"].includes(row(result)?.result_code),
    ) &&
      differentState.data.current_amount_minor === 2500 &&
      differentState.data.bid_count === differentRows.data?.length &&
      [1, 2].includes(differentState.data.bid_count),
  );

  const copyState = await admin
    .from("copies")
    .select("availability")
    .eq("id", higherAuction.copy_id)
    .single();
  const commitments = await admin
    .from("copy_commercial_commitments")
    .select("kind, auction_id")
    .eq("copy_id", higherAuction.copy_id);
  record(
    "Bids add no commitment and Copy remains in_auction",
    copyState.data.availability === "in_auction" &&
      commitments.data?.length === 1 &&
      commitments.data[0]?.kind === "auction" &&
      commitments.data[0]?.auction_id === higherAuction.id,
  );
} finally {
  if (fixture.auctionIds.length) {
    await admin.from("auctions").update({ status: "cancelled" }).in("id", fixture.auctionIds);
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
  `\n${results.length - failed.length}/${results.length} Place Bid checks passed.\n`,
);
if (failed.length) process.exitCode = 1;
