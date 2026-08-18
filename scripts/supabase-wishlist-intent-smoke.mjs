import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { register } from "node:module";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

register("./typescript-resolver.mjs", import.meta.url);

const {
  addWishlistIntent,
  getMyWishlistIntents,
  removeWishlistIntent,
  updateWishlistIntent,
  updateWishlistIntentPrivatePreferences,
} = await import("../packages/data/src/index.ts");
const domain = await import("../packages/domain/src/index.ts");

const status = JSON.parse(
  execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const anonymous = createClient(status.API_URL, status.ANON_KEY, options);
const owner = createClient(status.API_URL, status.ANON_KEY, options);
const other = createClient(status.API_URL, status.ANON_KEY, options);
const runId = randomUUID().slice(0, 8);
const password = `Wishlist-${randomUUID()}`;
const results = [];

function record(name, passed, detail) {
  results.push({ name, passed });
  process.stdout.write(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
}

const ownerAuth = await owner.auth.signUp({
  email: `wishlist-owner-${runId}@example.com`,
  password,
});
const otherAuth = await other.auth.signUp({
  email: `wishlist-other-${runId}@example.com`,
  password,
});
const ownerId = ownerAuth.data.user.id;
const otherId = otherAuth.data.user.id;
const fixtures = { users: [ownerId, otherId], editions: [], games: [], platforms: [] };

try {
  const platform = await admin
    .from("platforms")
    .insert({ slug: `wishlist-${runId}`, name: `Wishlist Platform ${runId}` })
    .select("id")
    .single();
  fixtures.platforms.push(platform.data.id);

  const games = await admin
    .from("games")
    .insert([
      { canonical_title: `Wishlist Game ${runId}` },
      { canonical_title: `Other Wishlist Game ${runId}` },
    ])
    .select("id");
  const [game, otherGame] = games.data;
  fixtures.games.push(game.id, otherGame.id);

  const editions = await admin
    .from("editions")
    .insert([
      {
        game_id: game.id,
        platform_id: platform.data.id,
        edition_name: "PAL FR",
        region_code: "PAL-FR",
      },
      {
        game_id: game.id,
        platform_id: platform.data.id,
        edition_name: "NTSC-J",
        region_code: "NTSC-J",
      },
      { game_id: otherGame.id, platform_id: platform.data.id, edition_name: "Other" },
    ])
    .select("id, game_id");
  const [editionA, editionB, otherEdition] = editions.data;
  fixtures.editions.push(editionA.id, editionB.id, otherEdition.id);

  const broad = await addWishlistIntent(owner, { gameId: game.id });
  record(
    "creates a broad Game intent",
    broad.outcome === "ok" && broad.data.gameId === game.id && broad.data.editionId === null,
  );

  const exact = await addWishlistIntent(owner, {
    gameId: game.id,
    editionId: editionA.id,
    preferredRegionCode: "PAL-FR",
    completeness: "complete_preferred",
    minimumComponentConditionGrade: 3,
  });
  record(
    "creates an exact Edition intent with typed constraints",
    exact.outcome === "ok" &&
      exact.data.gameId === game.id &&
      exact.data.editionId === editionA.id &&
      exact.data.constraints.preferredRegionCode === null &&
      exact.data.constraints.minimumComponentConditionGrade === 3,
  );

  const contradictoryExactRegion = await updateWishlistIntent(owner, exact.data.id, {
    preferredRegionCode: "NTSC-J",
  });
  record(
    "exact Edition identity normalizes contradictory region preference",
    contradictoryExactRegion.outcome === "ok" &&
      contradictoryExactRegion.data.constraints.preferredRegionCode === null,
  );

  const crossGame = await addWishlistIntent(owner, {
    gameId: game.id,
    editionId: otherEdition.id,
  });
  record(
    "rejects cross-Game Edition identity",
    crossGame.outcome === "failed" && crossGame.failure.code === "23503",
    crossGame.failure?.code,
  );

  const duplicateBroad = await addWishlistIntent(owner, { gameId: game.id });
  const duplicateExact = await addWishlistIntent(owner, {
    gameId: game.id,
    editionId: editionA.id,
  });
  record(
    "rejects duplicate active broad and exact intents",
    duplicateBroad.outcome === "failed" &&
      duplicateBroad.failure.code === "23505" &&
      duplicateExact.outcome === "failed" &&
      duplicateExact.failure.code === "23505",
  );

  const secondExact = await addWishlistIntent(owner, { gameId: game.id, editionId: editionB.id });
  record("allows two exact Editions of one Game", secondExact.outcome === "ok");

  await updateWishlistIntent(owner, broad.data.id, { status: "archived" });
  const refinable = await addWishlistIntent(owner, { gameId: otherGame.id });
  const refined = await updateWishlistIntent(owner, refinable.data.id, {
    editionId: otherEdition.id,
    preferredRegionCode: "PAL-FR",
  });
  const broadened = await updateWishlistIntent(owner, refinable.data.id, { editionId: null });
  record(
    "refines and broadens without replacing intent identity",
    refined.outcome === "ok" &&
      broadened.outcome === "ok" &&
      refined.data.id === refinable.data.id &&
      refined.data.constraints.preferredRegionCode === null &&
      broadened.data.id === refinable.data.id &&
      broadened.data.editionId === null,
  );

  const anonymousAdd = await addWishlistIntent(anonymous, { gameId: game.id });
  record("rejects anonymous creation", anonymousAdd.outcome === "unauthenticated");

  const foreignUpdate = await updateWishlistIntent(other, exact.data.id, { tradeInterest: false });
  record("another user cannot update an intent", foreignUpdate.outcome === "not_found");

  const spoof = await owner
    .from("wishlist_intents")
    .insert({ owner_id: otherId, game_id: otherGame.id });
  record("owner spoofing fails", spoof.error !== null, spoof.error?.code);

  const currency = domain.parseCurrencyCode("EUR");
  const budget = domain.createMoney(4250, currency);
  const privateUpdate = await updateWishlistIntentPrivatePreferences(owner, exact.data.id, {
    maxPurchaseBudget: budget,
    maxTradeDistanceKm: 25,
    priority: 3,
  });
  record(
    "owner stores typed private budget distance and priority",
    privateUpdate.outcome === "ok" &&
      privateUpdate.data.maxPurchaseBudget?.amountMinor === 4250 &&
      privateUpdate.data.maxTradeDistanceKm === 25 &&
      privateUpdate.data.priority === 3,
  );

  const foreignPrivate = await other
    .from("wishlist_intent_private_details")
    .select("priority, max_purchase_amount_minor, max_trade_distance_km")
    .eq("wishlist_intent_id", exact.data.id);
  record(
    "private preferences are unreadable to another authenticated user",
    foreignPrivate.error === null && foreignPrivate.data.length === 0,
  );

  const publicIntent = await updateWishlistIntent(owner, exact.data.id, { visibility: "public" });
  const otherSafeRead = await other
    .from("wishlist_intents")
    .select("id, game_id, edition_id, preferred_region_code")
    .eq("id", exact.data.id);
  record(
    "public intent exposes only network-safe row data",
    publicIntent.outcome === "ok" && otherSafeRead.data.length === 1,
  );

  const invalidMoney = await owner
    .from("wishlist_intent_private_details")
    .update({
      max_purchase_amount_minor: 100,
      max_purchase_currency: null,
    })
    .eq("wishlist_intent_id", exact.data.id);
  record("budget amount/currency consistency is enforced", invalidMoney.error?.code === "23514");

  const myIntents = await getMyWishlistIntents(owner);
  record(
    "owner read maps canonical intents and private preferences",
    myIntents.outcome === "ok" &&
      myIntents.data.some(
        (entry) => entry.intent.id === exact.data.id && entry.privatePreferences?.priority === 3,
      ),
  );

  const legacyExact = await admin
    .from("wishlist_items")
    .select("game_id, edition_id")
    .eq("id", exact.data.id)
    .single();
  record(
    "legacy matching view preserves exact-target semantics",
    legacyExact.data.game_id === null && legacyExact.data.edition_id === editionA.id,
  );

  const otherExact = await addWishlistIntent(other, {
    gameId: game.id,
    editionId: editionB.id,
    visibility: "public",
  });
  await owner.from("user_discovery_locations").insert({
    user_id: ownerId,
    location: "POINT(2.3522 48.8566)",
    source: "city_selection",
  });
  await other.from("user_discovery_locations").insert({
    user_id: otherId,
    location: "POINT(2.36 48.86)",
    source: "city_selection",
  });
  const matchingCopies = await admin.from("copies").insert([
    {
      owner_id: ownerId,
      game_id: game.id,
      edition_id: editionB.id,
      availability: "open_to_trade",
    },
    {
      owner_id: otherId,
      game_id: game.id,
      edition_id: editionA.id,
      availability: "open_to_trade",
    },
  ]);
  const reciprocalMatches = await owner.rpc("get_reciprocal_trade_matches", {
    max_distance_km: 25,
    result_limit: 20,
    result_offset: 0,
  });
  record(
    "existing reciprocal matching reads canonical intents through compatibility views",
    otherExact.outcome === "ok" &&
      matchingCopies.error === null &&
      reciprocalMatches.error === null &&
      reciprocalMatches.data.some((match) => match.counterpart_user_id === otherId),
    reciprocalMatches.error?.code,
  );

  const removed = await removeWishlistIntent(owner, secondExact.data.id);
  record("owner can remove an intent", removed.outcome === "ok");
} finally {
  for (const userId of fixtures.users) await admin.auth.admin.deleteUser(userId);
  if (fixtures.editions.length) await admin.from("editions").delete().in("id", fixtures.editions);
  if (fixtures.games.length) await admin.from("games").delete().in("id", fixtures.games);
  if (fixtures.platforms.length)
    await admin.from("platforms").delete().in("id", fixtures.platforms);
}

const failed = results.filter((result) => !result.passed);
process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
process.exitCode = failed.length === 0 ? 0 : 1;
