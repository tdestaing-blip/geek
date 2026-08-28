import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import process from "node:process";
import { URL } from "node:url";

import { createClient } from "@supabase/supabase-js";

register("./typescript-resolver.mjs", import.meta.url);
const { getAuctionLiveState } = await import("../packages/data/src/index.ts");
const { formatAuctionCountdown, getAuctionRemainingMilliseconds } =
  await import("../apps/mobile/ui/auction-countdown.ts");
const { getAuctionLiveBidderPresentation } =
  await import("../apps/mobile/ui/auction-live-presentation.ts");

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
const password = `Live-${randomUUID()}`;
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

function first(result) {
  return result.error === null && Array.isArray(result.data) ? result.data[0] : undefined;
}

async function place(client, auctionId, amountMinor, bidId = randomUUID()) {
  return client.rpc("place_auction_bid", {
    request_bid_id: bidId,
    target_auction_id: auctionId,
    bid_amount_minor: amountMinor,
  });
}

function milliseconds(value) {
  return Date.parse(value);
}

function isSixtySecondsAfter(endValue, acceptedValue) {
  return milliseconds(endValue) - milliseconds(acceptedValue) === 60_000;
}

const [sellerAuth, buyerAAuth, buyerBAuth] = await Promise.all([
  seller.auth.signUp({ email: `live-seller-${runId}@example.com`, password }),
  buyerA.auth.signUp({ email: `live-a-${runId}@example.com`, password }),
  buyerB.auth.signUp({ email: `live-b-${runId}@example.com`, password }),
]);
const sellerId = requireValue(sellerAuth.data.user?.id, "seller");
const buyerAId = requireValue(buyerAAuth.data.user?.id, "buyer A");
const buyerBId = requireValue(buyerBAuth.data.user?.id, "buyer B");
fixture.users.push(sellerId, buyerAId, buyerBId);

