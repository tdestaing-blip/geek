/**
 * Data-layer smoke test for Geek's catalog, collection and profile access.
 *
 * Runs the real `@geek/data` functions against the local stack. Nothing here
 * reimplements a query: if a check passes, the code the applications will call
 * is the code that produced the result.
 *
 * The catalog is deliberately read-only to clients, so its fixtures are seeded
 * out of band with the local service role and removed again at the end. That
 * key exists only in this harness; no application code is given it, and RLS is
 * never relaxed to make a check pass. The users are created through ordinary
 * sign-up so the Profile trigger runs exactly as it would in production.
 *
 * Importing TypeScript directly needs Node's type stripping plus a resolve hook
 * for extensionless imports; see `scripts/typescript-resolver.mjs`.
 *
 * Nothing secret is printed, and the final check re-reads this script's own
 * output to prove it.
 *
 * Usage: pnpm db:smoke:data
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { register } from "node:module";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

register("./typescript-resolver.mjs", import.meta.url);

const {
  addCopy,
  addQuickCopy,
  getEdition,
  getEditionsForGame,
  getGame,
  getMyCollection,
  getMyCopyDetail,
  getMyProfile,
  searchCatalog,
  setCopyEdition,
  updateCopyAvailability,
} = await import("../packages/data/src/index.ts");

const { toSearchResults } = await import("../packages/data/src/catalog/search.ts");
const { toGame } = await import("../packages/data/src/catalog/mapping.ts");
const { toCopy, toCopyComponentState, toCopyPrivateDetails } =
  await import("../packages/data/src/collection/mapping.ts");
const { InvalidRowError } = await import("../packages/data/src/result.ts");
const domain = await import("../packages/domain/src/index.ts");

/**
 * Reads local connection details from the environment, or asks the CLI.
 *
 * The service role is needed only to seed and remove catalog fixtures, which
 * clients are not permitted to write. It is read from the environment like
 * everything else so that no key is ever written down here.
 */
function readEnvironment() {
  const fromEnvironment = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  if (fromEnvironment.url && fromEnvironment.anonKey && fromEnvironment.serviceRoleKey) {
    return { ...fromEnvironment, source: "environment" };
  }

  const status = JSON.parse(
    execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );

  return {
    url: status.API_URL,
    anonKey: status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
    source: "supabase status",
  };
}

const results = [];
const emitted = [];

function emit(line) {
  emitted.push(line);
  process.stdout.write(line);
}

