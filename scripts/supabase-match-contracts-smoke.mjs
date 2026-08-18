import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { register } from "node:module";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

register("./typescript-resolver.mjs", import.meta.url);
const {
  addWishlistIntent,
  getListingMatchesForWishlist,
  getMyReciprocalTradeMatches,
  getWishlistMatches,
  updateWishlistIntent,
  updateWishlistIntentPrivatePreferences,
} = await import("../packages/data/src/index.ts");

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
const password = `Match-${randomUUID()}`;
const results = [];

function record(name, passed, detail) {
  results.push({ name, passed });
  process.stdout.write(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
}

const ownerAuth = await owner.auth.signUp({ email: `match-owner-${runId}@example.com`, password });
const otherAuth = await other.auth.signUp({ email: `match-other-${runId}@example.com`, password });
const ownerId = ownerAuth.data.user.id;
const otherId = otherAuth.data.user.id;
const fixture = { games: [], editions: [], platform: null };

try {
  await admin
    .from("profiles")
    .update({ username: `owner_${runId}` })
    .eq("id", ownerId);
  await admin
    .from("profiles")
    .update({ username: `other_${runId}` })
    .eq("id", otherId);
  const platform = await admin
    .from("platforms")
    .insert({ slug: `match-${runId}`, name: `Match ${runId}` })
    .select("id")
    .single();
  fixture.platform = platform.data.id;
  const games = await admin
    .from("games")
    .insert([
      { canonical_title: `Match Game ${runId}` },
      { canonical_title: `Other Game ${runId}` },
    ])
    .select("id");
  const [game, otherGame] = games.data;
  fixture.games.push(game.id, otherGame.id);
  const editions = await admin
    .from("editions")
    .insert([
      {
        game_id: game.id,
        platform_id: platform.data.id,
        edition_name: "PAL",
        region_code: "PAL-FR",
      },
      {
        game_id: game.id,
        platform_id: platform.data.id,
        edition_name: "NTSC",
        region_code: "NTSC-J",
      },
      { game_id: otherGame.id, platform_id: platform.data.id, edition_name: "Other" },
    ])
    .select("id, game_id");
  const [pal, ntsc, crossGameEdition] = editions.data;
  fixture.editions.push(pal.id, ntsc.id, crossGameEdition.id);
  const components = await admin
    .from("edition_components")
    .insert([
      {
        edition_id: pal.id,
        component_key: "disc",
        name: "Disc",
        kind: "disc",
        required_for_complete: true,
      },
      {
        edition_id: pal.id,
        component_key: "manual",
        name: "Manual",
        kind: "manual",
        required_for_complete: true,
      },
    ])
    .select("id, edition_id, component_key");

  const copies = await admin
    .from("copies")
    .insert([
      { owner_id: otherId, game_id: game.id, edition_id: pal.id, availability: "open_to_trade" },
      { owner_id: otherId, game_id: game.id, edition_id: ntsc.id, availability: "open_to_trade" },
      { owner_id: otherId, game_id: game.id, edition_id: null, availability: "open_to_trade" },
      { owner_id: otherId, game_id: game.id, edition_id: pal.id, availability: "private" },
      {
        owner_id: otherId,
        game_id: otherGame.id,
        edition_id: crossGameEdition.id,
        availability: "open_to_trade",
      },
      { owner_id: ownerId, game_id: game.id, edition_id: ntsc.id, availability: "open_to_trade" },
      { owner_id: otherId, game_id: game.id, edition_id: pal.id, availability: "private" },
    ])
    .select("id, edition_id, availability");
  const [palCopy, ntscCopy, quickCopy, privateCopy, crossGameCopy, ownerCopy, listingCopy] =
    copies.data;
  await admin.from("copy_component_states").insert([
    {
      copy_id: palCopy.id,
      edition_id: pal.id,
      edition_component_id: components.data[0].id,
      presence: "present",
      condition_grade: 4,
    },
    {
      copy_id: palCopy.id,
      edition_id: pal.id,
      edition_component_id: components.data[1].id,
      presence: "present",
      condition_grade: 4,
    },
  ]);

  const broad = await addWishlistIntent(owner, { gameId: game.id, tradeInterest: true });
  const broadMatches = await getWishlistMatches(owner, broad.data.id, { limit: 20 });
  record(
    "broad intent matches eligible Editions and unconstrained Quick Copy only",
    broadMatches.outcome === "ok" &&
      [palCopy.id, ntscCopy.id, quickCopy.id].every((id) =>
        broadMatches.data.items.some((item) => item.copy.id === id),
      ) &&
      !broadMatches.data.items.some((item) =>
        [privateCopy.id, crossGameCopy.id].includes(item.copy.id),
      ),
  );

  const exact = await addWishlistIntent(owner, { gameId: game.id, editionId: pal.id });
  const exactMatches = await getWishlistMatches(owner, exact.data.id);
  record(
    "exact intent matches exact Edition but not another Edition or Quick Copy",
    exactMatches.outcome === "ok" &&
      exactMatches.data.items.some((item) => item.copy.id === palCopy.id) &&
      !exactMatches.data.items.some((item) => [ntscCopy.id, quickCopy.id].includes(item.copy.id)),
  );

  await admin.from("copies").update({ owner_id: ownerId }).eq("id", palCopy.id);
  const afterTransfer = await getWishlistMatches(owner, exact.data.id);
  record(
    "ownership transfer changes WishlistMatch immediately",
    afterTransfer.outcome === "ok" &&
      !afterTransfer.data.items.some((item) => item.copy.id === palCopy.id),
  );
  await admin.from("copies").update({ owner_id: otherId }).eq("id", palCopy.id);

  await admin.from("copies").update({ availability: "private" }).eq("id", palCopy.id);
  const afterAvailability = await getWishlistMatches(owner, exact.data.id);
  record(
    "Copy leaving open_to_trade disappears immediately",
    afterAvailability.outcome === "ok" &&
      !afterAvailability.data.items.some((item) => item.copy.id === palCopy.id),
  );
  await admin.from("copies").update({ availability: "open_to_trade" }).eq("id", palCopy.id);

  await updateWishlistIntent(owner, broad.data.id, { preferredRegionCode: "PAL-FR" });
  const regionMatches = await getWishlistMatches(owner, broad.data.id);
  record(
    "broad preferred Region requires Edition evidence and filters candidates",
    regionMatches.outcome === "ok" &&
      regionMatches.data.items.some((item) => item.copy.id === palCopy.id) &&
      !regionMatches.data.items.some((item) => [ntscCopy.id, quickCopy.id].includes(item.copy.id)),
  );

  await updateWishlistIntent(owner, broad.data.id, {
    preferredRegionCode: null,
    completeness: "complete_required",
    minimumComponentConditionGrade: 4,
  });
  const strictMatches = await getWishlistMatches(owner, broad.data.id);
  record(
    "strict completeness and condition require complete assessed component evidence",
    strictMatches.outcome === "ok" &&
      strictMatches.data.items.length === 1 &&
      strictMatches.data.items[0].copy.id === palCopy.id,
  );

  await admin
    .from("copy_component_states")
    .update({ condition_grade: 3 })
    .eq("copy_id", palCopy.id)
    .eq("edition_component_id", components.data[1].id);
  const insufficientGradeMatches = await getWishlistMatches(owner, broad.data.id);
  record(
    "one insufficient present component rejects the universal condition threshold",
    insufficientGradeMatches.outcome === "ok" && insufficientGradeMatches.data.items.length === 0,
  );

  await admin
    .from("copy_component_states")
    .update({ presence: "unknown", condition_grade: null })
    .eq("copy_id", palCopy.id)
    .eq("edition_component_id", components.data[1].id);
  const unknownMatches = await getWishlistMatches(owner, broad.data.id);
  record(
    "unknown component cannot prove strict constraints",
    unknownMatches.outcome === "ok" && unknownMatches.data.items.length === 0,
  );

  await updateWishlistIntent(owner, broad.data.id, {
    completeness: "complete_preferred",
    minimumComponentConditionGrade: null,
  });
  const preferredMatches = await getWishlistMatches(owner, broad.data.id);
  record(
    "complete_preferred is explanatory and does not hard-reject",
    preferredMatches.outcome === "ok" &&
      preferredMatches.data.items.some((item) => item.copy.id === ntscCopy.id),
  );

  const listing = await admin
    .from("listings")
    .insert({
      copy_id: listingCopy.id,
      seller_id: otherId,
      asking_amount_minor: 5000,
      asking_currency: "EUR",
      status: "active",
    })
    .select("id")
    .single();
  const listingMatches = await getListingMatchesForWishlist(owner, exact.data.id);
  record(
    "active Listing commitment creates ListingMatch with canonical Listing money",
    listingMatches.outcome === "ok" &&
      listingMatches.data.items.some(
        (item) => item.listingId === listing.data.id && item.askingPrice.amountMinor === 5000,
      ),
  );
  const tradeAfterListing = await getWishlistMatches(owner, exact.data.id);
  record(
    "for-sale Copy does not masquerade as generic trade WishlistMatch",
    tradeAfterListing.outcome === "ok" &&
      !tradeAfterListing.data.items.some((item) => item.copy.id === listingCopy.id),
  );
  await admin.from("listings").update({ status: "withdrawn" }).eq("id", listing.data.id);
  const closedListingMatches = await getListingMatchesForWishlist(owner, exact.data.id);
  record(
    "closed Listing disappears immediately",
    closedListingMatches.outcome === "ok" && closedListingMatches.data.items.length === 0,
  );

  await updateWishlistIntent(owner, broad.data.id, { completeness: "any" });
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
  const nearbyWishlist = await getWishlistMatches(owner, broad.data.id);
  record(
    "one-way WishlistMatch carries a coarse Nearby signal when geography is available",
    nearbyWishlist.outcome === "ok" &&
      nearbyWishlist.data.items.some(
        (item) => item.collector.id === otherId && item.nearby?.distanceBucket === "under_2_km",
      ),
  );
  await updateWishlistIntentPrivatePreferences(owner, broad.data.id, { maxTradeDistanceKm: 1 });
  const outsidePrivateLimit = await getWishlistMatches(owner, broad.data.id);
  record(
    "caller-private distance limit narrows one-way WishlistMatch without exposure",
    outsidePrivateLimit.outcome === "ok" && outsidePrivateLimit.data.items.length === 0,
  );
  await updateWishlistIntentPrivatePreferences(owner, broad.data.id, { maxTradeDistanceKm: null });

  const oneWay = await getMyReciprocalTradeMatches(owner);
  record(
    "one-way desire does not create reciprocal Match",
    oneWay.outcome === "ok" && oneWay.data.items.length === 0,
  );

  const theirIntent = await addWishlistIntent(other, {
    gameId: game.id,
    editionId: ntsc.id,
    visibility: "public",
    tradeInterest: true,
  });
  await updateWishlistIntentPrivatePreferences(other, theirIntent.data.id, {
    maxTradeDistanceKm: 1,
  });
  const rejectedByTheirDistance = await getMyReciprocalTradeMatches(owner);
  record(
    "counterpart-private distance limit also constrains reciprocity",
    rejectedByTheirDistance.outcome === "ok" && rejectedByTheirDistance.data.items.length === 0,
  );
  await updateWishlistIntentPrivatePreferences(other, theirIntent.data.id, {
    maxTradeDistanceKm: null,
  });
  const reciprocal = await getMyReciprocalTradeMatches(owner, { limit: 20, maxDistanceKm: 25 });
  record(
    "reciprocal pair explains both directions with coarse nearby signal",
    theirIntent.outcome === "ok" &&
      reciprocal.outcome === "ok" &&
      reciprocal.data.items.some(
        (item) =>
          item.collector.id === otherId &&
          item.myIntentId === broad.data.id &&
          item.theirIntentId === theirIntent.data.id &&
          item.myCopy.id === ownerCopy.id,
      ),
  );
  record(
    "Match output exposes no private preferences details or coordinates",
    reciprocal.outcome === "ok" &&
      !["budget", "distanceKm", "latitude", "longitude", "privateNotes"].some((key) =>
        JSON.stringify(reciprocal.data).includes(key),
      ),
  );

  await updateWishlistIntent(owner, broad.data.id, { status: "archived" });
  const afterArchive = await getMyReciprocalTradeMatches(owner);
  record(
    "archiving intent removes reciprocal projection without stale state",
    afterArchive.outcome === "ok" &&
      !afterArchive.data.items.some((item) => item.myIntentId === broad.data.id),
  );

  const anonymousMatches = await getWishlistMatches(anonymous, exact.data.id);
  record("anonymous caller cannot request matches", anonymousMatches.outcome === "unauthenticated");
} finally {
  await admin.auth.admin.deleteUser(ownerId);
  await admin.auth.admin.deleteUser(otherId);
  if (fixture.editions.length) await admin.from("editions").delete().in("id", fixture.editions);
  if (fixture.games.length) await admin.from("games").delete().in("id", fixture.games);
  if (fixture.platform) await admin.from("platforms").delete().eq("id", fixture.platform);
}

const failed = results.filter((result) => !result.passed);
process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
process.exitCode = failed.length === 0 ? 0 : 1;
