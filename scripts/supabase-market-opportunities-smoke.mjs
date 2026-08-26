import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { register } from "node:module";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

register("./typescript-resolver.mjs", import.meta.url);
const { getEditionMarketOpportunities, getPublicCopyDetail } =
  await import("../packages/data/src/index.ts");

const status = JSON.parse(
  execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, authOptions);
const anonymous = createClient(status.API_URL, status.ANON_KEY, authOptions);
const caller = createClient(status.API_URL, status.ANON_KEY, authOptions);
const seller = createClient(status.API_URL, status.ANON_KEY, authOptions);
const unrelated = createClient(status.API_URL, status.ANON_KEY, authOptions);
const runId = randomUUID().slice(0, 8);
const password = `Market-${randomUUID()}`;
const results = [];
const fixture = {
  users: [],
  games: [],
  editions: [],
  platform: null,
  copies: [],
  listings: [],
  auctions: [],
};

function record(name, passed, detail) {
  results.push({ name, passed });
  process.stdout.write(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
}

function oneRow(result) {
  return result.error === null && Array.isArray(result.data) && result.data.length > 0;
}

const [callerAuth, sellerAuth, unrelatedAuth] = await Promise.all([
  caller.auth.signUp({ email: `market-caller-${runId}@example.com`, password }),
  seller.auth.signUp({ email: `market-seller-${runId}@example.com`, password }),
  unrelated.auth.signUp({ email: `market-unrelated-${runId}@example.com`, password }),
]);
const callerId = callerAuth.data.user.id;
const sellerId = sellerAuth.data.user.id;
const unrelatedId = unrelatedAuth.data.user.id;
fixture.users.push(callerId, sellerId, unrelatedId);

try {
  await Promise.all([
    admin
      .from("profiles")
      .update({ username: `caller_${runId}` })
      .eq("id", callerId),
    admin
      .from("profiles")
      .update({ username: `seller_${runId}`, display_name: "Safe Seller" })
      .eq("id", sellerId),
    admin
      .from("profiles")
      .update({ username: `unrelated_${runId}` })
      .eq("id", unrelatedId),
  ]);

  const platform = await admin
    .from("platforms")
    .insert({ slug: `market-${runId}`, name: `Market ${runId}` })
    .select("id")
    .single();
  fixture.platform = platform.data.id;
  const games = await admin
    .from("games")
    .insert([
      { canonical_title: `Market Game ${runId}`, description: "Public catalog description" },
      { canonical_title: `Trade Back Game ${runId}` },
    ])
    .select("id");
  const [game, tradeBackGame] = games.data;
  fixture.games.push(game.id, tradeBackGame.id);
  const editions = await admin
    .from("editions")
    .insert([
      { game_id: game.id, platform_id: platform.data.id, edition_name: "Exact", region_code: "EU" },
      { game_id: game.id, platform_id: platform.data.id, edition_name: "Other", region_code: "US" },
      { game_id: tradeBackGame.id, platform_id: platform.data.id, edition_name: "Trade back" },
    ])
    .select("id, game_id");
  const [edition, otherEdition, tradeBackEdition] = editions.data;
  fixture.editions.push(edition.id, otherEdition.id, tradeBackEdition.id);
  const component = await admin
    .from("edition_components")
    .insert({
      edition_id: edition.id,
      component_key: "cartridge",
      name: "Cartridge",
      kind: "cartridge",
      sort_order: 1,
    })
    .select("id")
    .single();

  const copies = await admin
    .from("copies")
    .insert(
      [
        { owner_id: sellerId, game_id: game.id, edition_id: edition.id, visibility: "public" },
        { owner_id: callerId, game_id: game.id, edition_id: edition.id },
        { owner_id: sellerId, game_id: game.id, edition_id: edition.id },
        { owner_id: sellerId, game_id: game.id, edition_id: edition.id },
        { owner_id: sellerId, game_id: game.id, edition_id: edition.id },
        { owner_id: sellerId, game_id: game.id, edition_id: edition.id },
        { owner_id: sellerId, game_id: game.id, edition_id: edition.id },
        { owner_id: sellerId, game_id: game.id, edition_id: edition.id },
        { owner_id: sellerId, game_id: game.id, edition_id: edition.id },
        {
          owner_id: sellerId,
          game_id: game.id,
          edition_id: edition.id,
          availability: "open_to_trade",
        },
        {
          owner_id: sellerId,
          game_id: game.id,
          edition_id: edition.id,
          availability: "open_to_trade",
        },
        {
          owner_id: callerId,
          game_id: tradeBackGame.id,
          edition_id: tradeBackEdition.id,
          availability: "open_to_trade",
        },
        { owner_id: sellerId, game_id: game.id, edition_id: otherEdition.id },
      ].map((copy) => ({ visibility: "private", availability: "private", ...copy })),
    )
    .select("id");
  if (copies.error !== null) throw new Error(`Copy fixture setup failed: ${copies.error.message}`);
  const [
    publicCopy,
    ownedCopy,
    listingCopy,
    auctionCopy,
    hiddenCopy,
    expiredListingCopy,
    endedAuctionCopy,
    cancelledAuctionCopy,
    conflictCopy,
    openOnlyCopy,
    tradeCopy,
    callerTradeCopy,
    otherEditionCopy,
  ] = copies.data;
  fixture.copies.push(...copies.data.map(({ id }) => id));

  await admin.from("copy_private_details").insert({
    copy_id: listingCopy.id,
    purchase_amount_minor: 1234,
    purchase_currency: "EUR",
    provenance: "private provenance",
    private_notes: "private note",
    storage_location: "private shelf",
  });
  await admin.from("copy_component_states").insert({
    copy_id: listingCopy.id,
    edition_id: edition.id,
    edition_component_id: component.data.id,
    presence: "present",
    condition_grade: 4,
    condition_notes: "private component note",
  });

  const listingRows = await admin
    .from("listings")
    .insert([
      {
        copy_id: listingCopy.id,
        seller_id: sellerId,
        asking_amount_minor: 5600,
        asking_currency: "EUR",
        status: "active",
        published_at: new Date().toISOString(),
      },
      {
        copy_id: expiredListingCopy.id,
        seller_id: sellerId,
        asking_amount_minor: 5700,
        asking_currency: "EUR",
        status: "active",
        published_at: new Date().toISOString(),
      },
      {
        copy_id: conflictCopy.id,
        seller_id: sellerId,
        asking_amount_minor: 5800,
        asking_currency: "EUR",
        status: "active",
        published_at: new Date().toISOString(),
      },
      {
        copy_id: otherEditionCopy.id,
        seller_id: sellerId,
        asking_amount_minor: 5900,
        asking_currency: "EUR",
        status: "active",
        published_at: new Date().toISOString(),
      },
    ])
    .select("id, copy_id");
  fixture.listings.push(...listingRows.data.map(({ id }) => id));
  await admin.from("listings").update({ status: "expired" }).eq("copy_id", expiredListingCopy.id);

  const now = Date.now();
  const startsAt = new Date(now - 60_000).toISOString();
  const endsAt = new Date(now + 86_400_000).toISOString();
  const auctionRows = await admin
    .from("auctions")
    .insert([
      {
        copy_id: auctionCopy.id,
        seller_id: sellerId,
        starting_amount_minor: 4000,
        currency: "EUR",
        min_increment_minor: 100,
        status: "scheduled",
        starts_at: startsAt,
        ends_at: endsAt,
      },
      {
        copy_id: endedAuctionCopy.id,
        seller_id: sellerId,
        starting_amount_minor: 4100,
        currency: "EUR",
        min_increment_minor: 100,
        status: "scheduled",
        starts_at: startsAt,
        ends_at: endsAt,
      },
      {
        copy_id: cancelledAuctionCopy.id,
        seller_id: sellerId,
        starting_amount_minor: 4200,
        currency: "EUR",
        min_increment_minor: 100,
        status: "scheduled",
        starts_at: startsAt,
        ends_at: endsAt,
      },
    ])
    .select("id, copy_id");
  fixture.auctions.push(...auctionRows.data.map(({ id }) => id));
  await admin.from("auctions").update({ status: "ended" }).eq("copy_id", endedAuctionCopy.id);
  await admin
    .from("auctions")
    .update({ status: "cancelled" })
    .eq("copy_id", cancelledAuctionCopy.id);

  const publicResult = await anonymous.rpc("get_public_copy_detail", {
    target_copy_id: publicCopy.id,
  });
  record("A. public Copy resolves safely", oneRow(publicResult), publicResult.error?.message);
  const ownedResult = await caller.rpc("get_public_copy_detail", { target_copy_id: ownedCopy.id });
  record(
    "B. caller-owned private Copy resolves safely",
    oneRow(ownedResult),
    ownedResult.error?.message,
  );
  const listingResult = await anonymous.rpc("get_public_copy_detail", {
    target_copy_id: listingCopy.id,
  });
  record(
    "C. active Listing grants fixed private-Copy projection",
    oneRow(listingResult) && listingResult.data[0].listing_amount_minor === 5600,
    listingResult.error?.message,
  );
  const auctionResult = await anonymous.rpc("get_public_copy_detail", {
    target_copy_id: auctionCopy.id,
  });
  record(
    "D. active Auction grants fixed private-Copy projection",
    oneRow(auctionResult) && auctionResult.data[0].auction_id !== null,
    auctionResult.error?.message,
  );
  const hiddenResult = await unrelated.rpc("get_public_copy_detail", {
    target_copy_id: hiddenCopy.id,
  });
  record(
    "E. hidden private Copy returns no row",
    hiddenResult.error === null && hiddenResult.data.length === 0,
  );
  const expiredResult = await unrelated.rpc("get_public_copy_detail", {
    target_copy_id: expiredListingCopy.id,
  });
  record(
    "F. expired Listing no longer grants access",
    expiredResult.error === null && expiredResult.data.length === 0,
  );
  const endedResult = await unrelated.rpc("get_public_copy_detail", {
    target_copy_id: endedAuctionCopy.id,
  });
  const cancelledResult = await unrelated.rpc("get_public_copy_detail", {
    target_copy_id: cancelledAuctionCopy.id,
  });
  record(
    "G. ended and cancelled Auctions no longer grant access",
    endedResult.error === null &&
      endedResult.data.length === 0 &&
      cancelledResult.error === null &&
      cancelledResult.data.length === 0,
  );
  const openOnlyResult = await caller.rpc("get_public_copy_detail", {
    target_copy_id: openOnlyCopy.id,
  });
  record(
    "H. open_to_trade alone grants no access",
    openOnlyResult.error === null && openOnlyResult.data.length === 0,
  );

  await admin.from("user_discovery_locations").insert([
    {
      user_id: callerId,
      location: "POINT(2.35 48.85)",
      source: "city_selection",
    },
    {
      user_id: sellerId,
      location: "POINT(2.36 48.86)",
      source: "city_selection",
    },
  ]);
  await admin.from("wishlist_intents").insert([
    {
      owner_id: callerId,
      game_id: game.id,
      edition_id: edition.id,
      visibility: "private",
      trade_interest: true,
    },
    {
      owner_id: sellerId,
      game_id: tradeBackGame.id,
      edition_id: tradeBackEdition.id,
      visibility: "public",
      trade_interest: true,
    },
  ]);
  const canonicalTrade = await caller.rpc("get_my_reciprocal_trade_match_pairs", {
    max_distance_km: 200,
    result_limit: 50,
    result_offset: 0,
  });
  const tradeResult = await caller.rpc("get_public_copy_detail", { target_copy_id: tradeCopy.id });
  record(
    "I. genuine reciprocal Match grants caller-specific Trade projection",
    canonicalTrade.error === null &&
      canonicalTrade.data.some(
        (match) => match.their_copy_id === tradeCopy.id && match.my_copy_id === callerTradeCopy.id,
      ) &&
      oneRow(tradeResult) &&
      tradeResult.data[0].trade_available === true,
    canonicalTrade.error?.message ??
      tradeResult.error?.message ??
      `matches=${canonicalTrade.data?.length ?? 0}, projection=${tradeResult.data?.length ?? 0}`,
  );
  const unrelatedTrade = await unrelated.rpc("get_public_copy_detail", {
    target_copy_id: tradeCopy.id,
  });
  record(
    "J. unrelated caller receives no reciprocal Trade data",
    unrelatedTrade.error === null && unrelatedTrade.data.length === 0,
  );

  const publicKeys = new Set(Object.keys(listingResult.data?.[0] ?? {}));
  const forbiddenKeys = [
    "purchase_amount_minor",
    "purchase_currency",
    "provenance",
    "private_notes",
    "storage_location",
    "condition_notes",
    "storage_path",
    "location",
    "email",
  ];
  record(
    "K-M. private Copy, photo, owner, and auth fields are absent",
    forbiddenKeys.every((key) => !publicKeys.has(key)),
  );

  const conflictAuction = await admin.from("auctions").insert({
    copy_id: conflictCopy.id,
    seller_id: sellerId,
    starting_amount_minor: 4300,
    currency: "EUR",
    min_increment_minor: 100,
    status: "scheduled",
    starts_at: startsAt,
    ends_at: endsAt,
  });
  record(
    "N. incompatible active commitment is rejected rather than arbitrarily projected",
    conflictAuction.error?.code === "23505" || conflictAuction.error?.code === "23514",
    conflictAuction.error?.code,
  );

  const exactOpportunities = await getEditionMarketOpportunities(caller, game.id, edition.id);
  record(
    "O. exact-Edition opportunity discovery does not leak another Edition",
    exactOpportunities.outcome === "ok" &&
      exactOpportunities.data.every((opportunity) => opportunity.editionId === edition.id) &&
      !exactOpportunities.data.some((opportunity) => opportunity.copyId === otherEditionCopy.id),
  );

  const mappedDetail = await getPublicCopyDetail(caller, listingCopy.id);
  record(
    "application adapter preserves canonical Listing and safe component assessment",
    mappedDetail.outcome === "ok" &&
      mappedDetail.data.opportunity?.type === "listing" &&
      mappedDetail.data.components[0]?.conditionGrade === 4,
  );
} finally {
  if (fixture.auctions.length > 0) {
    await admin.from("auctions").update({ status: "cancelled" }).in("id", fixture.auctions);
    await admin.from("auctions").delete().in("id", fixture.auctions);
  }
  if (fixture.listings.length > 0) {
    await admin.from("listings").update({ status: "withdrawn" }).in("id", fixture.listings);
    await admin.from("listings").delete().in("id", fixture.listings);
  }
  if (fixture.copies.length > 0) await admin.from("copies").delete().in("id", fixture.copies);
  if (fixture.editions.length > 0) await admin.from("editions").delete().in("id", fixture.editions);
  if (fixture.games.length > 0) await admin.from("games").delete().in("id", fixture.games);
  if (fixture.platform) await admin.from("platforms").delete().eq("id", fixture.platform);
  for (const userId of fixture.users) await admin.auth.admin.deleteUser(userId);
}

const failed = results.filter(({ passed }) => !passed);
process.stdout.write(
  `\nMarket opportunity projection: ${results.length - failed.length}/${results.length} PASS\n`,
);
if (failed.length > 0) process.exitCode = 1;
