import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { register } from "node:module";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

register("./typescript-resolver.mjs", import.meta.url);
const { getMyActivity } = await import("../packages/data/src/index.ts");

const status = JSON.parse(
  execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const seller = createClient(status.API_URL, status.ANON_KEY, options);
const caller = createClient(status.API_URL, status.ANON_KEY, options);
const competitor = createClient(status.API_URL, status.ANON_KEY, options);
const unrelated = createClient(status.API_URL, status.ANON_KEY, options);
const anonymous = createClient(status.API_URL, status.ANON_KEY, options);
const runId = randomUUID().slice(0, 8);
const password = `Activity-${randomUUID()}`;
const results = [];
const fixture = {
  users: [],
  platformId: null,
  gameId: null,
  editionId: null,
  copyIds: [],
  auctionIds: [],
  listingIds: [],
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

async function createScheduled(copyId, startsAt, endsAt, startingAmount = 2_000) {
  const id = randomUUID();
  const created = await admin.from("auctions").insert({
    id,
    copy_id: copyId,
    seller_id: sellerId,
    starting_amount_minor: startingAmount,
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

async function createScheduledWithReserve(copyId, startsAt, endsAt, reserveAmountMinor) {
  const id = randomUUID();
  const created = await admin.from("auctions").insert({
    id,
    copy_id: copyId,
    seller_id: sellerId,
    starting_amount_minor: 2_000,
    currency: "EUR",
    min_increment_minor: 100,
    local_pickup: true,
    shipping_available: false,
    status: "draft",
  });
  if (created.error) throw created.error;
  fixture.auctionIds.push(id);

  const privateDetails = await admin.from("auction_private_details").insert({
    auction_id: id,
    reserve_amount_minor: reserveAmountMinor,
  });
  if (privateDetails.error) throw privateDetails.error;

  const scheduled = await admin
    .from("auctions")
    .update({ status: "scheduled", starts_at: startsAt, ends_at: endsAt })
    .eq("id", id);
  if (scheduled.error) throw scheduled.error;
  return id;
}

async function place(client, auctionId, amountMinor) {
  const result = await client.rpc("place_auction_bid", {
    request_bid_id: randomUUID(),
    target_auction_id: auctionId,
    bid_amount_minor: amountMinor,
  });
  if (result.error) throw result.error;
  return requireValue(first(result), "accepted Bid");
}

async function finalize(auctionId, pastEnd) {
  const moved = await admin.from("auctions").update({ ends_at: pastEnd }).eq("id", auctionId);
  if (moved.error) throw moved.error;
  const result = await admin.rpc("finalize_auction", { target_auction_id: auctionId });
  if (result.error) throw result.error;
}

async function allPages(client, segment, limit) {
  const items = [];
  let cursor;
  do {
    const page = await getMyActivity(client, { segment, limit, cursor });
    if (page.outcome !== "ok") throw new Error(JSON.stringify(page));
    items.push(...page.data.items);
    cursor = page.data.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

const [sellerAuth, callerAuth, competitorAuth, unrelatedAuth] = await Promise.all([
  seller.auth.signUp({ email: `activity-seller-${runId}@example.com`, password }),
  caller.auth.signUp({ email: `activity-caller-${runId}@example.com`, password }),
  competitor.auth.signUp({ email: `activity-competitor-${runId}@example.com`, password }),
  unrelated.auth.signUp({ email: `activity-unrelated-${runId}@example.com`, password }),
]);
const sellerId = requireValue(sellerAuth.data.user?.id, "seller");
const callerId = requireValue(callerAuth.data.user?.id, "caller");
const competitorId = requireValue(competitorAuth.data.user?.id, "competitor");
const unrelatedId = requireValue(unrelatedAuth.data.user?.id, "unrelated");
fixture.users.push(sellerId, callerId, competitorId, unrelatedId);

try {
  await admin
    .from("profiles")
    .update({ display_name: `Seller ${runId}`, avatar_path: `avatars/${runId}-seller.png` })
    .eq("id", sellerId);
  await admin
    .from("profiles")
    .update({ display_name: `Caller ${runId}`, avatar_path: `avatars/${runId}-caller.png` })
    .eq("id", callerId);

  const platform = await admin
    .from("platforms")
    .insert({ slug: `activity-${runId}`, name: `Activity ${runId}` })
    .select("id")
    .single();
  if (platform.error) throw platform.error;
  fixture.platformId = platform.data.id;

  const game = await admin
    .from("games")
    .insert({ canonical_title: `Activity Game ${runId}` })
    .select("id")
    .single();
  if (game.error) throw game.error;
  fixture.gameId = game.data.id;

  const edition = await admin
    .from("editions")
    .insert({
      game_id: game.data.id,
      platform_id: platform.data.id,
      edition_name: "Activity Exact",
      region_code: "EU",
    })
    .select("id")
    .single();
  if (edition.error) throw edition.error;
  fixture.editionId = edition.data.id;

  const copies = await admin
    .from("copies")
    .insert(
      Array.from({ length: 8 }, () => ({
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
    leadingCopy,
    outbidCopy,
    resolvingCopy,
    wonCopy,
    lostCopy,
    endedCopy,
    activeCopy,
    withdrawnCopy,
  ] = copies.data;

  await admin.from("copy_private_details").insert({
    copy_id: leadingCopy.id,
    owner_id: sellerId,
    private_notes: `private-${runId}`,
    storage_location: `storage-${runId}`,
  });

  const now = Date.now();
  const liveStart = new Date(now - 60_000).toISOString();
  const liveEnd = new Date(now + 3_600_000).toISOString();
  const pastEnd = new Date(now - 5_000).toISOString();

  const leadingAuctionId = await createScheduled(leadingCopy.id, liveStart, liveEnd);
  await place(caller, leadingAuctionId, 2_000);

  const outbidAuctionId = await createScheduled(outbidCopy.id, liveStart, liveEnd);
  await place(caller, outbidAuctionId, 2_000);
  await place(competitor, outbidAuctionId, 2_100);

  const resolvingAuctionId = await createScheduled(resolvingCopy.id, liveStart, liveEnd);
  await place(caller, resolvingAuctionId, 2_000);
  await admin.from("auctions").update({ ends_at: pastEnd }).eq("id", resolvingAuctionId);

  const wonAuctionId = await createScheduled(wonCopy.id, liveStart, liveEnd);
  await place(caller, wonAuctionId, 2_000);
  await finalize(wonAuctionId, pastEnd);

  const lostAuctionId = await createScheduled(lostCopy.id, liveStart, liveEnd);
  await place(caller, lostAuctionId, 2_000);
  await place(competitor, lostAuctionId, 2_100);
  await finalize(lostAuctionId, pastEnd);

  const endedAuctionId = await createScheduledWithReserve(endedCopy.id, liveStart, liveEnd, 3_000);
  await place(caller, endedAuctionId, 2_000);
  await finalize(endedAuctionId, pastEnd);

  const activeListingId = randomUUID();
  const withdrawnListingId = randomUUID();
  fixture.listingIds.push(activeListingId, withdrawnListingId);
  const listingInsert = await admin.from("listings").insert([
    {
      id: activeListingId,
      copy_id: activeCopy.id,
      seller_id: sellerId,
      asking_amount_minor: 4_200,
      asking_currency: "EUR",
      local_pickup: true,
      status: "active",
      published_at: new Date(now - 30_000).toISOString(),
    },
    {
      id: withdrawnListingId,
      copy_id: withdrawnCopy.id,
      seller_id: sellerId,
      asking_amount_minor: 3_500,
      asking_currency: "EUR",
      local_pickup: true,
      status: "withdrawn",
    },
  ]);
  if (listingInsert.error) throw listingInsert.error;

  const [callerCurrent, callerHistory, sellerCurrent, sellerHistory, unrelatedCurrent] =
    await Promise.all([
      getMyActivity(caller, { segment: "current", limit: 50 }),
      getMyActivity(caller, { segment: "history", limit: 50 }),
      getMyActivity(seller, { segment: "current", limit: 50 }),
      getMyActivity(seller, { segment: "history", limit: 50 }),
      getMyActivity(unrelated, { segment: "current", limit: 50 }),
    ]);
  if (
    callerCurrent.outcome !== "ok" ||
    callerHistory.outcome !== "ok" ||
    sellerCurrent.outcome !== "ok" ||
    sellerHistory.outcome !== "ok" ||
    unrelatedCurrent.outcome !== "ok"
  ) {
    throw new Error(
      JSON.stringify({
        callerCurrent,
        callerHistory,
        sellerCurrent,
        sellerHistory,
        unrelatedCurrent,
      }),
    );
  }

  const callerCurrentByState = new Map(callerCurrent.data.items.map((item) => [item.state, item]));
  const callerHistoryByState = new Map(callerHistory.data.items.map((item) => [item.state, item]));
  const sellerCurrentByState = new Map(sellerCurrent.data.items.map((item) => [item.state, item]));
  const sellerHistoryByState = new Map(sellerHistory.data.items.map((item) => [item.state, item]));

  record(
    "caller sees only caller-relative Activity and an unrelated user sees none",
    unrelatedCurrent.data.items.length === 0 &&
      callerCurrent.data.items.every((item) => ["bidder", "buyer"].includes(item.role)),
  );
  record(
    "leading bidder Auction is current and passive",
    callerCurrentByState.get("auction_bidder_leading")?.objectId === leadingAuctionId &&
      callerCurrentByState.get("auction_bidder_leading")?.requiresAttention === false,
  );
  record(
    "outbid bidder Auction is current and requires attention",
    callerCurrentByState.get("auction_bidder_outbid")?.objectId === outbidAuctionId &&
      callerCurrentByState.get("auction_bidder_outbid")?.requiresAttention === true,
  );
  record(
    "resolving bidder Auction remains current without attention",
    callerCurrentByState.get("auction_bidder_resolving")?.objectId === resolvingAuctionId &&
      callerCurrentByState.get("auction_bidder_resolving")?.requiresAttention === false,
  );
  record(
    "won, lost, and no-sale bidder Auctions are canonical history",
    callerHistoryByState.get("auction_bidder_won")?.objectId === wonAuctionId &&
      callerHistoryByState.get("auction_bidder_lost")?.objectId === lostAuctionId &&
      callerHistoryByState.get("auction_bidder_ended")?.objectId === endedAuctionId,
  );
  record(
    "seller live and resolving Auctions are distinct current seller rows",
    sellerCurrent.data.items.some(
      (item) => item.objectId === leadingAuctionId && item.state === "auction_seller_live",
    ) &&
      sellerCurrent.data.items.some(
        (item) => item.objectId === resolvingAuctionId && item.state === "auction_seller_resolving",
      ),
  );
  record(
    "seller won and ended Auctions are canonical history",
    sellerHistory.data.items.some(
      (item) => item.objectId === wonAuctionId && item.state === "auction_seller_won",
    ) &&
      sellerHistory.data.items.some(
        (item) => item.objectId === endedAuctionId && item.state === "auction_seller_ended",
      ),
  );
  record(
    "winning buyer Order is current, exact-Money, and requires attention",
    callerCurrentByState.get("order_buyer_awaiting_payment")?.amount?.amountMinor === 2_000 &&
      callerCurrentByState.get("order_buyer_awaiting_payment")?.requiresAttention === true &&
      callerCurrentByState.get("order_buyer_awaiting_payment")?.counterparty?.id === sellerId,
  );
  record(
    "seller awaiting-payment Order is current and passive",
    sellerCurrentByState.get("order_seller_awaiting_payment")?.amount?.amountMinor === 2_000 &&
      sellerCurrentByState.get("order_seller_awaiting_payment")?.requiresAttention === false &&
      sellerCurrentByState.get("order_seller_awaiting_payment")?.counterparty?.id === callerId,
  );
  record(
    "won Auction result stays in history while its Order is the current obligation",
    callerHistoryByState.get("auction_bidder_won")?.objectId === wonAuctionId &&
      callerCurrentByState.get("order_buyer_awaiting_payment")?.navigationTarget.kind ===
        "public_copy",
  );
  record(
    "active Listing is current and supported terminal Listing is history",
    sellerCurrentByState.get("listing_active")?.objectId === activeListingId &&
      sellerHistoryByState.get("listing_withdrawn")?.objectId === withdrawnListingId,
  );

  const attentionEnd = callerCurrent.data.items.findIndex((item) => !item.requiresAttention);
  record(
    "current ordering puts every attention row before passive rows",
    attentionEnd === -1 ||
      callerCurrent.data.items.slice(attentionEnd).every((item) => !item.requiresAttention),
  );
  record(
    "history ordering is newest-first with deterministic stable identity",
    callerHistory.data.items.every(
      (item, index, items) =>
        index === 0 ||
        Date.parse(items[index - 1].occurredAt) > Date.parse(item.occurredAt) ||
        (items[index - 1].occurredAt === item.occurredAt && items[index - 1].id < item.id),
    ),
  );

  const [callerCurrentPaged, callerHistoryPaged] = await Promise.all([
    allPages(caller, "current", 2),
    allPages(caller, "history", 2),
  ]);
  record(
    "keyset pagination returns the complete current/history sets without duplicates or skips",
    callerCurrentPaged.map(({ id }) => id).join("|") ===
      callerCurrent.data.items.map(({ id }) => id).join("|") &&
      callerHistoryPaged.map(({ id }) => id).join("|") ===
        callerHistory.data.items.map(({ id }) => id).join("|") &&
      new Set([...callerCurrentPaged, ...callerHistoryPaged].map(({ id }) => id)).size ===
        callerCurrentPaged.length + callerHistoryPaged.length,
  );

  const allRows = [
    ...callerCurrent.data.items,
    ...callerHistory.data.items,
    ...sellerCurrent.data.items,
    ...sellerHistory.data.items,
  ];
  record(
    "every Activity row has stable identity and an existing canonical navigation target",
    allRows.every(
      (item) =>
        item.id === `${item.kind}:${item.objectId}:${item.role}` &&
        (item.navigationTarget.kind === "owned_copy" ||
          (item.navigationTarget.kind === "public_copy" && item.navigationTarget.auctionId)),
    ),
  );
  record(
    "projection exposes no raw Bid, private Copy, auth, location, or Trade fields",
    !/winning_bid|bidder_id|email|token|private_notes|storage_location|latitude|longitude|trade_offer/i.test(
      JSON.stringify(allRows),
    ) &&
      !JSON.stringify(allRows).includes(`private-${runId}`) &&
      !JSON.stringify(allRows).includes(`storage-${runId}`),
  );
  record(
    "Activity V1 contains no Trade projection rows",
    allRows.every((item) => item.kind !== "trade" && !item.state.includes("trade")),
  );

  const [anonymousRows, invalidLimit, rawOrders] = await Promise.all([
    anonymous.rpc("get_my_activity"),
    caller.rpc("get_my_activity", { result_limit: 51 }),
    caller.from("orders").select("*"),
  ]);
  record(
    "anonymous access and unbounded page sizes are rejected",
    anonymousRows.error !== null && invalidLimit.error?.code === "22023",
  );
  record("raw Order RLS remains unchanged", rawOrders.error !== null);
} finally {
  if (fixture.listingIds.length) {
    await admin
      .from("listings")
      .update({ status: "withdrawn" })
      .in("id", fixture.listingIds)
      .eq("status", "active");
    await admin.from("listings").delete().in("id", fixture.listingIds);
  }
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
  `\n${results.length - failed.length}/${results.length} Activity V1 checks passed.\n`,
);
if (failed.length) process.exitCode = 1;