function record(name, passed, detail) {
  results.push({ name, passed });
  emit(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
}

function section(title) {
  emit(`\n${title}\n${"-".repeat(title.length)}\n`);
}

/** Asserts that a mapper refuses a payload, rather than returning a model. */
function recordRejects(name, field, map) {
  let outcome = "returned a model";

  try {
    map();
  } catch (error) {
    outcome = error instanceof InvalidRowError ? error.field : `threw ${error?.name}`;
  }

  record(name, outcome === field, outcome === field ? undefined : `got ${outcome}`);
}

const environment = readEnvironment();
const runId = randomUUID().slice(0, 8);

// The service role never leaves this harness. It seeds and removes the catalog
// rows that clients are not permitted to write.
const admin = createClient(environment.url, environment.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const anonymous = createClient(environment.url, environment.anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function createUserClient() {
  return createClient(environment.url, environment.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A user client that counts the database requests made through it. */
function createCountingClient() {
  const { fetch } = globalThis;
  let requests = 0;

  const client = createClient(environment.url, environment.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const url = typeof input === "string" ? input : input.url;

        // Auth calls are counted separately from data reads, since verifying
        // the caller is one fixed cost rather than something that grows.
        if (url.includes("/rest/v1/")) {
          requests += 1;
        }

        return fetch(input, init);
      },
    },
  });

  return { client, requests: () => requests, reset: () => void (requests = 0) };
}

const password = `Pw-${randomUUID()}`;
const ownerEmail = `geek-data-smoke-owner-${runId}@example.com`;
const otherEmail = `geek-data-smoke-other-${runId}@example.com`;

const fixtures = { userIds: [], gameIds: [], editionIds: [], platformIds: [] };

emit(
  `Configuration source: ${environment.source}\nSupabase URL: ${environment.url}\nRun: ${runId}\n`,
);

try {
  // -------------------------------------------------------------------------
  section("Catalog fixtures (seeded out of band)");
  // -------------------------------------------------------------------------

  const platformInsert = await admin
    .from("platforms")
    .insert({ slug: `geek-smoke-gamecube-${runId}`, name: `Smoke GameCube ${runId}` })
    .select("id, name")
    .single();

  record("a Platform fixture exists", platformInsert.error === null, platformInsert.error?.message);
  const platform = platformInsert.data;
  fixtures.platformIds.push(platform.id);

  const gameTitle = `Smoke Windwaker ${runId}`;
  const gameInsert = await admin
    .from("games")
    .insert({ canonical_title: gameTitle, original_release_date: "2003-05-02" })
    .select("id, canonical_title")
    .single();

  record("a Game fixture exists", gameInsert.error === null, gameInsert.error?.message);
  const game = gameInsert.data;
  fixtures.gameIds.push(game.id);

  const editionsInsert = await admin
    .from("editions")
    .insert([
      {
        game_id: game.id,
        platform_id: platform.id,
        edition_name: "Standard",
        region_code: "PAL",
        release_date: "2003-05-02",
        supported_languages: ["fr", "en"],
      },
      {
        game_id: game.id,
        platform_id: platform.id,
        edition_name: "Player's Choice",
        region_code: "PAL",
        release_date: "2004-09-17",
        // Listed on both rows because a bulk insert sends one column set: a key
        // present on only one row arrives as an explicit NULL on the other
        // rather than falling back to the column default.
        supported_languages: ["fr"],
      },
    ])
    .select("id, edition_name, release_date")
    .order("release_date", { ascending: true });

  record(
    "two Edition fixtures exist",
    editionsInsert.error === null,
    editionsInsert.error?.message,
  );
  const [standardEdition, playersChoiceEdition] = editionsInsert.data;
  fixtures.editionIds.push(standardEdition.id, playersChoiceEdition.id);

  const otherGameInsert = await admin
    .from("games")
    .insert({ canonical_title: `Smoke Metroid ${runId}` })
    .select("id")
    .single();
  record("a second Game fixture exists", otherGameInsert.error === null);
  fixtures.gameIds.push(otherGameInsert.data.id);

  const otherGameEditionInsert = await admin
    .from("editions")
    .insert({
      game_id: otherGameInsert.data.id,
      platform_id: platform.id,
      edition_name: "Standard",
      region_code: "PAL",
    })
    .select("id")
    .single();
  record("the second Game has an Edition fixture", otherGameEditionInsert.error === null);
  const otherGameEdition = otherGameEditionInsert.data;
  fixtures.editionIds.push(otherGameEdition.id);

  const componentsInsert = await admin
    .from("edition_components")
    .insert([
      {
        edition_id: standardEdition.id,
        component_key: "disc",
        name: "Game disc",
        kind: "disc",
        required_for_complete: true,
        sort_order: 0,
      },
      {
        edition_id: standardEdition.id,
        component_key: "manual",
        name: "Manual",
        kind: "manual",
        required_for_complete: true,
        sort_order: 1,
      },
      {
        edition_id: standardEdition.id,
        component_key: "case",
        name: "Case",
        kind: "case",
        required_for_complete: false,
        sort_order: 2,
      },
    ])
    .select("id, component_key");

  record(
    "the Edition has three catalog components",
    componentsInsert.error === null && componentsInsert.data.length === 3,
    componentsInsert.error?.message,
  );

  const componentIds = Object.fromEntries(
    componentsInsert.data.map((row) => [row.component_key, row.id]),
  );

  const playersChoiceComponentInsert = await admin
    .from("edition_components")
    .insert({
      edition_id: playersChoiceEdition.id,
      component_key: "disc",
      name: "Player's Choice disc",
      kind: "disc",
      required_for_complete: true,
      sort_order: 0,
    })
    .select("id")
    .single();
  record(
    "the alternate Edition has its own component model",
    playersChoiceComponentInsert.error === null,
    playersChoiceComponentInsert.error?.message,
  );

  // -------------------------------------------------------------------------
  section("Catalog reads");
  // -------------------------------------------------------------------------

  const gameRead = await getGame(anonymous, game.id);

  record(
    "getGame returns the Game as an application model",
    gameRead.outcome === "ok" &&
      gameRead.data.id === game.id &&
      gameRead.data.canonicalTitle === gameTitle &&
      gameRead.data.originalReleaseDate === "2003-05-02",
    describeOutcome(gameRead),
  );

  record(
    "getGame works for a signed-out visitor, so the catalog stays public",
    gameRead.outcome === "ok",
  );

  const editionRead = await getEdition(anonymous, standardEdition.id);

  record(
    "getEdition returns the Edition, pointing at its Game",
    editionRead.outcome === "ok" &&
      editionRead.data.id === standardEdition.id &&
      editionRead.data.gameId === game.id &&
      editionRead.data.platformId === platform.id,
    describeOutcome(editionRead),
  );

  record(
    "an Edition keeps its own identity rather than collapsing into its Game",
    editionRead.outcome === "ok" &&
      editionRead.data.editionName === "Standard" &&
      editionRead.data.regionCode === "PAL" &&
      Array.isArray(editionRead.data.supportedLanguages) &&
      editionRead.data.supportedLanguages.length === 2 &&
      !("canonicalTitle" in editionRead.data),
  );

  const gameByEditionId = await getGame(anonymous, standardEdition.id);

  record(
    "an Edition id is not a Game id",
    gameByEditionId.outcome === "not_found",
    describeOutcome(gameByEditionId),
  );

  const missingGame = await getGame(anonymous, randomUUID());
  const missingEdition = await getEdition(anonymous, randomUUID());

  record(
    "an unknown Game id is not_found rather than an error",
    missingGame.outcome === "not_found",
    describeOutcome(missingGame),
  );

  record(
    "an unknown Edition id is not_found rather than an error",
    missingEdition.outcome === "not_found",
    describeOutcome(missingEdition),
  );

  const allEditions = await getEditionsForGame(anonymous, game.id);

  record(
    "getEditionsForGame returns the Game's Editions, oldest release first",
    allEditions.outcome === "ok" &&
      allEditions.data.items.length === 2 &&
      allEditions.data.items[0].id === standardEdition.id,
    describeOutcome(allEditions),
  );

  const firstPage = await getEditionsForGame(anonymous, game.id, { limit: 1 });
  const secondPage = await getEditionsForGame(anonymous, game.id, { limit: 1, offset: 1 });

  record(
    "list reads are paginated rather than returning everything",
    firstPage.outcome === "ok" &&
      secondPage.outcome === "ok" &&
      firstPage.data.items.length === 1 &&
      secondPage.data.items.length === 1 &&
      firstPage.data.items[0].id !== secondPage.data.items[0].id,
  );

  record(
    "an unknown Game has no Editions, which is an empty page and not an error",
    await resolves(getEditionsForGame(anonymous, randomUUID()), (result) => {
      return result.outcome === "ok" && result.data.items.length === 0;
    }),
  );

  // -------------------------------------------------------------------------
  section("Catalog search");
  // -------------------------------------------------------------------------

  const search = await searchCatalog(anonymous, gameTitle);

  record(
    "searchCatalog returns validated, mapped results",
    search.outcome === "ok" && search.data.items.length > 0,
    describeOutcome(search),
  );

  // Scoped to this run's fixtures. Ranking is fuzzy by design, so asserting on
  // the whole result set would make the check depend on the rest of the
  // catalog rather than on the behaviour being tested.
  const gameResults = search.data.items.filter(
    (item) => item.kind === "game" && item.gameId === game.id,
  );
  const editionResults = search.data.items.filter(
    (item) => item.kind === "edition" && item.gameId === game.id,
  );

  record(
    "the search distinguishes the Game from its Editions",
    gameResults.length === 1 &&
      editionResults.length === 2 &&
      editionResults.some((item) => item.editionId === standardEdition.id) &&
      editionResults.some((item) => item.editionId === playersChoiceEdition.id),
    `${gameResults.length} game, ${editionResults.length} edition results`,
  );

  record(
    "a Game result carries no Edition identity at all",
    gameResults.every((item) => !("editionId" in item) && !("platformId" in item)),
  );

  record(
    "an Edition result carries the identity and label a row needs",
    editionResults.every(
      (item) =>
        typeof item.editionId === "string" &&
        item.platformId === platform.id &&
        item.title === gameTitle &&
        typeof item.secondaryLabel === "string" &&
        item.secondaryLabel.includes(platform.name),
    ),
  );

  // The generated types describe every one of these as a non-null string,
  // because PostgreSQL does not record nullability for RETURNS TABLE columns.
  // This is the runtime truth they contradict.
  const rawSearch = await anonymous.rpc("search_catalog", {
    search_query: gameTitle,
    result_limit: 20,
    result_offset: 0,
  });

  const rawGameRow = rawSearch.data.find(
    (row) => row.result_kind === "game" && row.game_id === game.id,
  );

  record(
    "the search function really does return NULL where its generated type promises a string",
    rawGameRow !== undefined &&
      rawGameRow.edition_id === null &&
      rawGameRow.platform_id === null &&
      rawGameRow.secondary_label === null,
    rawGameRow === undefined ? "no game row" : undefined,
  );

  record(
    "and the mapped result represents that absence instead of carrying a null string",
    gameResults.length === 1 && Object.values(gameResults[0]).every((value) => value !== null),
  );

  const blankSearch = await searchCatalog(anonymous, "   ");

  record(
    "a blank query is an empty page rather than a database round trip",
    blankSearch.outcome === "ok" && blankSearch.data.items.length === 0,
  );

  record(
    "search pagination is bounded to what the database function accepts",
    (await rejectsWithRangeError(() => searchCatalog(anonymous, gameTitle, { limit: 51 }))) &&
      (await rejectsWithRangeError(() => searchCatalog(anonymous, gameTitle, { offset: -1 }))),
  );

  // -------------------------------------------------------------------------
  section("Identity and Profile");
  // -------------------------------------------------------------------------

  const owner = createUserClient();
  const ownerSignUp = await owner.auth.signUp({ email: ownerEmail, password });

  record("a user can be created through ordinary sign-up", ownerSignUp.error === null);
  const ownerId = ownerSignUp.data.user.id;
  fixtures.userIds.push(ownerId);

  const other = createUserClient();
  const otherSignUp = await other.auth.signUp({ email: otherEmail, password });

  record("a second user can be created for isolation checks", otherSignUp.error === null);
  const otherId = otherSignUp.data.user.id;
  fixtures.userIds.push(otherId);

  const profile = await getMyProfile(owner);

  record(
    "the Profile created by the database trigger reads back as a domain model",
    profile.outcome === "ok" && profile.data.id === ownerId,
    describeOutcome(profile),
  );

  record(
    "a Profile with no username yet is valid, not missing",
    profile.outcome === "ok" && profile.data.username === null && profile.data.displayName === null,
  );

  const anonymousProfile = await getMyProfile(anonymous);

  record(
    "an owner-scoped read with nobody signed in is unauthenticated, not empty",
    anonymousProfile.outcome === "unauthenticated",
    describeOutcome(anonymousProfile),
  );

  // -------------------------------------------------------------------------
  section("Collection");
  // -------------------------------------------------------------------------

  const added = await addCopy(owner, { editionId: standardEdition.id });

  record(
    "addCopy creates a Copy owned by the caller",
    added.outcome === "ok" &&
      added.data.ownerId === ownerId &&
      added.data.editionId === standardEdition.id,
    describeOutcome(added),
  );

  record(
    "a new Copy is private and closed to trade until its owner says otherwise",
    added.outcome === "ok" &&
      added.data.visibility === "private" &&
      added.data.gameId === game.id &&
      added.data.availability === "private",
  );

  const ownerCopyId = added.data.id;

  const secondAdd = await addCopy(owner, {
    editionId: playersChoiceEdition.id,
    visibility: "public",
  });

  record("a second Copy can be added with explicit visibility", secondAdd.outcome === "ok");

  const otherAdd = await addCopy(other, { editionId: standardEdition.id });

  record("the other collector owns a private Copy of the same Edition", otherAdd.outcome === "ok");
  const otherCopyId = otherAdd.data.id;

  const anonymousAdd = await addCopy(anonymous, { editionId: standardEdition.id });

  record(
    "adding a Copy with nobody signed in is refused",
    anonymousAdd.outcome === "unauthenticated",
    describeOutcome(anonymousAdd),
  );

  const collection = await getMyCollection(owner);

  record(
    "getMyCollection returns exactly the caller's own Copies",
    collection.outcome === "ok" &&
      collection.data.items.length === 2 &&
      collection.data.items.every((entry) => entry.copy.ownerId === ownerId),
    describeOutcome(collection),
  );

  record(
    "another collector's Copy of the same Edition is absent",
    collection.outcome === "ok" &&
      collection.data.items.every((entry) => entry.copy.id !== otherCopyId),
  );

  record(
    "the owner's own private Copy is in their own collection",
    collection.outcome === "ok" &&
      collection.data.items.some(
        (entry) => entry.copy.id === ownerCopyId && entry.copy.visibility === "private",
      ),
  );

  record(
    "each entry carries the catalog context a list needs, in one query",
    collection.outcome === "ok" &&
      collection.data.items.every(
        (entry) =>
          entry.game.canonicalTitle === gameTitle &&
          entry.platform?.name === platform.name &&
          entry.edition?.id === entry.copy.editionId,
      ),
  );

  record(
    "the collection cannot be asked for an unbounded page",
    (await rejectsWithRangeError(() => getMyCollection(owner, { limit: 101 }))) &&
      (await rejectsWithRangeError(() => getMyCollection(owner, { limit: 0 }))),
  );

  // Counting requests is the only way to catch an N+1 regression from the
  // outside: a per-row lookup would still return correct data, just slowly and
  // in proportion to how much someone owns.
  const counted = createCountingClient();
  await counted.client.auth.signInWithPassword({ email: ownerEmail, password });

  counted.reset();
  const countedCollection = await getMyCollection(counted.client);

  record(
    "a collection of any size is one query, not one per row",
    countedCollection.outcome === "ok" &&
      countedCollection.data.items.length === 2 &&
      counted.requests() === 1,
    `${counted.requests()} database requests for ${countedCollection.data?.items.length} entries`,
  );

  const otherCollection = await getMyCollection(other);

  record(
    "the other collector sees only their own Copy",
    otherCollection.outcome === "ok" &&
      otherCollection.data.items.length === 1 &&
      otherCollection.data.items[0].copy.id === otherCopyId,
    describeOutcome(otherCollection),
  );

  const madePublic = await updateCopyAvailability(owner, ownerCopyId, {
    visibility: "public",
    availability: "open_to_trade",
  });

  record(
    "an owner can change their own Copy's visibility and availability",
    madePublic.outcome === "ok" &&
      madePublic.data.visibility === "public" &&
      madePublic.data.availability === "open_to_trade",
    describeOutcome(madePublic),
  );

  const collectionAfterPublic = await getMyCollection(owner);

  record(
    "making a Copy public does not change what the owner sees in their own collection",
    collectionAfterPublic.outcome === "ok" && collectionAfterPublic.data.items.length === 2,
  );

  const foreignUpdate = await updateCopyAvailability(owner, otherCopyId, { visibility: "public" });

  record(
    "an owner cannot change someone else's Copy",
    foreignUpdate.outcome === "not_found",
    describeOutcome(foreignUpdate),
  );

  const stillPrivate = await admin
    .from("copies")
    .select("visibility")
    .eq("id", otherCopyId)
    .single();

  record(
    "and that Copy is genuinely untouched in the database",
    stillPrivate.data.visibility === "private",
  );

  const privateInsertState = await admin
    .from("copies")
    .select("availability, trade_availability")
    .eq("id", otherCopyId)
    .single();
  record(
    "a private addCopy insert derives closed legacy availability",
    privateInsertState.data.availability === "private" &&
      privateInsertState.data.trade_availability === "not_open",
  );

  const openAtCreation = await addCopy(owner, {
    editionId: standardEdition.id,
    availability: "open_to_trade",
  });
  const openInsertState = await admin
    .from("copies")
    .select("availability, trade_availability")
    .eq("id", openAtCreation.data.id)
    .single();
  record(
    "addCopy can create open-to-trade state without legacy drift",
    openAtCreation.outcome === "ok" &&
      openInsertState.data.availability === "open_to_trade" &&
      openInsertState.data.trade_availability === "open_to_trade",
    describeOutcome(openAtCreation),
  );

  const contradictoryOpenInsert = await admin
    .from("copies")
    .insert({
      owner_id: ownerId,
      game_id: game.id,
      availability: "open_to_trade",
      trade_availability: "not_open",
    })
    .select("availability, trade_availability")
    .single();
  record(
    "canonical open-to-trade wins over contradictory legacy insert input",
    contradictoryOpenInsert.error === null &&
      contradictoryOpenInsert.data.availability === "open_to_trade" &&
      contradictoryOpenInsert.data.trade_availability === "open_to_trade",
    contradictoryOpenInsert.error?.message,
  );

  const contradictoryPrivateInsert = await admin
    .from("copies")
    .insert({
      owner_id: ownerId,
      game_id: game.id,
      availability: "private",
      trade_availability: "open_to_trade",
    })
    .select("availability, trade_availability")
    .single();
  record(
    "canonical private wins over contradictory legacy insert input",
    contradictoryPrivateInsert.error === null &&
      contradictoryPrivateInsert.data.availability === "private" &&
      contradictoryPrivateInsert.data.trade_availability === "not_open",
    contradictoryPrivateInsert.error?.message,
  );

  const invalidSaleInsert = await admin.from("copies").insert({
    owner_id: ownerId,
    game_id: game.id,
    availability: "for_sale",
  });
  record(
    "a new Copy cannot manufacture for-sale availability",
    invalidSaleInsert.error?.code === "23514",
    invalidSaleInsert.error?.code,
  );

  const invalidAuctionInsert = await admin.from("copies").insert({
    owner_id: ownerId,
    game_id: game.id,
    availability: "in_auction",
  });
  record(
    "a new Copy cannot manufacture in-auction availability",
    invalidAuctionInsert.error?.code === "23514",
    invalidAuctionInsert.error?.code,
  );

  const quickCopy = await addQuickCopy(owner, game.id);

  record(
    "addQuickCopy creates a private Copy with Game identity and no Edition",
    quickCopy.outcome === "ok" &&
      quickCopy.data.ownerId === ownerId &&
      quickCopy.data.gameId === game.id &&
      quickCopy.data.editionId === null &&
      quickCopy.data.availability === "private",
    describeOutcome(quickCopy),
  );

  const anonymousQuickCopy = await addQuickCopy(anonymous, game.id);
  record(
    "an unauthenticated caller cannot create a Quick Copy",
    anonymousQuickCopy.outcome === "unauthenticated",
    describeOutcome(anonymousQuickCopy),
  );

  const spoofedQuickCopy = await owner.from("copies").insert({
    owner_id: otherId,
    game_id: game.id,
  });
  record(
    "a caller cannot spoof the owner of a Quick Copy",
    spoofedQuickCopy.error !== null,
    spoofedQuickCopy.error?.code,
  );

  const invalidAvailability = await owner
    .from("copies")
    .update({ availability: "available_sometimes" })
    .eq("id", ownerCopyId);
  record(
    "the database rejects an unknown availability",
    invalidAvailability.error?.code === "23514",
    invalidAvailability.error?.code,
  );

  const unbackedSale = await updateCopyAvailability(owner, ownerCopyId, {
    availability: "for_sale",
  });
  record(
    "for-sale availability cannot be asserted without a Listing commitment",
    unbackedSale.outcome === "failed" && unbackedSale.failure.code === "23514",
    describeOutcome(unbackedSale),
  );

  const quickCollection = await getMyCollection(owner);
  record(
    "a Quick Copy appears normally in My Collection",
    quickCollection.outcome === "ok" &&
      quickCollection.data.items.some(
        (entry) =>
          entry.copy.id === quickCopy.data.id && entry.edition === null && entry.platform === null,
      ),
    describeOutcome(quickCollection),
  );

  const quickDetail = await getMyCopyDetail(owner, quickCopy.data.id);
  record(
    "a Quick Copy detail reads with no Edition components",
    quickDetail.outcome === "ok" &&
      quickDetail.data.edition === null &&
      quickDetail.data.platform === null &&
      quickDetail.data.components.length === 0,
    describeOutcome(quickDetail),
  );

  const foreignEditionUpdate = await setCopyEdition(other, quickCopy.data.id, standardEdition.id);
  record(
    "another owner cannot enrich a Quick Copy",
    foreignEditionUpdate.outcome === "not_found",
    describeOutcome(foreignEditionUpdate),
  );

  const mismatchedQuickCopy = await addQuickCopy(owner, game.id);
  const mismatchedEditionUpdate = await setCopyEdition(
    owner,
    mismatchedQuickCopy.data.id,
    otherGameEdition.id,
  );
  record(
    "an Edition from a different Game cannot enrich a Quick Copy",
    mismatchedEditionUpdate.outcome === "failed" &&
      mismatchedEditionUpdate.failure.code === "23503",
    describeOutcome(mismatchedEditionUpdate),
  );

  const enrichedQuickCopy = await setCopyEdition(owner, quickCopy.data.id, standardEdition.id);
  record(
    "attaching a matching Edition preserves the Quick Copy identity",
    enrichedQuickCopy.outcome === "ok" &&
      enrichedQuickCopy.data.id === quickCopy.data.id &&
      enrichedQuickCopy.data.editionId === standardEdition.id,
    describeOutcome(enrichedQuickCopy),
  );

  const correctedQuickCopy = await setCopyEdition(
    owner,
    quickCopy.data.id,
    playersChoiceEdition.id,
  );
  record(
    "an Edition can be corrected within the same Game when safe",
    correctedQuickCopy.outcome === "ok" &&
      correctedQuickCopy.data.id === quickCopy.data.id &&
      correctedQuickCopy.data.gameId === game.id &&
      correctedQuickCopy.data.editionId === playersChoiceEdition.id,
    describeOutcome(correctedQuickCopy),
  );

  const enrichedCrossGameCorrection = await setCopyEdition(
    owner,
    quickCopy.data.id,
    otherGameEdition.id,
  );
  record(
    "an enriched Copy cannot be corrected across Games",
    enrichedCrossGameCorrection.outcome === "failed" &&
      enrichedCrossGameCorrection.failure.code === "23503",
    describeOutcome(enrichedCrossGameCorrection),
  );

  const editionSpecificState = await owner.from("copy_component_states").insert({
    copy_id: quickCopy.data.id,
    edition_id: playersChoiceEdition.id,
    edition_component_id: playersChoiceComponentInsert.data.id,
    presence: "present",
  });
  record(
    "the corrected Edition can gain its own component model",
    editionSpecificState.error === null,
    editionSpecificState.error?.message,
  );

  const correctionWithComponentState = await setCopyEdition(
    owner,
    quickCopy.data.id,
    standardEdition.id,
  );
  record(
    "Edition correction is rejected while Edition-specific component state exists",
    correctionWithComponentState.outcome === "failed" &&
      correctionWithComponentState.failure.code === "23514",
    describeOutcome(correctionWithComponentState),
  );

  await owner
    .from("copy_component_states")
    .delete()
    .eq("copy_id", quickCopy.data.id)
    .eq("edition_component_id", playersChoiceComponentInsert.data.id);

  const committedListing = await admin
    .from("listings")
    .insert({
      copy_id: quickCopy.data.id,
      seller_id: ownerId,
      asking_amount_minor: 2500,
      asking_currency: "EUR",
      status: "active",
    })
    .select("id")
    .single();
  record(
    "an active Listing drives the Copy to for-sale availability",
    committedListing.error === null &&
      (await admin.from("copies").select("availability").eq("id", quickCopy.data.id).single()).data
        .availability === "for_sale",
    committedListing.error?.message,
  );

  const correctionWhileCommitted = await setCopyEdition(
    owner,
    quickCopy.data.id,
    standardEdition.id,
  );
  record(
    "Edition correction is rejected while the Copy is commercially committed",
    correctionWhileCommitted.outcome === "failed" &&
      correctionWhileCommitted.failure.code === "23514",
    describeOutcome(correctionWhileCommitted),
  );

  const legacyWriteDuringListing = await owner
    .from("copies")
    .update({ trade_availability: "open_to_trade" })
    .eq("id", quickCopy.data.id);
  const availabilityDuringListing = await admin
    .from("copies")
    .select("availability")
    .eq("id", quickCopy.data.id)
    .single();
  record(
    "a legacy availability write cannot override a Listing commitment",
    legacyWriteDuringListing.error?.code === "23514" &&
      availabilityDuringListing.data.availability === "for_sale",
    legacyWriteDuringListing.error?.code,
  );

  await admin.from("listings").update({ status: "withdrawn" }).eq("id", committedListing.data.id);
  const availabilityAfterWithdrawal = await admin
    .from("copies")
    .select("availability")
    .eq("id", quickCopy.data.id)
    .single();
  record(
    "terminating the Listing restores private availability deterministically",
    availabilityAfterWithdrawal.data.availability === "private",
  );
  await admin.from("listings").delete().eq("id", committedListing.data.id);

  const decisionTime = Date.now();
  const committedAuction = await admin
    .from("auctions")
    .insert({
      copy_id: quickCopy.data.id,
      seller_id: ownerId,
      starting_amount_minor: 1000,
      currency: "EUR",
      min_increment_minor: 100,
      status: "scheduled",
      starts_at: new Date(decisionTime + 60_000).toISOString(),
      ends_at: new Date(decisionTime + 3_600_000).toISOString(),
    })
    .select("id")
    .single();
  const availabilityDuringAuction = await admin
    .from("copies")
    .select("availability")
    .eq("id", quickCopy.data.id)
    .single();
  record(
    "a scheduled Auction drives the Copy to in-auction availability",
    committedAuction.error === null && availabilityDuringAuction.data.availability === "in_auction",
    committedAuction.error?.message,
  );

  const legacyWriteDuringAuction = await owner
    .from("copies")
    .update({ trade_availability: "open_to_trade" })
    .eq("id", quickCopy.data.id);
  record(
    "a legacy availability write cannot override an Auction commitment",
    legacyWriteDuringAuction.error?.code === "23514",
    legacyWriteDuringAuction.error?.code,
  );

  await admin.from("auctions").update({ status: "cancelled" }).eq("id", committedAuction.data.id);
  const availabilityAfterAuction = await admin
    .from("copies")
    .select("availability")
    .eq("id", quickCopy.data.id)
    .single();
  record(
    "terminating the Auction restores private availability deterministically",
    availabilityAfterAuction.data.availability === "private",
  );
  await admin.from("auctions").delete().eq("id", committedAuction.data.id);

  const correctionAfterRelease = await setCopyEdition(owner, quickCopy.data.id, standardEdition.id);
  record(
    "Edition correction succeeds after component and commitment guards are cleared",
    correctionAfterRelease.outcome === "ok" &&
      correctionAfterRelease.data.id === quickCopy.data.id &&
      correctionAfterRelease.data.editionId === standardEdition.id,
    describeOutcome(correctionAfterRelease),
  );

  const duplicateQuickCopy = await addQuickCopy(owner, game.id);
  record(
    "multiple Copies of one Game remain legal",
    duplicateQuickCopy.outcome === "ok" && duplicateQuickCopy.data.id !== quickCopy.data.id,
    describeOutcome(duplicateQuickCopy),
  );

  // -------------------------------------------------------------------------
  section("Copy detail");
  // -------------------------------------------------------------------------

  const stateInsert = await owner.from("copy_component_states").insert([
    {
      copy_id: ownerCopyId,
      edition_id: standardEdition.id,
      edition_component_id: componentIds.disc,
      presence: "present",
      condition_grade: 4,
      condition_notes: "light scuffs",
    },
    {
      copy_id: ownerCopyId,
      edition_id: standardEdition.id,
      edition_component_id: componentIds.manual,
      presence: "missing",
    },
  ]);

  record(
    "the owner recorded two component states",
    stateInsert.error === null,
    stateInsert.error?.message,
  );

  const privateInsert = await owner.from("copy_private_details").insert({
    copy_id: ownerCopyId,
    owner_id: ownerId,
    acquired_at: "2019-04-01",
    purchase_amount_minor: 4250,
    purchase_currency: "EUR",
    provenance: "owner-provenance",
    storage_location: "owner-shelf",
  });

  record(
    "the owner recorded private details",
    privateInsert.error === null,
    privateInsert.error?.message,
  );

  // A Copy keeps one private record per person who has owned it, so a previous
  // owner's row can coexist with the current owner's. Only the service role can
  // create that state, which is exactly why it is worth proving the read is
  // keyed by (copy_id, owner_id) rather than by copy alone.
  const previousOwnerRow = await admin.from("copy_private_details").insert({
    copy_id: ownerCopyId,
    owner_id: otherId,
    provenance: "previous-owner-provenance",
    storage_location: "previous-owner-shelf",
  });

  record(
    "a previous owner's private record exists for the same Copy",
    previousOwnerRow.error === null,
    previousOwnerRow.error?.message,
  );

  const rowCount = await admin
    .from("copy_private_details")
    .select("owner_id", { count: "exact", head: true })
    .eq("copy_id", ownerCopyId);

  record(
    "the Copy now carries two private records",
    rowCount.count === 2,
    `count ${rowCount.count}`,
  );

  const detail = await getMyCopyDetail(owner, ownerCopyId);

  record(
    "getMyCopyDetail returns the Copy with its catalog context",
    detail.outcome === "ok" &&
      detail.data.copy.id === ownerCopyId &&
      detail.data.game.canonicalTitle === gameTitle &&
      detail.data.edition.id === standardEdition.id &&
      detail.data.platform.id === platform.id,
    describeOutcome(detail),
  );

  const components = detail.data.components;

  record(
    "every catalog component appears, in catalog order",
    components.length === 3 &&
      components[0].component.componentKey === "disc" &&
      components[1].component.componentKey === "manual" &&
      components[2].component.componentKey === "case",
    components.map((entry) => entry.component.componentKey).join(", "),
  );

  record(
    "a present component maps with its grade",
    components[0].state?.presence === "present" &&
      components[0].state?.conditionGrade === 4 &&
      components[0].state?.conditionNotes === "light scuffs",
  );

  record(
    "a missing component maps with no grade",
    components[1].state?.presence === "missing" && components[1].state?.conditionGrade === null,
  );

  record(
    "an unassessed component is null, which is not the same as an unknown one",
    components[2].state === null,
  );

  record(
    "the owner's own private details come back",
    detail.data.privateDetails?.provenance === "owner-provenance" &&
      detail.data.privateDetails?.acquiredAt === "2019-04-01",
  );

  record(
    "the purchase price is one Money value, never a loose amount",
    detail.data.privateDetails?.purchasePrice?.amountMinor === 4250 &&
      detail.data.privateDetails?.purchasePrice?.currency === "EUR",
  );

  record(
    "only the caller's own private record is returned, not the previous owner's",
    detail.data.privateDetails?.ownerId === ownerId &&
      detail.data.privateDetails?.provenance !== "previous-owner-provenance" &&
      detail.data.privateDetails?.storageLocation !== "previous-owner-shelf",
  );

  counted.reset();
  await getMyCopyDetail(counted.client, ownerCopyId);

  record(
    "copy detail is three queries whatever the Edition contains",
    counted.requests() === 3,
    `${counted.requests()} database requests`,
  );

  const foreignDetail = await getMyCopyDetail(owner, otherCopyId);

  record(
    "another collector's Copy is not_found through the owner's detail read",
    foreignDetail.outcome === "not_found",
    describeOutcome(foreignDetail),
  );

  const anonymousDetail = await getMyCopyDetail(anonymous, ownerCopyId);

  record(
    "a signed-out caller gets no Copy detail at all",
    anonymousDetail.outcome === "unauthenticated",
    describeOutcome(anonymousDetail),
  );

  // -------------------------------------------------------------------------
  section("Row-level security underneath the data layer");
  // -------------------------------------------------------------------------

  const foreignPrivateRead = await other
    .from("copy_private_details")
    .select("copy_id, provenance")
    .eq("copy_id", ownerCopyId)
    .eq("owner_id", ownerId);

  record(
    "one collector cannot read another's private details directly",
    foreignPrivateRead.error !== null || foreignPrivateRead.data.length === 0,
    foreignPrivateRead.error?.code,
  );

  const anonymousPrivateRead = await anonymous.from("copy_private_details").select("copy_id");

  record(
    "an anonymous visitor cannot read private details at all",
    anonymousPrivateRead.error !== null || anonymousPrivateRead.data.length === 0,
    anonymousPrivateRead.error?.code,
  );

  const foreignCopyRead = await other.from("copies").select("id").eq("id", otherCopyId);
  const privateCopyRead = await anonymous.from("copies").select("id").eq("id", otherCopyId);

  record(
    "a collector can still read their own private Copy row",
    foreignCopyRead.error === null && foreignCopyRead.data.length === 1,
  );

  record(
    "an anonymous visitor cannot read a private Copy row",
    privateCopyRead.error === null && privateCopyRead.data.length === 0,
  );

  // -------------------------------------------------------------------------
  section("Mappers refuse impossible data");
  // -------------------------------------------------------------------------

  // The database's CHECK constraints make most of these impossible to store,
  // which is the point: these run the payloads a relaxed constraint, a new
  // status value or a changed function signature would produce, and prove the
  // boundary refuses rather than passing them on as a valid model.
  const copyRow = {
    id: randomUUID(),
    game_id: game.id,
    edition_id: standardEdition.id,
    owner_id: ownerId,
    visibility: "private",
    availability: "private",
    created_at: new Date().toISOString(),
  };

  recordRejects("an unknown Copy visibility is rejected", "copies.visibility", () =>
    toCopy({ ...copyRow, visibility: "sealed" }),
  );

  recordRejects("an unknown Copy availability is rejected", "copies.availability", () =>
    toCopy({ ...copyRow, availability: "maybe" }),
  );

  record("a valid Copy row still maps", toCopy(copyRow).visibility === "private");

  const stateRow = {
    edition_component_id: componentIds.disc,
    presence: "present",
    condition_grade: 3,
    condition_notes: null,
  };

  recordRejects("an unknown component presence is rejected", "copy_component_states.presence", () =>
    toCopyComponentState({ ...stateRow, presence: "broken" }),
  );

  recordRejects(
    "a condition grade outside 1-5 is rejected",
    "copy_component_states.condition_grade",
    () => toCopyComponentState({ ...stateRow, condition_grade: 7 }),
  );

  recordRejects(
    "a grade on a component that is not present is rejected",
    "copy_component_states.condition_grade",
    () => toCopyComponentState({ ...stateRow, presence: "missing", condition_grade: 3 }),
  );

  const privateRow = {
    copy_id: ownerCopyId,
    owner_id: ownerId,
    acquired_at: null,
    purchase_amount_minor: null,
    purchase_currency: null,
    provenance: null,
    private_notes: null,
    storage_location: null,
  };

  recordRejects(
    "an amount with no currency is rejected",
    "copy_private_details.purchase_amount_minor",
    () => toCopyPrivateDetails({ ...privateRow, purchase_amount_minor: 1000 }),
  );

  recordRejects(
    "a currency that is not ISO 4217 is rejected",
    "copy_private_details.purchase_currency",
    () =>
      toCopyPrivateDetails({
        ...privateRow,
        purchase_amount_minor: 1000,
        purchase_currency: "eur",
      }),
  );

  recordRejects("a date that does not exist is rejected", "games.original_release_date", () =>
    toGame({
      id: game.id,
      canonical_title: gameTitle,
      description: null,
      original_release_date: "2003-02-31",
    }),
  );

  recordRejects("an unknown search result kind is rejected", "search_catalog.result_kind", () =>
    toSearchResults([{ ...validSearchRow(game.id), result_kind: "franchise" }]),
  );

  recordRejects(
    "a Game search result carrying an Edition identity is rejected",
    "search_catalog.edition_id",
    () => toSearchResults([{ ...validSearchRow(game.id), edition_id: standardEdition.id }]),
  );

  recordRejects(
    "an Edition search result with a null platform is rejected",
    "search_catalog.platform_id",
    () =>
      toSearchResults([
        {
          result_kind: "edition",
          entity_id: standardEdition.id,
          game_id: game.id,
          edition_id: standardEdition.id,
          primary_title: gameTitle,
          secondary_label: "label",
          platform_id: null,
          relevance_score: 1,
        },
      ]),
  );

  // -------------------------------------------------------------------------
  section("Domain narrowers");
  // -------------------------------------------------------------------------

  record(
    "visibility, availability and presence only accept known values",
    domain.parseCopyVisibility("public") === "public" &&
      domain.parseCopyVisibility("sealed") === null &&
      domain.parseCopyAvailability("open_to_trade") === "open_to_trade" &&
      domain.parseCopyAvailability("maybe") === null &&
      domain.parseCopyComponentPresence("unknown") === "unknown" &&
      domain.parseCopyComponentPresence("perhaps") === null,
  );

  record(
    "condition grades outside the 1-5 scale are refused",
    domain.parseConditionGrade(1) === 1 &&
      domain.parseConditionGrade(5) === 5 &&
      domain.parseConditionGrade(0) === null &&
      domain.parseConditionGrade(6) === null &&
      domain.parseConditionGrade(3.5) === null,
  );

  record(
    "calendar dates and currency codes are validated, not assumed",
    domain.parseCalendarDate("2003-05-02") === "2003-05-02" &&
      domain.parseCalendarDate("2003-02-31") === null &&
      domain.parseCalendarDate("2003-05-02T00:00:00Z") === null &&
      domain.parseCurrencyCode("EUR") === "EUR" &&
      domain.parseCurrencyCode("eur") === null &&
      domain.parseCurrencyCode("EURO") === null,
  );

  record(
    "money rejects fractional minor units",
    domain.createMoney(4250, domain.parseCurrencyCode("EUR"))?.amountMinor === 4250 &&
      domain.createMoney(42.5, domain.parseCurrencyCode("EUR")) === null,
  );
} finally {
  // -------------------------------------------------------------------------
  section("Cleanup");
  // -------------------------------------------------------------------------

  const cleanup = await removeFixtures();

  record("fixtures removed", cleanup.length === 0, cleanup.join("; "));
}

/** Removes everything this run created, innermost references first. */
async function removeFixtures() {
  const problems = [];

  for (const userId of fixtures.userIds) {
    // Cascades through profiles to copies, their component states and their
    // private details.
    const { error } = await admin.auth.admin.deleteUser(userId);

    if (error !== null) {
      problems.push(`user: ${error.message}`);
    }
  }

  for (const [table, ids] of [
    ["editions", fixtures.editionIds],
    ["games", fixtures.gameIds],
    ["platforms", fixtures.platformIds],
  ]) {
    if (ids.length === 0) {
      continue;
    }

    const { error } = await admin.from(table).delete().in("id", ids);

    if (error !== null) {
      problems.push(`${table}: ${error.message}`);
    }
  }

  return problems;
}

function validSearchRow(gameId) {
  return {
    result_kind: "game",
    entity_id: gameId,
    game_id: gameId,
    edition_id: null,
    primary_title: "title",
    secondary_label: null,
    platform_id: null,
    relevance_score: 1,
  };
}

function describeOutcome(result) {
  if (result.outcome === "ok" || result.outcome === undefined) {
    return undefined;
  }

  if (result.outcome === "failed") {
    return `${result.outcome}: ${result.failure.code ?? "no code"}`;
  }

  if (result.outcome === "invalid_data") {
    return `${result.outcome}: ${result.message}`;
  }

  return result.outcome;
}

async function resolves(promise, predicate) {
  return predicate(await promise);
}

/**
 * Pagination bugs are caller bugs, so they surface as a rejected RangeError
 * rather than as one of the result outcomes a screen has to handle.
 */
async function rejectsWithRangeError(call) {
  try {
    await call();

    return false;
  } catch (error) {
    return error instanceof RangeError;
  }
}

// ---------------------------------------------------------------------------
section("Nothing secret was logged");
// ---------------------------------------------------------------------------

const transcript = emitted.join("");
const secrets = [
  ["password", password],
  ["anon key", environment.anonKey],
  ["service role key", environment.serviceRoleKey],
].filter(([, value]) => typeof value === "string" && value.length > 0);

const leaked = secrets.filter(([, value]) => transcript.includes(value));

record(
  "no password or key appears in this script's output",
  leaked.length === 0,
  leaked.length === 0
    ? `${secrets.length} value(s) checked`
    : `leaked: ${leaked.map(([name]) => name).join(", ")}`,
);

const failed = results.filter((result) => !result.passed);

emit(`\n${results.length - failed.length}/${results.length} checks passed\n`);

process.exitCode = failed.length === 0 ? 0 : 1;