try {
  await Promise.all([
    admin
      .from("profiles")
      .update({ username: `live_seller_${runId}` })
      .eq("id", sellerId),
    admin
      .from("profiles")
      .update({ username: `live_a_${runId}` })
      .eq("id", buyerAId),
    admin
      .from("profiles")
      .update({ username: `live_b_${runId}` })
      .eq("id", buyerBId),
  ]);

  const platform = await admin
    .from("platforms")
    .insert({ slug: `auction-live-${runId}`, name: `Auction Live ${runId}` })
    .select("id")
    .single();
  if (platform.error) throw platform.error;
  fixture.platformId = platform.data.id;

  const game = await admin
    .from("games")
    .insert({ canonical_title: `Auction Live Game ${runId}` })
    .select("id")
    .single();
  if (game.error) throw game.error;
  fixture.gameId = game.data.id;

  const edition = await admin
    .from("editions")
    .insert({
      game_id: game.data.id,
      platform_id: platform.data.id,
      edition_name: "Auction Live Exact",
    })
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

  async function createAuction(copyId, endOffsetMilliseconds) {
    const created = await admin
      .from("auctions")
      .insert({
        id: randomUUID(),
        copy_id: copyId,
        seller_id: sellerId,
        starting_amount_minor: 2000,
        currency: "EUR",
        min_increment_minor: 100,
        local_pickup: true,
        shipping_available: false,
        status: "scheduled",
        starts_at: new Date(Date.now() - 60_000).toISOString(),
        ends_at: new Date(Date.now() + endOffsetMilliseconds).toISOString(),
      })
      .select("id, ends_at")
      .single();
    if (created.error) throw created.error;
    fixture.auctionIds.push(created.data.id);
    return created.data;
  }

  const stableAuction = await createAuction(copies.data[0].id, 120_000);
  const stableBefore = milliseconds(stableAuction.ends_at);
  const stableBid = await place(buyerA, stableAuction.id, 2000);
  record(
    "accepted Bid with more than 60 seconds remaining preserves ends_at",
    first(stableBid)?.result_code === "accepted" &&
      milliseconds(first(stableBid).ends_at) === stableBefore,
  );

  const migrationSource = readFileSync(
    new URL("../supabase/migrations/20260828113000_auction_live_experience.sql", import.meta.url),
    "utf8",
  );
  record(
    "exactly 60 seconds follows the strict less-than rule",
    migrationSource.includes("target_auction.ends_at - decision_at < interval '60 seconds'") &&
      !migrationSource.includes("target_auction.ends_at - decision_at <= interval '60 seconds'"),
  );

  const lateAuction = await createAuction(copies.data[1].id, 45_000);
  const rejectedEnd = milliseconds(lateAuction.ends_at);
  const [anonymousBid, sellerBid, lowBid] = await Promise.all([
    place(anonymous, lateAuction.id, 2000),
    place(seller, lateAuction.id, 2000),
    place(buyerA, lateAuction.id, 1999),
  ]);
  const afterRejected = await admin
    .from("auctions")
    .select("ends_at, bid_count, current_amount_minor")
    .eq("id", lateAuction.id)
    .single();
  record(
    "anonymous, seller, and low Bids do not extend",
    anonymousBid.error !== null &&
      first(sellerBid)?.result_code === "seller_forbidden" &&
      first(lowBid)?.result_code === "bid_too_low" &&
      milliseconds(afterRejected.data.ends_at) === rejectedEnd &&
      afterRejected.data.bid_count === 0 &&
      afterRejected.data.current_amount_minor === null,
  );

  const lateBidId = randomUUID();
  const lateBid = await place(buyerA, lateAuction.id, 2000, lateBidId);
  const lateRow = first(lateBid);
  record(
    "accepted Bid with 59 seconds or less remaining restores a full 60 seconds",
    lateRow?.result_code === "accepted" && isSixtySecondsAfter(lateRow.ends_at, lateRow.created_at),
  );

  const lateRetry = await place(buyerA, lateAuction.id, 2000, lateBidId);
  const lateAfterRetry = await admin
    .from("auctions")
    .select("ends_at, bid_count, current_amount_minor")
    .eq("id", lateAuction.id)
    .single();
  record(
    "idempotent retry does not extend twice or change aggregates",
    first(lateRetry)?.result_code === "accepted" &&
      first(lateRetry)?.ends_at === lateRow.ends_at &&
      lateAfterRetry.data.ends_at === lateRow.ends_at &&
      lateAfterRetry.data.bid_count === 1 &&
      lateAfterRetry.data.current_amount_minor === 2000,
  );

  const oneSecondAuction = await createAuction(copies.data[2].id, 2_000);
  const oneSecondBid = await place(buyerA, oneSecondAuction.id, 2000);
  const oneSecondRow = first(oneSecondBid);
  const originalRemainingAtAcceptance =
    milliseconds(oneSecondAuction.ends_at) - milliseconds(oneSecondRow?.created_at ?? "");
  record(
    "accepted Bid in the final seconds extends from canonical acceptance time",
    oneSecondRow?.result_code === "accepted" &&
      originalRemainingAtAcceptance > 0 &&
      originalRemainingAtAcceptance <= 2_000 &&
      isSixtySecondsAfter(oneSecondRow.ends_at, oneSecondRow.created_at),
  );

  const expiredAuction = await createAuction(copies.data[3].id, 5_000);
  await admin
    .from("auctions")
    .update({ ends_at: new Date(Date.now() - 1_000).toISOString() })
    .eq("id", expiredAuction.id);
  const expiredBefore = await admin
    .from("auctions")
    .select("ends_at")
    .eq("id", expiredAuction.id)
    .single();
  const expiredBid = await place(buyerA, expiredAuction.id, 2000);
  const expiredAfter = await admin
    .from("auctions")
    .select("ends_at, bid_count")
    .eq("id", expiredAuction.id)
    .single();
  record(
    "Bid at or after ends_at is rejected without resurrection or extension",
    ["auction_ended", "auction_unavailable"].includes(first(expiredBid)?.result_code) &&
      expiredAfter.data.ends_at === expiredBefore.data.ends_at &&
      expiredAfter.data.bid_count === 0,
  );

  const competitiveAuction = await createAuction(copies.data[4].id, 45_000);
  const [initialA, initialSeller, initialAnonymous] = await Promise.all([
    getAuctionLiveState(buyerA, competitiveAuction.id),
    getAuctionLiveState(seller, competitiveAuction.id),
    getAuctionLiveState(anonymous, competitiveAuction.id),
  ]);
  record(
    "live state is none for a fresh bidder and absent for seller/anonymous",
    initialA.outcome === "ok" &&
      initialA.data.callerBidState === "none" &&
      initialSeller.outcome === "ok" &&
      initialSeller.data.callerBidState === null &&
      initialAnonymous.outcome === "ok" &&
      initialAnonymous.data.callerBidState === null,
  );

  const firstCompetitive = await place(buyerA, competitiveAuction.id, 2000);
  const afterFirstA = await getAuctionLiveState(buyerA, competitiveAuction.id);
  const secondCompetitive = await place(buyerB, competitiveAuction.id, 2100);
  const [afterSecondA, afterSecondB] = await Promise.all([
    getAuctionLiveState(buyerA, competitiveAuction.id),
    getAuctionLiveState(buyerB, competitiveAuction.id),
  ]);
  record(
    "two final-minute Bids each restore a full canonical response window",
    isSixtySecondsAfter(first(firstCompetitive).ends_at, first(firstCompetitive).created_at) &&
      isSixtySecondsAfter(first(secondCompetitive).ends_at, first(secondCompetitive).created_at) &&
      milliseconds(first(secondCompetitive).ends_at) >=
        milliseconds(first(firstCompetitive).ends_at),
  );
  record(
    "caller state moves from leading to outbid while the new leader is canonical",
    afterFirstA.outcome === "ok" &&
      afterFirstA.data.callerBidState === "leading" &&
      afterSecondA.outcome === "ok" &&
      afterSecondA.data.callerBidState === "outbid" &&
      afterSecondB.outcome === "ok" &&
      afterSecondB.data.callerBidState === "leading" &&
      afterSecondA.data.currentPrice.amountMinor === 2100 &&
      afterSecondA.data.minimumBid.amountMinor === 2200 &&
      afterSecondA.data.bidCount === 2,
  );

  const livePayload = JSON.stringify(afterSecondA);
  const liveKeys = afterSecondA.outcome === "ok" ? Object.keys(afterSecondA.data) : [];
  record(
    "live projection exposes no Bid, bidder, seller, or auth identity",
    !liveKeys.some((key) => /bidId|bidder|leading|seller|user|email/i.test(key)) &&
      !livePayload.includes(buyerAId) &&
      !livePayload.includes(buyerBId) &&
      !livePayload.includes(sellerId),
  );

  const finalizerAuction = await createAuction(copies.data[5].id, 5_000);
  const originalFinalizerEnd = milliseconds(finalizerAuction.ends_at);
  const finalizerBid = await place(buyerA, finalizerAuction.id, 2000);
  const extendedFinalizerEnd = milliseconds(first(finalizerBid).ends_at);
  await admin.rpc("finalize_due_auctions", { requested_batch_size: 100 });
  const beforeExtendedDeadline = await admin
    .from("auctions")
    .select("status, ends_at")
    .eq("id", finalizerAuction.id)
    .single();
  record(
    "resolver does not finalize against the stale pre-extension deadline",
    extendedFinalizerEnd > originalFinalizerEnd &&
      beforeExtendedDeadline.data.status === "scheduled" &&
      milliseconds(beforeExtendedDeadline.data.ends_at) === extendedFinalizerEnd,
  );

  await admin
    .from("auctions")
    .update({ ends_at: new Date(Date.now() - 1_000).toISOString() })
    .eq("id", finalizerAuction.id);
  const finalized = await admin.rpc("finalize_auction", {
    target_auction_id: finalizerAuction.id,
  });
  record(
    "finalization after the extended deadline uses the canonical leading Bid",
    finalized.error === null &&
      finalized.data?.status === "won" &&
      finalized.data?.winning_bid_id === first(finalizerBid).bid_id,
  );

  const countdownNow = Date.parse("2026-08-28T10:00:00.000Z");
  record(
    "countdown progressively formats long, sub-hour, and final-minute time",
    formatAuctionCountdown("2026-08-30T14:36:00.000Z", countdownNow) ===
      "Fin dans 2j : 04h : 36m" &&
      formatAuctionCountdown("2026-08-28T10:36:42.000Z", countdownNow) === "Fin dans 36m : 42s" &&
      formatAuctionCountdown("2026-08-28T10:00:42.000Z", countdownNow) === "00:42",
  );
  record(
    "countdown never becomes negative and a new ends_at changes its basis immediately",
    getAuctionRemainingMilliseconds("2026-08-28T09:59:00.000Z", countdownNow) === 0 &&
      formatAuctionCountdown("2026-08-28T09:59:00.000Z", countdownNow) === "00:00" &&
      formatAuctionCountdown("2026-08-28T10:00:59.000Z", countdownNow) === "00:59",
  );

  const nonePresentation = getAuctionLiveBidderPresentation("none");
  const leadingPresentation = getAuctionLiveBidderPresentation("leading");
  const outbidPresentation = getAuctionLiveBidderPresentation("outbid");
  record(
    "bidder presentation maps none, leading, and outbid truthfully",
    nonePresentation.pillLabel === null &&
      nonePresentation.actionLabel === "Enchérir" &&
      leadingPresentation.pillLabel === "Meilleure" &&
      leadingPresentation.actionLabel === "Enchérir" &&
      outbidPresentation.pillLabel === "Dépassée" &&
      outbidPresentation.actionLabel === "Surenchérir",
  );

  const timerSource = readFileSync(
    new URL("../apps/mobile/ui/use-auction-countdown.ts", import.meta.url),
    "utf8",
  );
  const publicCopySource = readFileSync(
    new URL("../apps/mobile/navigation/public-copy-detail-screen.tsx", import.meta.url),
    "utf8",
  );
  const footerSource = readFileSync(
    new URL("../apps/mobile/ui/sticky-commercial-bar.tsx", import.meta.url),
    "utf8",
  );
  record(
    "per-second presentation timer is focus-scoped and cleans up without per-second fetching",
    timerSource.includes("useIsFocused") &&
      timerSource.includes("setInterval") &&
      timerSource.includes("clearInterval") &&
      !timerSource.includes("supabase") &&
      !timerSource.includes("fetch("),
  );
  record(
    "Public Copy uses focused five-second canonical refresh and foreground refresh",
    publicCopySource.includes("loadCanonicalAuctionLiveState") &&
      publicCopySource.includes("5_000") &&
      publicCopySource.includes('AppState.addEventListener("change"') &&
      publicCopySource.includes("appStateSubscription.remove()"),
  );
  record(
    "live UI keeps Figma footer grammar and removes bidding for owner/resolution/deadline",
    footerSource.includes("Meilleure") &&
      footerSource.includes("Dépassée") &&
      footerSource.includes("bidderPresentation.actionLabel") &&
      footerSource.includes("!ownerView") &&
      footerSource.includes("!resultPresentation") &&
      footerSource.includes("!countdown.expired") &&
      publicCopySource.includes('navigation.navigate("PlaceBid", { auctionId })'),
  );

  const functionDefinitions = await Promise.all([
    admin.rpc("finalize_due_auctions", { requested_batch_size: 1 }),
    anonymous.rpc("get_auction_live_state", { target_auction_id: competitiveAuction.id }),
  ]);
  record(
    "existing cron resolver and narrow live RPC remain callable by trusted contexts",
    functionDefinitions.every((result) => result.error === null),
    JSON.stringify(functionDefinitions.map(({ error }) => error)),
  );
} finally {
  if (fixture.auctionIds.length) {
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
  `\n${results.length - failed.length}/${results.length} Auction Live Experience checks passed.\n`,
);
if (failed.length) process.exitCode = 1;
