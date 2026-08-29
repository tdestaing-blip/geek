import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import process from "node:process";
import { URL } from "node:url";

import { createClient } from "@supabase/supabase-js";

register("./typescript-resolver.mjs", import.meta.url);
const { getAuctionOrder, getMyAuctionParticipations } =
  await import("../packages/data/src/index.ts");

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
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const seller = createClient(status.API_URL, status.ANON_KEY, options);
const winner = createClient(status.API_URL, status.ANON_KEY, options);
const loser = createClient(status.API_URL, status.ANON_KEY, options);
const unrelated = createClient(status.API_URL, status.ANON_KEY, options);
const anonymous = createClient(status.API_URL, status.ANON_KEY, options);
const runId = randomUUID().slice(0, 8);
const password = `Order-${randomUUID()}`;
const results = [];
const fixture = {
  users: [],
  platformId: null,
  gameId: null,
  editionId: null,
  copyIds: [],
  auctionIds: [],
  orderIds: [],
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

async function createScheduled(copyId, startsAt, endsAt) {
  const id = randomUUID();
  const created = await admin.from("auctions").insert({
    id,
    copy_id: copyId,
    seller_id: sellerId,
    starting_amount_minor: 2000,
    currency: "EUR",
    min_increment_minor: 100,
    local_pickup: true,
    shipping_available: false,
    status: "scheduled",
    starts_at: startsAt,
    ends_at: endsAt,
  });
  if (created.error) throw created.error;
  fixture.auctionIds.push(id);
  return id;
}

async function place(client, auctionId, amountMinor) {
  return client.rpc("place_auction_bid", {
    request_bid_id: randomUUID(),
    target_auction_id: auctionId,
    bid_amount_minor: amountMinor,
  });
}

async function countsFor(auctionId) {
  const [items, orders] = await Promise.all([
    admin.from("order_items").select("id, order_id").eq("auction_id", auctionId),
    admin
      .from("orders")
      .select("id, order_items!inner(auction_id)")
      .eq("order_items.auction_id", auctionId),
  ]);
  if (items.error) throw items.error;
  if (orders.error) throw orders.error;
  return { itemCount: items.data.length, orderCount: orders.data.length };
}

const [sellerAuth, winnerAuth, loserAuth, unrelatedAuth] = await Promise.all([
  seller.auth.signUp({ email: `order-seller-${runId}@example.com`, password }),
  winner.auth.signUp({ email: `order-winner-${runId}@example.com`, password }),
  loser.auth.signUp({ email: `order-loser-${runId}@example.com`, password }),
  unrelated.auth.signUp({ email: `order-unrelated-${runId}@example.com`, password }),
]);
const sellerId = requireValue(sellerAuth.data.user?.id, "seller");
const winnerId = requireValue(winnerAuth.data.user?.id, "winner");
const loserId = requireValue(loserAuth.data.user?.id, "loser");
const unrelatedId = requireValue(unrelatedAuth.data.user?.id, "unrelated caller");
fixture.users.push(sellerId, winnerId, loserId, unrelatedId);

try {
  const platform = await admin
    .from("platforms")
    .insert({ slug: `order-${runId}`, name: `Order ${runId}` })
    .select("id")
    .single();
  if (platform.error) throw platform.error;
  fixture.platformId = platform.data.id;

  const game = await admin
    .from("games")
    .insert({ canonical_title: `Order Game ${runId}` })
    .select("id")
    .single();
  if (game.error) throw game.error;
  fixture.gameId = game.data.id;

  const edition = await admin
    .from("editions")
    .insert({
      game_id: game.data.id,
      platform_id: platform.data.id,
      edition_name: "Order Exact",
    })
    .select("id")
    .single();
  if (edition.error) throw edition.error;
  fixture.editionId = edition.data.id;

  const copies = await admin
    .from("copies")
    .insert(
      Array.from({ length: 5 }, () => ({
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
  const [wonCopy, liveCopy, futureCopy, zeroCopy, reserveCopy] = copies.data;

  await admin.from("copy_private_details").insert({
    copy_id: wonCopy.id,
    owner_id: sellerId,
    private_notes: `private-${runId}`,
    storage_location: `storage-${runId}`,
  });

  const now = Date.now();
  const pastStart = new Date(now - 3_600_000).toISOString();
  const pastEnd = new Date(now - 1_000).toISOString();
  const liveStart = new Date(now - 60_000).toISOString();
  const liveEnd = new Date(now + 3_600_000).toISOString();
  const futureStart = new Date(now + 3_600_000).toISOString();
  const futureEnd = new Date(now + 7_200_000).toISOString();

  const wonAuctionId = await createScheduled(wonCopy.id, liveStart, liveEnd);
  const losingBid = await place(loser, wonAuctionId, 2000);
  const winningBid = await place(winner, wonAuctionId, 2500);
  await admin.from("auctions").update({ ends_at: pastEnd }).eq("id", wonAuctionId);
  const finalized = await admin.rpc("finalize_auction", { target_auction_id: wonAuctionId });
  const canonical = await admin
    .from("orders")
    .select(
      "id, buyer_id, seller_id, status, currency, created_at, order_items!inner(id, auction_id, copy_id, winning_bid_id, amount_minor, currency)",
    )
    .eq("order_items.auction_id", wonAuctionId)
    .single();
  if (canonical.data) fixture.orderIds.push(canonical.data.id);
  const item = canonical.data?.order_items;
  record(
    "won Auction atomically creates one canonical Order and one OrderItem",
    finalized.error === null &&
      first(losingBid)?.result_code === "accepted" &&
      first(winningBid)?.result_code === "accepted" &&
      canonical.error === null &&
      canonical.data.status === "awaiting_payment" &&
      canonical.data.buyer_id === winnerId &&
      canonical.data.seller_id === sellerId &&
      canonical.data.currency === "EUR" &&
      item?.auction_id === wonAuctionId &&
      item.copy_id === wonCopy.id &&
      item.winning_bid_id === first(winningBid)?.bid_id &&
      item.amount_minor === 2500 &&
      item.currency === "EUR",
    JSON.stringify({ finalized: finalized.error, canonical: canonical.data }),
  );

  const liveAuctionId = await createScheduled(liveCopy.id, liveStart, liveEnd);
  await place(winner, liveAuctionId, 2000);
  const futureAuctionId = await createScheduled(futureCopy.id, futureStart, futureEnd);
  const zeroAuctionId = await createScheduled(zeroCopy.id, pastStart, pastEnd);
  await admin.rpc("finalize_auction", { target_auction_id: zeroAuctionId });

  const reserveAuctionId = randomUUID();
  fixture.auctionIds.push(reserveAuctionId);
  await admin.from("auctions").insert({
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
  await admin
    .from("auction_private_details")
    .insert({ auction_id: reserveAuctionId, reserve_amount_minor: 3000 });
  await admin
    .from("auctions")
    .update({ status: "scheduled", starts_at: liveStart, ends_at: liveEnd })
    .eq("id", reserveAuctionId);
  await place(winner, reserveAuctionId, 2000);
  await admin.from("auctions").update({ ends_at: pastEnd }).eq("id", reserveAuctionId);
  await admin.rpc("finalize_auction", { target_auction_id: reserveAuctionId });

  const nonWonCounts = await Promise.all(
    [liveAuctionId, futureAuctionId, zeroAuctionId, reserveAuctionId].map(countsFor),
  );
  record(
    "live, future, zero-bid ended, and unmet-reserve Auctions create no Orders",
    nonWonCounts.every(({ itemCount, orderCount }) => itemCount === 0 && orderCount === 0),
    JSON.stringify(nonWonCounts),
  );

  const ensureCalls = await Promise.all([
    admin.rpc("ensure_auction_order", { target_auction_id: wonAuctionId }),
    admin.rpc("ensure_auction_order", { target_auction_id: wonAuctionId }),
  ]);
  const afterEnsure = await countsFor(wonAuctionId);
  record(
    "concurrent ensure calls return one stable Order without an orphan parent",
    ensureCalls.every(({ error }) => error === null) &&
      first(ensureCalls[0])?.order_id === canonical.data.id &&
      first(ensureCalls[1])?.order_id === canonical.data.id &&
      afterEnsure.orderCount === 1 &&
      afterEnsure.itemCount === 1,
    JSON.stringify({ ensure: ensureCalls.map(first), counts: afterEnsure }),
  );

  const originalOrderId = canonical.data.id;
  await admin.from("order_items").delete().eq("auction_id", wonAuctionId);
  await admin.from("orders").delete().eq("id", originalOrderId);
  fixture.orderIds.splice(fixture.orderIds.indexOf(originalOrderId), 1);
  const reconciled = await Promise.all([
    admin.rpc("ensure_auction_order", { target_auction_id: wonAuctionId }),
    admin.rpc("ensure_auction_order", { target_auction_id: wonAuctionId }),
  ]);
  const reconciledOrderId = first(reconciled[0])?.order_id;
  if (reconciledOrderId) fixture.orderIds.push(reconciledOrderId);
  const reconciledCounts = await countsFor(wonAuctionId);
  record(
    "missing pre-existing won Order reconciles once and rerun is idempotent",
    reconciled.every(({ error }) => error === null) &&
      reconciledOrderId !== undefined &&
      first(reconciled[1])?.order_id === reconciledOrderId &&
      reconciledCounts.orderCount === 1 &&
      reconciledCounts.itemCount === 1,
  );
  const fixtureOrders = await admin
    .from("orders")
    .select("id, order_items(id)")
    .eq("buyer_id", winnerId)
    .eq("seller_id", sellerId);
  record(
    "concurrent creation leaves no orphan Order",
    fixtureOrders.error === null &&
      fixtureOrders.data.length === 1 &&
      fixtureOrders.data.every(({ order_items }) => order_items !== null),
    JSON.stringify(fixtureOrders.data),
  );

  const [sellerOrder, winnerOrder, loserOrder, unrelatedOrder, anonymousOrder] = await Promise.all([
    getAuctionOrder(seller, wonAuctionId),
    getAuctionOrder(winner, wonAuctionId),
    loser.rpc("get_auction_order", { target_auction_id: wonAuctionId }),
    unrelated.rpc("get_auction_order", { target_auction_id: wonAuctionId }),
    anonymous.rpc("get_auction_order", { target_auction_id: wonAuctionId }),
  ]);
  record(
    "seller and winning buyer read the same safe canonical Order",
    sellerOrder.outcome === "ok" &&
      winnerOrder.outcome === "ok" &&
      sellerOrder.data.orderId === winnerOrder.data.orderId &&
      sellerOrder.data.callerRole === "seller" &&
      winnerOrder.data.callerRole === "buyer" &&
      sellerOrder.data.counterparty.id === winnerId &&
      winnerOrder.data.counterparty.id === sellerId &&
      sellerOrder.data.agreedPrice.amountMinor === 2500,
    JSON.stringify({ sellerOrder, winnerOrder }),
  );
  record(
    "loser, unrelated caller, and anonymous caller are denied Order access",
    loserOrder.error?.code === "42501" &&
      unrelatedOrder.error?.code === "42501" &&
      anonymousOrder.error !== null,
    JSON.stringify({ loser: loserOrder.error?.code, unrelated: unrelatedOrder.error?.code }),
  );

  const projectionText = JSON.stringify({ sellerOrder, winnerOrder });
  record(
    "safe Order projection omits Bid, auth, private Copy, fulfillment, and payment fields",
    !projectionText.includes("winning_bid") &&
      !projectionText.includes(`private-${runId}`) &&
      !projectionText.includes(`storage-${runId}`) &&
      !/email|token|address|fulfillment|payment_method/i.test(projectionText),
  );

  const [sellerRaw, winnerRaw, loserRaw] = await Promise.all([
    seller.from("orders").select("*"),
    winner.from("order_items").select("*"),
    loser.from("orders").select("*"),
  ]);
  record(
    "normal authenticated callers have no raw Order or OrderItem access",
    sellerRaw.error !== null && winnerRaw.error !== null && loserRaw.error !== null,
  );

  const [auctionAfter, copyAfter, commitmentAfter] = await Promise.all([
    admin
      .from("auctions")
      .select("status, winning_bid_id, current_amount_minor")
      .eq("id", wonAuctionId)
      .single(),
    admin.from("copies").select("owner_id, availability").eq("id", wonCopy.id).single(),
    admin
      .from("copy_commercial_commitments")
      .select("auction_id")
      .eq("copy_id", wonCopy.id)
      .single(),
  ]);
  record(
    "Order creation preserves won Auction, seller ownership, in-auction Copy, and commitment",
    auctionAfter.data?.status === "won" &&
      auctionAfter.data.winning_bid_id === first(winningBid)?.bid_id &&
      auctionAfter.data.current_amount_minor === 2500 &&
      copyAfter.data?.owner_id === sellerId &&
      copyAfter.data.availability === "in_auction" &&
      commitmentAfter.data?.auction_id === wonAuctionId,
  );
  const paymentTableCount = Number(
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
        "select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('payments', 'payment_intents', 'payouts', 'refunds', 'disputes');",
      ],
      { encoding: "utf8" },
    ).trim(),
  );
  record(
    "Auction Order V1 creates no payment, payout, refund, or dispute table",
    paymentTableCount === 0,
  );

  const winnerParticipations = await getMyAuctionParticipations(winner);
  const winnerParticipation =
    winnerParticipations.outcome === "ok"
      ? winnerParticipations.data.find(({ auctionId }) => auctionId === wonAuctionId)
      : undefined;
  const loserParticipations = await getMyAuctionParticipations(loser);
  const loserParticipation =
    loserParticipations.outcome === "ok"
      ? loserParticipations.data.find(({ auctionId }) => auctionId === wonAuctionId)
      : undefined;
  record(
    "My Auctions decorates only the winner with awaiting-payment state",
    winnerParticipation?.phase === "resolved" &&
      winnerParticipation.callerOutcome === "won" &&
      winnerParticipation.orderStatus === "awaiting_payment" &&
      loserParticipation?.phase === "resolved" &&
      loserParticipation.callerOutcome === "lost" &&
      loserParticipation.orderStatus === null,
    JSON.stringify({ winnerParticipation, loserParticipation }),
  );

  const canonicalWinnerRows = await winner.rpc("get_my_auction_participations");
  const failedEnrichmentClient = {
    auth: winner.auth,
    rpc(functionName) {
      if (functionName === "get_my_auction_participations") {
        return Promise.resolve(canonicalWinnerRows);
      }
      if (functionName === "get_my_auction_order_statuses") {
        return Promise.resolve({
          data: null,
          error: { code: "PGRST202", message: "Order enrichment unavailable" },
        });
      }
      throw new Error(`Unexpected RPC ${functionName}`);
    },
  };
  const fallbackParticipations = await getMyAuctionParticipations(failedEnrichmentClient);
  const fallbackWinner =
    fallbackParticipations.outcome === "ok"
      ? fallbackParticipations.data.find(({ auctionId }) => auctionId === wonAuctionId)
      : undefined;
  record(
    "Order enrichment failure preserves the canonical resolved winner participation",
    fallbackWinner?.phase === "resolved" &&
      fallbackWinner.callerOutcome === "won" &&
      fallbackWinner.orderStatus === null,
    JSON.stringify(fallbackParticipations),
  );

  const navigationSource = readFileSync(
    new URL("../apps/mobile/navigation/navigation-root.tsx", import.meta.url),
    "utf8",
  );
  const trackerSource = readFileSync(
    new URL("../apps/mobile/ui/auction-presence.tsx", import.meta.url),
    "utf8",
  );
  record(
    "resolved-only participation keeps the floating tracker and Terminées presentation visible",
    navigationSource.includes("if (participations.length === 0) return null") &&
      trackerSource.includes("if (participations.length === 0) return null") &&
      trackerSource.includes("resolvedParticipations.length") &&
      trackerSource.includes("Terminées") &&
      trackerSource.includes("Gagnée") &&
      trackerSource.includes("À régler"),
  );

  const directEnsureLive = await admin.rpc("ensure_auction_order", {
    target_auction_id: liveAuctionId,
  });
  const untrustedEnsure = await winner.rpc("ensure_auction_order", {
    target_auction_id: wonAuctionId,
  });
  record(
    "trusted ensure rejects a non-won Auction without creating transaction state",
    directEnsureLive.error?.code === "23514" && (await countsFor(liveAuctionId)).orderCount === 0,
  );
  record(
    "authenticated mobile callers cannot invoke the trusted creation boundary",
    untrustedEnsure.error !== null,
  );
} finally {
  if (fixture.auctionIds.length) {
    const fixtureItems = await admin
      .from("order_items")
      .select("order_id")
      .in("auction_id", fixture.auctionIds);
    const orderIds = fixtureItems.data?.map(({ order_id }) => order_id) ?? [];
    await admin.from("order_items").delete().in("auction_id", fixture.auctionIds);
    if (orderIds.length) await admin.from("orders").delete().in("id", orderIds);
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
  `\n${results.length - failed.length}/${results.length} Auction Order checks passed.\n`,
);
if (failed.length) process.exitCode = 1;
