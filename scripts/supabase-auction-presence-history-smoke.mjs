import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import process from "node:process";
import { URL } from "node:url";

import { createClient } from "@supabase/supabase-js";

register("./typescript-resolver.mjs", import.meta.url);
const {
  getAuctionBidHistory,
  getAuctionResult,
  getMyAuctionParticipations,
  getPublicCopyDetail,
  getPublicProfile,
} = await import("../packages/data/src/index.ts");

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
const ordinary = createClient(status.API_URL, status.ANON_KEY, authOptions);
const anonymous = createClient(status.API_URL, status.ANON_KEY, authOptions);
const runId = randomUUID().slice(0, 8);
const password = `Presence-${randomUUID()}`;
const results = [];
const fixture = {
  users: [],
  platformId: null,
  gameId: null,
  editionId: null,
  mediaIds: [],
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

async function place(client, auctionId, amountMinor) {
  return client.rpc("place_auction_bid", {
    request_bid_id: randomUUID(),
    target_auction_id: auctionId,
    bid_amount_minor: amountMinor,
  });
}

const [sellerAuth, buyerAAuth, buyerBAuth, ordinaryAuth] = await Promise.all([
  seller.auth.signUp({ email: `presence-seller-${runId}@example.com`, password }),
  buyerA.auth.signUp({ email: `presence-a-${runId}@example.com`, password }),
  buyerB.auth.signUp({ email: `presence-b-${runId}@example.com`, password }),
  ordinary.auth.signUp({ email: `presence-other-${runId}@example.com`, password }),
]);
const sellerId = requireValue(sellerAuth.data.user?.id, "seller");
const buyerAId = requireValue(buyerAAuth.data.user?.id, "buyer A");
const buyerBId = requireValue(buyerBAuth.data.user?.id, "buyer B");
const ordinaryId = requireValue(ordinaryAuth.data.user?.id, "ordinary caller");
fixture.users.push(sellerId, buyerAId, buyerBId, ordinaryId);

try {
  await Promise.all([
    admin
      .from("profiles")
      .update({ display_name: `Seller ${runId}`, avatar_path: null })
      .eq("id", sellerId),
    admin
      .from("profiles")
      .update({ display_name: `Buyer A ${runId}`, avatar_path: "https://example.com/a.png" })
      .eq("id", buyerAId),
    admin
      .from("profiles")
      .update({ display_name: `Buyer B ${runId}`, avatar_path: "https://example.com/b.png" })
      .eq("id", buyerBId),
  ]);

  const platform = await admin
    .from("platforms")
    .insert({ slug: `presence-${runId}`, name: `Presence ${runId}` })
    .select("id")
    .single();
  if (platform.error) throw platform.error;
  fixture.platformId = platform.data.id;

  const game = await admin
    .from("games")
    .insert({ canonical_title: `Presence Game ${runId}` })
    .select("id")
    .single();
  if (game.error) throw game.error;
  fixture.gameId = game.data.id;

  const edition = await admin
    .from("editions")
    .insert({
      game_id: game.data.id,
      platform_id: platform.data.id,
      edition_name: "Presence Exact",
      region_code: "EU",
    })
    .select("id")
    .single();
  if (edition.error) throw edition.error;
  fixture.editionId = edition.data.id;

  const media = await admin
    .from("catalog_media")
    .insert([
      {
        edition_id: edition.data.id,
        kind: "cover_front",
        asset_url: "https://example.com/safe-cover.png",
        source_provider: "smoke",
        source_asset_id: `safe-${runId}`,
        rights_status: "reusable",
        is_primary: true,
      },
      {
        edition_id: edition.data.id,
        kind: "cover_back",
        asset_url: "https://example.com/restricted-cover.png",
        source_provider: "smoke",
        source_asset_id: `restricted-${runId}`,
        rights_status: "restricted",
        is_primary: false,
      },
    ])
    .select("id");
  if (media.error) throw media.error;
  fixture.mediaIds.push(...media.data.map(({ id }) => id));

  const copies = await admin
    .from("copies")
    .insert(
      Array.from({ length: 18 }, () => ({
        owner_id: sellerId,
        game_id: game.data.id,
        edition_id: edition.data.id,
        visibility: "private",
        availability: "private",
      })),
    )
    .select("id, owner_id");
  if (copies.error) throw copies.error;
  fixture.copyIds.push(...copies.data.map(({ id }) => id));
  const [
    leadingCopy,
    outbidCopy,
    futureCopy,
    otherCopy,
    wonCopy,
    endedCopy,
    boundedCopy,
    ...recentResolvedCopies
  ] = copies.data;

  await admin.from("copy_private_details").insert({
    copy_id: wonCopy.id,
    owner_id: sellerId,
    private_notes: `private-note-${runId}`,
    provenance: `private-provenance-${runId}`,
    storage_location: `private-location-${runId}`,
  });

  const now = Date.now();
  async function createAuction(copyId, startsAt, endsAt) {
    const created = await admin
      .from("auctions")
      .insert({
        id: randomUUID(),
        copy_id: copyId,
        seller_id: sellerId,
        starting_amount_minor: 2_000,
        currency: "EUR",
        min_increment_minor: 100,
        local_pickup: true,
        shipping_available: false,
        status: "scheduled",
        starts_at: startsAt,
        ends_at: endsAt,
      })
      .select("id")
      .single();
    if (created.error) throw created.error;
    fixture.auctionIds.push(created.data.id);
    return created.data;
  }

  const liveStart = new Date(now - 60_000).toISOString();
  const liveEnd = new Date(now + 3_600_000).toISOString();
  const futureStart = new Date(now + 3_600_000).toISOString();
  const futureEnd = new Date(now + 7_200_000).toISOString();
  const leadingAuction = await createAuction(leadingCopy.id, liveStart, liveEnd);
  const outbidAuction = await createAuction(outbidCopy.id, liveStart, liveEnd);
  const futureAuction = await createAuction(futureCopy.id, futureStart, futureEnd);
  const otherAuction = await createAuction(otherCopy.id, liveStart, liveEnd);
  const wonAuction = await createAuction(wonCopy.id, liveStart, liveEnd);
  const endedAuction = await createAuction(endedCopy.id, liveStart, liveEnd);
  const boundedAuction = await createAuction(boundedCopy.id, liveStart, liveEnd);

  await place(buyerA, leadingAuction.id, 2_000);
  await place(buyerA, outbidAuction.id, 2_000);
  await place(buyerB, outbidAuction.id, 2_100);
  await place(buyerB, otherAuction.id, 2_000);

  const futureBidId = randomUUID();
  await admin.from("auction_bids").insert({
    id: futureBidId,
    auction_id: futureAuction.id,
    bidder_id: buyerAId,
    amount_minor: 2_000,
  });
  await admin
    .from("auctions")
    .update({ leading_bid_id: futureBidId, current_amount_minor: 2_000, bid_count: 1 })
    .eq("id", futureAuction.id);

  await place(buyerA, wonAuction.id, 2_000);
  const winningBid = await place(buyerB, wonAuction.id, 2_100);
  await admin
    .from("auctions")
    .update({ ends_at: new Date(Date.now() - 1_000).toISOString() })
    .eq("id", wonAuction.id);
  await admin.rpc("finalize_auction", { target_auction_id: wonAuction.id });

  await place(buyerA, endedAuction.id, 2_000);
  await admin
    .from("auctions")
    .update({ ends_at: new Date(Date.now() - 1_000).toISOString(), status: "ended" })
    .eq("id", endedAuction.id);

  const boundedBids = Array.from({ length: 51 }, (_, index) => ({
    id: randomUUID(),
    auction_id: boundedAuction.id,
    bidder_id: index % 2 === 0 ? buyerAId : buyerBId,
    amount_minor: 2_000 + index * 100,
    created_at: new Date(now - (51 - index) * 1_000).toISOString(),
  }));
  await admin.from("auction_bids").insert(boundedBids);
  const boundedLeader = boundedBids.at(-1);
  await admin
    .from("auctions")
    .update({
      leading_bid_id: boundedLeader.id,
      current_amount_minor: boundedLeader.amount_minor,
      bid_count: boundedBids.length,
    })
    .eq("id", boundedAuction.id);

  const recentResolvedAuctionIds = [];
  for (const [index, recentCopy] of recentResolvedCopies.entries()) {
    const recentAuctionId = randomUUID();
    const recentBidId = randomUUID();
    const recentEnd = new Date(now - (index + 2) * 60_000).toISOString();
    const recentStart = new Date(now - 3_600_000).toISOString();
    const recentAuction = await admin.from("auctions").insert({
      id: recentAuctionId,
      copy_id: recentCopy.id,
      seller_id: sellerId,
      starting_amount_minor: 2_000,
      currency: "EUR",
      min_increment_minor: 100,
      local_pickup: true,
      shipping_available: false,
      status: "ended",
      starts_at: recentStart,
      ends_at: recentEnd,
    });
    if (recentAuction.error) throw recentAuction.error;
    fixture.auctionIds.push(recentAuctionId);
    recentResolvedAuctionIds.push(recentAuctionId);
    const recentBid = await admin.from("auction_bids").insert({
      id: recentBidId,
      auction_id: recentAuctionId,
      bidder_id: buyerAId,
      amount_minor: 2_000 + index * 100,
      created_at: recentEnd,
    });
    if (recentBid.error) throw recentBid.error;
    const recentAggregate = await admin
      .from("auctions")
      .update({
        leading_bid_id: recentBidId,
        current_amount_minor: 2_000 + index * 100,
        bid_count: 1,
      })
      .eq("id", recentAuctionId);
    if (recentAggregate.error) throw recentAggregate.error;
  }

  const [activeA, activeB, activeSeller, activeOrdinary] = await Promise.all([
    getMyAuctionParticipations(buyerA),
    getMyAuctionParticipations(buyerB),
    getMyAuctionParticipations(seller),
    getMyAuctionParticipations(ordinary),
  ]);
  const activeARows = activeA.outcome === "ok" ? activeA.data : [];
  const activeALive = activeARows.filter(({ phase }) => phase === "live");
  const activeAResolved = activeARows.filter(({ phase }) => phase === "resolved");
  record(
    "caller tracker returns one row per live accepted participation with leading/outbid truth",
    activeA.outcome === "ok" &&
      activeALive.some(
        ({ auctionId, callerBidState }) =>
          auctionId === leadingAuction.id && callerBidState === "leading",
      ) &&
      activeALive.some(
        ({ auctionId, callerBidState }) =>
          auctionId === outbidAuction.id && callerBidState === "outbid",
      ) &&
      activeALive.some(({ auctionId }) => auctionId === boundedAuction.id),
  );
  record(
    "resolved winner, loser, and no-winner participations are caller-relative",
    activeAResolved.some(
      (row) => row.auctionId === wonAuction.id && row.callerOutcome === "lost",
    ) &&
      activeAResolved.some(
        (row) => row.auctionId === endedAuction.id && row.callerOutcome === "ended",
      ) &&
      activeB.outcome === "ok" &&
      activeB.data.some(
        (row) =>
          row.phase === "resolved" &&
          row.auctionId === wonAuction.id &&
          row.callerOutcome === "won",
      ),
    JSON.stringify({
      buyerA: activeAResolved.map(({ auctionId, callerOutcome }) => ({ auctionId, callerOutcome })),
      buyerB: activeB.outcome === "ok" ? activeB.data : activeB,
      expected: { wonAuction: wonAuction.id, endedAuction: endedAuction.id },
    }),
  );
  record(
    "resolved bidder results are deterministically newest-first and bounded to ten",
    activeAResolved.length === 10 &&
      activeAResolved.every(
        (row, index) =>
          index === 0 || Date.parse(activeAResolved[index - 1].endsAt) >= Date.parse(row.endsAt),
      ) &&
      !activeAResolved.some(({ auctionId }) => auctionId === recentResolvedAuctionIds.at(-1)),
  );
  record(
    "future, seller-only, viewed, and another-user Auctions are absent",
    !activeARows.some(({ auctionId }) => [futureAuction.id, otherAuction.id].includes(auctionId)) &&
      activeSeller.outcome === "ok" &&
      activeSeller.data.length === 0 &&
      activeOrdinary.outcome === "ok" &&
      activeOrdinary.data.length === 0 &&
      activeB.outcome === "ok",
  );
  record(
    "tracker uses only rights-safe media and fixed safe fields",
    activeARows.every(
      ({ coverAssetUrl }) => coverAssetUrl === "https://example.com/safe-cover.png",
    ) &&
      !JSON.stringify(activeARows).includes("restricted-cover") &&
      !JSON.stringify(activeARows).includes(buyerBId) &&
      !JSON.stringify(activeARows).includes(sellerId),
  );

  const extendedEnd = new Date(now + 4_000_000).toISOString();
  await admin.from("auctions").update({ ends_at: extendedEnd }).eq("id", leadingAuction.id);
  const refreshedA = await getMyAuctionParticipations(buyerA);
  const refreshedLeading =
    refreshedA.outcome === "ok"
      ? refreshedA.data.find(({ auctionId }) => auctionId === leadingAuction.id)
      : undefined;
  record(
    "canonical anti-sniping deadline and current aggregates refresh in one request",
    refreshedLeading !== undefined &&
      Date.parse(refreshedLeading.endsAt) === Date.parse(extendedEnd) &&
      refreshedLeading.currentPrice.amountMinor === 2_000 &&
      refreshedLeading.bidCount === 1,
  );

  await admin
    .from("auctions")
    .update({ ends_at: new Date(Date.now() - 1_000).toISOString() })
    .eq("id", leadingAuction.id);
  const resolvingA = await getMyAuctionParticipations(buyerA);
  const resolvingRow =
    resolvingA.outcome === "ok"
      ? resolvingA.data.find(({ auctionId }) => auctionId === leadingAuction.id)
      : undefined;
  record(
    "deadline-to-resolver gap keeps one non-actionable row without stale countdown state",
    resolvingRow?.phase === "resolving" &&
      !("callerBidState" in resolvingRow) &&
      !("callerOutcome" in resolvingRow),
  );
  await admin.rpc("finalize_auction", { target_auction_id: leadingAuction.id });
  const transitionedA = await getMyAuctionParticipations(buyerA);
  const transitionedRow =
    transitionedA.outcome === "ok"
      ? transitionedA.data.find(({ auctionId }) => auctionId === leadingAuction.id)
      : undefined;
  record(
    "one canonical refresh transitions a live row to a resolved result without stale live state",
    transitionedRow?.phase === "resolved" &&
      transitionedRow.callerOutcome === "won" &&
      !("callerBidState" in transitionedRow),
  );

  const [liveHistoryA, liveHistoryAnon, boundedHistory] = await Promise.all([
    getAuctionBidHistory(buyerA, outbidAuction.id),
    getAuctionBidHistory(anonymous, outbidAuction.id),
    getAuctionBidHistory(buyerA, boundedAuction.id),
  ]);
  record(
    "live safe history is newest-first with public identities, Vous, and canonical leader",
    liveHistoryA.outcome === "ok" &&
      liveHistoryA.data.length === 2 &&
      liveHistoryA.data[0].bidder.id === buyerBId &&
      liveHistoryA.data[0].isLeading &&
      !liveHistoryA.data[0].isWinning &&
      liveHistoryA.data[1].bidder.id === buyerAId &&
      liveHistoryA.data[1].isCaller &&
      liveHistoryAnon.outcome === "ok" &&
      liveHistoryAnon.data.every(({ isCaller }) => !isCaller),
  );
  record(
    "history is capped at 50 and deterministic newest-first",
    boundedHistory.outcome === "ok" &&
      boundedHistory.data.length === 50 &&
      boundedHistory.data[0].amount.amountMinor === boundedLeader.amount_minor &&
      boundedHistory.data.at(-1).amount.amountMinor === boundedBids[1].amount_minor,
  );
  const safeHistoryText = JSON.stringify(liveHistoryA);
  record(
    "safe history exposes no raw Bid id, email, credential, or private Profile field",
    !/bidId|bid_id|email|token|credential|bio|username/i.test(safeHistoryText),
  );

  const rawA = await buyerA
    .from("auction_bids")
    .select("id, bidder_id")
    .eq("auction_id", outbidAuction.id);
  const rawOrdinary = await ordinary
    .from("auction_bids")
    .select("id, bidder_id")
    .eq("auction_id", outbidAuction.id);
  record(
    "raw Bid RLS remains bidder-private",
    rawA.error === null &&
      rawA.data.length === 1 &&
      rawA.data[0].bidder_id === buyerAId &&
      rawOrdinary.error === null &&
      rawOrdinary.data.length === 0,
  );

  const [sellerResult, winnerResult, loserResult, ordinaryResult] = await Promise.all([
    getAuctionResult(seller, wonAuction.id),
    getAuctionResult(buyerB, wonAuction.id),
    getAuctionResult(buyerA, wonAuction.id),
    getAuctionResult(ordinary, wonAuction.id),
  ]);
  record(
    "resolved seller, winner, and loser see the same public winner identity",
    [sellerResult, winnerResult, loserResult].every(
      (result) => result.outcome === "ok" && result.data.winner?.id === buyerBId,
    ) &&
      sellerResult.outcome === "ok" &&
      sellerResult.data.callerOutcome === "seller_won" &&
      winnerResult.outcome === "ok" &&
      winnerResult.data.callerOutcome === "won" &&
      loserResult.outcome === "ok" &&
      loserResult.data.callerOutcome === "lost" &&
      ordinaryResult.outcome === "not_found",
  );
  record(
    "winner identity is public Profile only and canonical ownership does not transfer",
    winnerResult.outcome === "ok" &&
      winnerResult.data.winner?.displayName === `Buyer B ${runId}` &&
      !JSON.stringify(winnerResult.data.winner).includes(first(winningBid)?.bid_id ?? "missing") &&
      wonCopy.owner_id === sellerId,
  );

  const [sellerCopy, winnerCopy, loserCopy, endedBidderCopy, ordinaryCopy, anonymousCopy] =
    await Promise.all([
      getPublicCopyDetail(seller, wonCopy.id),
      getPublicCopyDetail(buyerB, wonCopy.id),
      getPublicCopyDetail(buyerA, wonCopy.id),
      getPublicCopyDetail(buyerA, endedCopy.id),
      getPublicCopyDetail(ordinary, wonCopy.id),
      getPublicCopyDetail(anonymous, wonCopy.id),
    ]);
  record(
    "seller, winner, losing bidder, and no-winner bidder retain safe Copy access",
    sellerCopy.outcome === "ok" &&
      winnerCopy.outcome === "ok" &&
      loserCopy.outcome === "ok" &&
      endedBidderCopy.outcome === "ok",
  );
  record(
    "unrelated and anonymous callers remain denied for a private resolved Copy",
    ordinaryCopy.outcome === "not_found" && anonymousCopy.outcome === "not_found",
    JSON.stringify({ ordinary: ordinaryCopy.outcome, anonymous: anonymousCopy.outcome }),
  );
  record(
    "participant projection contains no private Copy details",
    loserCopy.outcome === "ok" &&
      !JSON.stringify(loserCopy.data).includes(`private-note-${runId}`) &&
      !JSON.stringify(loserCopy.data).includes(`private-provenance-${runId}`) &&
      !JSON.stringify(loserCopy.data).includes(`private-location-${runId}`),
  );

  const [resolvedHistorySeller, resolvedHistoryWinner, resolvedHistoryLoser] = await Promise.all([
    getAuctionBidHistory(seller, wonAuction.id),
    getAuctionBidHistory(buyerB, wonAuction.id),
    getAuctionBidHistory(buyerA, wonAuction.id),
  ]);
  const deniedResolvedHistory = await ordinary.rpc("get_auction_bid_history", {
    target_auction_id: wonAuction.id,
  });
  record(
    "resolved history is available to seller/winner/loser and marks only the winning Bid",
    [resolvedHistorySeller, resolvedHistoryWinner, resolvedHistoryLoser].every(
      (result) =>
        result.outcome === "ok" && result.data.filter(({ isWinning }) => isWinning).length === 1,
    ) && deniedResolvedHistory.error?.code === "42501",
  );

  const publicBidderProfile = await getPublicProfile(anonymous, buyerBId);
  record(
    "safe Bidder Profile navigation resolves the canonical public Profile identity",
    publicBidderProfile.outcome === "ok" &&
      publicBidderProfile.data.id === buyerBId &&
      publicBidderProfile.data.displayName === `Buyer B ${runId}` &&
      !JSON.stringify(publicBidderProfile.data).includes("email"),
  );

  const migrationSource = [
    "20260828140000_auction_presence_history.sql",
    "20260828153000_auction_participation_results.sql",
  ]
    .map((name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"))
    .join("\n");
  const providerSource = readFileSync(
    new URL("../apps/mobile/lib/auction/auction-presence-provider.tsx", import.meta.url),
    "utf8",
  );
  const trackerSource = readFileSync(
    new URL("../apps/mobile/ui/auction-presence.tsx", import.meta.url),
    "utf8",
  );
  const barSource = readFileSync(
    new URL("../apps/mobile/ui/sticky-commercial-bar.tsx", import.meta.url),
    "utf8",
  );
  const profileSource = readFileSync(
    new URL("../apps/mobile/navigation/profile-screen.tsx", import.meta.url),
    "utf8",
  );
  record(
    "SECURITY DEFINER projections derive auth.uid with empty search_path and fixed grants",
    migrationSource.includes("caller_id uuid := auth.uid()") &&
      migrationSource.match(/security definer/g)?.length >= 4 &&
      migrationSource.match(/set search_path = ''/g)?.length >= 4 &&
      !migrationSource.includes("requested_user_id"),
  );
  record(
    "PublicProfile keeps typed userId navigation and falls back from fixtures to canonical public data",
    profileSource.includes("getPublicProfile(supabase, route.params.userId)") &&
      profileSource.includes("findCollectorFixture(route.params.userId)") &&
      !profileSource.includes("Unknown local collector fixture"),
  );
  record(
    "global refresh is one request, foreground-scoped, five-second, and stops without current rows",
    providerSource.includes("loadMyAuctionParticipations()") &&
      providerSource.includes("5_000") &&
      providerSource.includes('AppState.addEventListener("change"') &&
      providerSource.includes("currentParticipationCount === 0") &&
      providerSource.includes("setInterval") &&
      !providerSource.includes("Promise.all"),
  );
  record(
    "floating UI keeps recent-only results visible and separates live/resolved rows",
    trackerSource.includes("if (participations.length === 0) return null") &&
      trackerSource.includes("maxHeight: 252") &&
      trackerSource.match(/setInterval/g)?.length === 1 &&
      trackerSource.includes("En cours") &&
      trackerSource.includes("Terminées") &&
      trackerSource.includes("Meilleure") &&
      trackerSource.includes("Dépassée") &&
      trackerSource.includes("Gagnée") &&
      trackerSource.includes("Perdue") &&
      trackerSource.includes("Résolution…") &&
      trackerSource.includes('participation.phase === "live"'),
  );
  record(
    "existing Auction strip remains the expandable entry with bounded history and retry",
    barSource.includes("onToggleAuctionHistory") &&
      barSource.includes("Historique des enchères") &&
      barSource.includes("maxHeight: 286") &&
      barSource.includes("Réessayer"),
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
  if (fixture.mediaIds.length)
    await admin.from("catalog_media").delete().in("id", fixture.mediaIds);
  if (fixture.editionId) await admin.from("editions").delete().eq("id", fixture.editionId);
  if (fixture.gameId) await admin.from("games").delete().eq("id", fixture.gameId);
  if (fixture.platformId) await admin.from("platforms").delete().eq("id", fixture.platformId);
  for (const userId of fixture.users) await admin.auth.admin.deleteUser(userId);
}

const failed = results.filter(({ passed }) => !passed);
process.stdout.write(
  `\n${results.length - failed.length}/${results.length} Auction Presence & History checks passed.\n`,
);
if (failed.length) process.exitCode = 1;
