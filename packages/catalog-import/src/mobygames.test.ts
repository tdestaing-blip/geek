import assert from "node:assert/strict";
import test from "node:test";

import { decideMobyGamesEditionReconciliation } from "./mobygames-database.ts";
import {
  countMobyGamesSourceCoverGroups,
  deriveMobyGamesImportPlan,
  executeMobyGamesImport,
  MobyGamesClient,
  nextSourceRevision,
  normalizeMobyGamesRegion,
  type MobyGamesIdentifier,
} from "./mobygames.ts";

const fetchedAt = "2026-08-24T12:00:00.000Z";

test("EUR evidence is Europe and missing evidence is never France", () => {
  const eur: MobyGamesIdentifier = {
    scheme: "nintendo_media_pn",
    value: "NUS-NZSP-EUR",
    authority: "MobyGames",
    identityRole: "strong_physical",
  };
  assert.equal(normalizeMobyGamesRegion([], [eur]), "EU");
  assert.equal(normalizeMobyGamesRegion([], []), null);
  assert.equal(normalizeMobyGamesRegion(["France"], []), "EU");
});

test("source revisions change only when the checksum changes", () => {
  assert.equal(nextSourceRevision("a", "a", 3), 3);
  assert.equal(nextSourceRevision("a", "b", 3), 4);
});

test("dry-run fetches a plan without invoking the trusted writer", async () => {
  let writes = 0;
  const plan = planFor([release(["Europe"], null, [])], []);
  const execution = await executeMobyGamesImport({
    client: { fetchImportPlan: async () => plan },
    gameId: 3550,
    platformId: 9,
    dryRun: true,
    write: async () => {
      writes += 1;
      return "written";
    },
  });
  assert.equal(execution.plan, plan);
  assert.equal(execution.result, null);
  assert.equal(writes, 0);
});

test("client retries a 429 without exposing credentials to diagnostics", async () => {
  let calls = 0;
  const waits: number[] = [];
  const client = new MobyGamesClient({
    apiKey: "secret+credential",
    delayMs: 0,
    maxRetries: 1,
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
    },
    fetchImplementation: async (input) => {
      calls += 1;
      const path = new URL(String(input)).pathname;
      if (calls === 1) {
        return new Response("{}", {
          status: 429,
          headers: { "retry-after": "1" },
        });
      }
      if (path.endsWith("/covers")) return jsonResponse({ cover_groups: [] });
      if (path.endsWith("/platforms/9")) {
        return jsonResponse({
          game_id: 3550,
          platform_id: 9,
          platform_name: "Nintendo 64",
          releases: [release(["Europe"], null, [])],
        });
      }
      return jsonResponse({ game_id: 3550, title: "Majora's Mask" });
    },
  });

  const plan = await client.fetchImportPlan(3550, 9);
  assert.equal(plan.gameExternalId, "3550");
  assert.equal(calls, 4);
  assert.deepEqual(waits, [1_000]);
});

test("sourceKey is internal and compound records have no provider external id", () => {
  const plan = planFor([release(["Europe"], null, [])], []);
  const record = plan.sourceRecords.find(({ recordType }) => recordType === "game_platform");
  assert.equal(record?.sourceKey, "3550:9");
  assert.equal(record?.providerExternalId, null);
});

test("region and release metadata without physical evidence remain source ambiguous", () => {
  const releaseWithoutCodes = {
    countries: ["Japan"],
    description: null,
    release_date: "2000-04-27",
  };
  const plan = planFor([releaseWithoutCodes], []);
  assert.equal(plan.editions.length, 1);
  assert.equal(plan.editions[0]?.canonicalizable, false);
  assert.equal(plan.editions[0]?.reconciliationStatus, "SOURCE_AMBIGUOUS");
  assert.deepEqual(plan.editions[0]?.ambiguities, ["insufficient_positive_physical_evidence"]);
  assert.deepEqual(plan.editions[0]?.identifiers, []);
});

test("explicit variant uniqueness without physical evidence remains source ambiguous", () => {
  const plan = planFor([releaseWith(["China"], "iQue", "2003-11-17", [], "Nintendo")], []);
  assert.equal(plan.editions.length, 1);
  assert.equal(plan.editions[0]?.regionCode, "CN");
  assert.equal(plan.editions[0]?.editionName, "iQue");
  assert.equal(plan.editions[0]?.canonicalizable, false);
  assert.equal(plan.editions[0]?.reconciliationStatus, "SOURCE_AMBIGUOUS");
  assert.deepEqual(plan.editions[0]?.ambiguities, ["insufficient_positive_physical_evidence"]);
});

test("variant-specific physical package evidence can support a no-strong candidate", () => {
  const plan = planFor(
    [release(["United States"], "Collector's Edition", [])],
    [coverGroup(["United States"], "Collector's Edition")],
  );
  assert.equal(plan.editions.length, 1);
  assert.equal(plan.editions[0]?.canonicalizable, true);
  assert.equal(plan.editions[0]?.reconciliationStatus, "NEW");
  assert.equal(plan.editions[0]?.media.length, 1);
  assert.ok(
    plan.editions[0]?.groupingReasons.includes(
      "variant_specific_physical_package_evidence:Collector's Edition",
    ),
  );
});

test("typed identifiers are preserved", () => {
  const plan = planFor(
    [
      release(["United States"], null, [
        { product_code_type: "Nintendo Media PN", product_code: "NUS-NZSE-USA" },
        { product_code_type: "UPC-A", product_code: "045496870775" },
        { product_code_type: "ASIN", product_code: "B00000F1GM" },
      ]),
    ],
    [],
  );
  assert.deepEqual(
    plan.editions[0]?.identifiers.map(({ scheme, identityRole }) => [scheme, identityRole]),
    [
      ["asin", "weak"],
      ["nintendo_media_pn", "strong_physical"],
      ["upc_a", "corroborating"],
    ],
  );
});

test("conflicting strong physical identifiers partition same-region standard releases", () => {
  const plan = planFor(
    [
      releaseWith(["United States"], null, "1998-01-01", [mediaCode("CODE-A-USA")]),
      releaseWith(["United States"], null, "2000-01-01", [mediaCode("CODE-B-USA")]),
    ],
    [],
  );
  assert.equal(plan.editions.length, 2);
  assert.ok(plan.editions.every(({ canonicalizable }) => canonicalizable));
  assert.deepEqual(
    plan.editions.map(({ identifiers }) => identifiers.map(({ value }) => value)),
    [["CODE-A-USA"], ["CODE-B-USA"]],
  );
});

test("shared strong identity connects Australia and New Zealand before region derivation", () => {
  const shared = [mediaCode("CODE-AUS")];
  const plan = planFor(
    [
      releaseWith(["Australia"], null, "1998-01-01", shared),
      releaseWith(["New Zealand"], null, "1998-02-01", shared),
    ],
    [coverGroup(["Australia", "New Zealand"], null)],
  );
  assert.equal(plan.editions.length, 1);
  assert.equal(plan.editions[0]?.regionCode, "AU+NZ");
  assert.equal(plan.editions[0]?.canonicalizable, true);
  assert.equal(plan.editions[0]?.evidence.filter(({ kind }) => kind === "release").length, 2);
  assert.equal(plan.editions[0]?.evidence.filter(({ kind }) => kind === "cover_group").length, 1);
});

test("shared cross-market strong identity cannot override explicit variant", () => {
  const shared = [mediaCode("SAME-CODE")];
  const plan = planFor(
    [
      releaseWith(["United States"], null, "1998-01-01", shared),
      releaseWith(["United States", "Canada"], "Players Choice", "2000-01-01", shared),
    ],
    [],
  );
  assert.equal(plan.editions.length, 2);
  assert.equal(plan.editions.find(({ editionName }) => editionName === null)?.regionCode, "US");
  assert.equal(
    plan.editions.find(({ editionName }) => editionName === "Players Choice")?.regionCode,
    "CA+US",
  );
});

test("supported Mexico evidence is retained in cross-market region coverage", () => {
  const plan = planFor(
    [
      releaseWith(["United States", "Canada", "Mexico", "Other"], "Players Choice", "2000-01-01", [
        mediaCode("SAME-CODE"),
      ]),
    ],
    [],
  );
  assert.equal(plan.editions[0]?.regionCode, "CA+MX+US");
  const source = plan.sourceRecords.find(({ recordType }) => recordType === "game_platform");
  assert.deepEqual((source?.payload.releases as Record<string, unknown>[])[0]?.countries, [
    "United States",
    "Canada",
    "Mexico",
    "Other",
  ]);
});

test("identifier-less cross-market evidence is not absorbed without positive support", () => {
  const plan = planFor(
    [
      releaseWith(["Australia"], null, "1998-01-01", [mediaCode("CODE-AUS")]),
      releaseWith(["New Zealand"], null, "2000-01-01", []),
    ],
    [],
  );
  const strong = plan.editions.find(({ canonicalizable }) => canonicalizable);
  const unresolved = plan.editions.find(({ canonicalizable }) => !canonicalizable);
  assert.equal(plan.editions.length, 2);
  assert.equal(strong?.regionCode, "AU");
  assert.equal(strong?.evidence.filter(({ kind }) => kind === "release").length, 1);
  assert.equal(unresolved?.regionCode, "NZ");
  assert.deepEqual(unresolved?.ambiguities, ["insufficient_positive_physical_evidence"]);
});

test("a sole strong partition does not absorb unsupported no-strong evidence", () => {
  const plan = planFor(
    [
      releaseWith(["United States"], null, "1998-01-01", [mediaCode("CODE-A")]),
      releaseWith(["United States"], null, "2000-01-01", []),
    ],
    [],
  );
  const strong = plan.editions.find(({ identifiers }) =>
    identifiers.some(({ value }) => value === "CODE-A"),
  );
  const unresolved = plan.editions.find(({ canonicalizable }) => !canonicalizable);
  assert.equal(plan.editions.length, 2);
  assert.equal(strong?.canonicalizable, true);
  assert.equal(strong?.evidence.filter(({ kind }) => kind === "release").length, 1);
  assert.deepEqual(unresolved?.ambiguities, ["insufficient_positive_physical_evidence"]);
  assert.equal(unresolved?.evidence.filter(({ kind }) => kind === "release").length, 1);
});

test("shared corroborating identity safely associates no-strong evidence", () => {
  const sharedUpc = { product_code_type: "UPC-A", product_code: "UPC-X" };
  const plan = planFor(
    [
      releaseWith(["United States"], null, "1998-01-01", [mediaCode("CODE-A"), sharedUpc]),
      releaseWith(["United States"], null, "2000-01-01", [sharedUpc]),
    ],
    [],
  );
  assert.equal(plan.editions.length, 1);
  assert.equal(plan.editions[0]?.canonicalizable, true);
  assert.equal(plan.editions[0]?.evidence.filter(({ kind }) => kind === "release").length, 2);
  assert.deepEqual(
    plan.editions[0]?.identifiers.map(({ value }) => value),
    ["CODE-A", "UPC-X"],
  );
});

test("weak overlap cannot associate no-strong evidence with a sole strong partition", () => {
  const sharedAsin = { product_code_type: "ASIN", product_code: "ASIN-X" };
  const plan = planFor(
    [
      releaseWith(["United States"], null, "1998-01-01", [mediaCode("CODE-A"), sharedAsin]),
      releaseWith(["United States"], null, "2000-01-01", [sharedAsin]),
    ],
    [],
  );
  const strong = plan.editions.find(({ identifiers }) =>
    identifiers.some(({ value }) => value === "CODE-A"),
  );
  const unresolved = plan.editions.find(({ canonicalizable }) => !canonicalizable);
  assert.equal(plan.editions.length, 2);
  assert.equal(strong?.evidence.filter(({ kind }) => kind === "release").length, 1);
  assert.deepEqual(unresolved?.ambiguities, ["insufficient_positive_physical_evidence"]);
});

test("no-strong evidence stays ambiguous beside multiple unsupported strong partitions", () => {
  const plan = planFor(
    [
      releaseWith(["United States"], null, "1998-01-01", [mediaCode("CODE-A")]),
      releaseWith(["United States"], null, "1999-01-01", [mediaCode("CODE-B")]),
      releaseWith(["United States"], null, "2000-01-01", []),
    ],
    [],
  );
  assert.equal(plan.editions.length, 3);
  assert.equal(plan.editions.filter(({ canonicalizable }) => canonicalizable).length, 2);
  assert.equal(plan.editions.filter(({ canonicalizable }) => !canonicalizable).length, 1);
});

test("shared EUR physical identity aggregates localized releases and cover groups", () => {
  const shared = [mediaCode("NUS-XXXX-EUR")];
  const plan = planFor(
    [
      releaseWith(["Germany"], null, "1998-01-01", shared, "Distributor A"),
      releaseWith(["Spain"], null, "1998-02-01", shared, "Distributor B"),
      releaseWith(["United Kingdom"], null, "1998-03-01", shared, "Distributor C"),
      releaseWith(["Belgium"], null, "1998-04-01", shared, "Distributor D"),
    ],
    [
      coverGroup(["Germany"], null),
      coverGroup(["Spain"], null),
      coverGroup(["United Kingdom"], null),
      coverGroup(["Belgium"], null),
    ],
  );
  assert.equal(plan.editions.length, 1);
  assert.equal(plan.editions[0]?.regionCode, "EU");
  assert.equal(plan.editions[0]?.canonicalizable, true);
  assert.equal(plan.editions[0]?.evidence.filter(({ kind }) => kind === "cover_group").length, 4);
});

test("identifier-less EU evidence is not absorbed by elimination", () => {
  const plan = planFor(
    [
      releaseWith(["Germany"], null, "1998-01-01", [mediaCode("NUS-XXXX-EUR")]),
      releaseWith(["Spain"], null, "2000-01-01", []),
    ],
    [],
  );
  assert.equal(plan.editions.length, 2);
  assert.ok(plan.editions.every(({ regionCode }) => regionCode === "EU"));
  assert.equal(plan.editions.filter(({ canonicalizable }) => !canonicalizable).length, 1);
});

test("release dates alone do not split a physical Edition", () => {
  const plan = planFor(
    [
      releaseWith(["Japan"], null, "1998-01-01", []),
      releaseWith(["Japan"], null, "2000-01-01", []),
    ],
    [],
  );
  assert.equal(plan.editions.length, 1);
  assert.deepEqual(plan.editions[0]?.releaseDates, ["1998-01-01", "2000-01-01"]);
});

test("distributor differences alone do not split a physical Edition", () => {
  const shared = [mediaCode("NUS-DISTRIBUTOR-EUR")];
  const plan = planFor(
    [
      releaseWith(["Europe"], null, "1998-01-01", shared, "Distributor A"),
      releaseWith(["Europe"], null, "1998-01-01", shared, "Distributor B"),
    ],
    [],
  );
  assert.equal(plan.editions.length, 1);
  assert.equal(plan.editions[0]?.canonicalizable, true);
});

test("weak commerce overlap cannot bridge conflicting physical identities", () => {
  const sharedAsin = { product_code_type: "ASIN", product_code: "SHARED-ASIN" };
  const plan = planFor(
    [
      releaseWith(["United States"], null, "1998-01-01", [mediaCode("CODE-A"), sharedAsin]),
      releaseWith(["United States"], null, "1998-01-01", [mediaCode("CODE-B"), sharedAsin]),
    ],
    [],
  );
  assert.equal(plan.editions.length, 2);
});

test("shared identifier does not merge materially named variants", () => {
  const code = [{ product_code_type: "Nintendo Media PN", product_code: "NUS-CZLE-USA" }];
  const plan = planFor(
    [
      release(["United States"], "Standard release", code),
      release(["United States"], "Players Choice", code),
    ],
    [],
  );
  assert.equal(plan.editions.length, 2);
  assert.deepEqual(
    plan.editions.map(({ editionName }) => editionName),
    [null, "Players Choice"],
  );
});

test("packaging geography alone does not create an Edition", () => {
  const plan = planFor(
    [release(["Europe"], null, [])],
    [coverGroup(["Germany"], null), coverGroup(["United Kingdom"], null)],
  );
  assert.equal(plan.editions.length, 1);
  assert.equal(plan.editions[0]?.regionCode, "EU");
  assert.equal(plan.editions[0]?.evidence.filter(({ kind }) => kind === "cover_group").length, 2);
  assert.equal(plan.editions[0]?.canonicalizable, false);
  assert.deepEqual(plan.editions[0]?.ambiguities, ["insufficient_positive_physical_evidence"]);
});

test("EAN-only evidence remains conservatively source ambiguous", () => {
  const plan = planFor(
    [release(["Brazil"], null, [{ product_code_type: "EAN-13", product_code: "7890000000000" }])],
    [coverGroup(["Brazil"], null)],
  );
  assert.equal(plan.editions.length, 1);
  assert.equal(plan.editions[0]?.regionCode, "BR");
  assert.equal(plan.editions[0]?.canonicalizable, false);
  assert.equal(plan.editions[0]?.reconciliationStatus, "SOURCE_AMBIGUOUS");
  assert.deepEqual(plan.editions[0]?.ambiguities, ["insufficient_positive_physical_evidence"]);
});

test("explicit variant cover does not attach to Standard by elimination", () => {
  const generic = coverGroup(["United States"], null);
  const collector = coverGroup(["United States"], "Collectors Edition");
  generic.covers[0]!.image = "https://cdn.example/generic-front.jpg";
  collector.covers[0]!.image = "https://cdn.example/collector-front.jpg";
  const plan = planFor(
    [release(["United States"], null, [mediaCode("CODE-USA")])],
    [generic, collector],
  );
  assert.equal(plan.editions.length, 1);
  assert.equal(plan.editions[0]?.editionName, null);
  assert.deepEqual(
    plan.editions[0]?.media.map(({ assetUrl }) => assetUrl),
    ["https://cdn.example/generic-front.jpg"],
  );
  assert.equal(plan.editions[0]?.evidence.filter(({ kind }) => kind === "cover_group").length, 1);
  assert.equal(plan.unresolvedEvidence.length, 1);
});

test("source cover count includes both matched and unresolved groups", () => {
  const plan = planFor(
    [release(["United States"], null, [mediaCode("CODE-USA")])],
    [
      coverGroup(["United States"], null),
      coverGroup(["United States"], "Collector's Edition"),
      coverGroup(["Brazil"], null),
    ],
  );
  assert.equal(countMobyGamesSourceCoverGroups(plan), 3);
  assert.equal(plan.editions[0]?.evidence.filter(({ kind }) => kind === "cover_group").length, 1);
  assert.equal(plan.unresolvedEvidence.length, 2);
});

test("ambiguous unresolved region is not canonicalized", () => {
  const plan = planFor([release([], null, [])], []);
  assert.equal(plan.editions[0]?.canonicalizable, false);
  assert.deepEqual(plan.editions[0]?.ambiguities, [
    "insufficient_positive_physical_evidence",
    "region_unresolved",
  ]);
});

test("front/back media deduplicates while unsupported scans stay in source payload", () => {
  const group = coverGroup(["Europe"], null);
  group.covers = [
    cover("Front Cover", "https://cdn.example/front.jpg"),
    cover("Front Cover", "https://cdn.example/front.jpg"),
    cover("Back Cover", "https://cdn.example/back.jpg"),
    cover("Manual", "https://cdn.example/manual.jpg"),
  ];
  const plan = planFor([release(["Europe"], null, [])], [group]);
  assert.deepEqual(
    plan.editions[0]?.media.map(({ kind }) => kind),
    ["cover_back", "cover_front"],
  );
  const storedCovers = plan.sourceRecords.find(({ recordType }) => recordType === "covers");
  assert.equal(
    ((storedCovers?.payload.cover_groups as unknown[])[0] as { covers: unknown[] }).covers.length,
    4,
  );
});

test("release evidence fingerprints ignore source array ordering", () => {
  const first = release(["Europe", "Germany"], null, [
    { product_code_type: "EAN-13", product_code: "1" },
    { product_code_type: "Nintendo Media PN", product_code: "NUS-NZSP-EUR" },
  ]);
  const second = release(["Germany", "Europe"], null, [...first.product_codes].reverse());
  const left = planFor([first], []).editions[0]?.evidence[0]?.fingerprint;
  const right = planFor([second], []).editions[0]?.evidence[0]?.fingerprint;
  assert.equal(left, right);
});

test("coarse Edition identity without strong evidence is reconciliation ambiguity", () => {
  const candidate = planFor([release(["United States"], null, [mediaCode("CODE-A")])], [])
    .editions[0]!;
  const decision = decideMobyGamesEditionReconciliation(
    candidate,
    [existingEdition("edition-a", "US", null, [])],
    [],
  );
  assert.deepEqual(decision, { editionId: null, status: "RECONCILIATION_AMBIGUOUS" });
});

test("exact strong typed identity safely reconciles without conflict", () => {
  const candidate = planFor([release(["United States"], null, [mediaCode("CODE-A")])], [])
    .editions[0]!;
  const decision = decideMobyGamesEditionReconciliation(
    candidate,
    [existingEdition("edition-a", "US", null, [{ scheme: "nintendo_media_pn", value: "CODE-A" }])],
    [],
  );
  assert.deepEqual(decision, {
    editionId: "edition-a",
    status: "MATCHED_BY_STRONG_IDENTIFIER",
  });
});

test("a strong match remains safe beside a disjoint same-region strong Edition", () => {
  const candidate = planFor([release(["United States"], null, [mediaCode("CODE-A")])], [])
    .editions[0]!;
  const decision = decideMobyGamesEditionReconciliation(
    candidate,
    [
      existingEdition("edition-a", "US", null, [{ scheme: "nintendo_media_pn", value: "CODE-A" }]),
      existingEdition("edition-b", "US", null, [{ scheme: "nintendo_media_pn", value: "CODE-B" }]),
    ],
    [],
  );
  assert.deepEqual(decision, {
    editionId: "edition-a",
    status: "MATCHED_BY_STRONG_IDENTIFIER",
  });
});

test("conflicting existing strong identity prevents reconciliation", () => {
  const candidate = planFor([release(["United States"], null, [mediaCode("CODE-A")])], [])
    .editions[0]!;
  const decision = decideMobyGamesEditionReconciliation(
    candidate,
    [existingEdition("edition-b", "US", null, [{ scheme: "nintendo_media_pn", value: "CODE-B" }])],
    [],
  );
  assert.deepEqual(decision, { editionId: null, status: "RECONCILIATION_AMBIGUOUS" });
});

test("existing source evidence remains the strongest repeat-import identity", () => {
  const candidate = planFor([release(["United States"], null, [mediaCode("CODE-A")])], [])
    .editions[0]!;
  const decision = decideMobyGamesEditionReconciliation(
    candidate,
    [existingEdition("edition-a", "US", null, [])],
    ["edition-a"],
  );
  assert.deepEqual(decision, {
    editionId: "edition-a",
    status: "MATCHED_BY_SOURCE_EVIDENCE",
  });
});

function planFor(
  releases: readonly Record<string, unknown>[],
  groups: readonly Record<string, unknown>[],
) {
  return deriveMobyGamesImportPlan({
    game: {
      game_id: 3550,
      title: "The Legend of Zelda: Majora's Mask",
      description: "<p>Safe</p>",
    },
    gamePlatform: {
      game_id: 3550,
      platform_id: 9,
      platform_name: "Nintendo 64",
      releases,
    },
    covers: { cover_groups: groups },
    fetchedAt,
  });
}

function release(
  countries: readonly string[],
  description: string | null,
  productCodes: readonly Record<string, unknown>[],
) {
  return {
    countries,
    description,
    product_codes: productCodes,
    release_date: "2000-10-26",
    companies: [],
  };
}

function releaseWith(
  countries: readonly string[],
  description: string | null,
  releaseDate: string,
  productCodes: readonly Record<string, unknown>[],
  distributor?: string,
) {
  return {
    countries,
    description,
    product_codes: productCodes,
    release_date: releaseDate,
    companies:
      distributor === undefined ? [] : [{ company_name: distributor, role: "Distributed by" }],
  };
}

function mediaCode(value: string) {
  return { product_code_type: "Nintendo Media PN", product_code: value };
}

function existingEdition(
  id: string,
  regionCode: string | null,
  editionName: string | null,
  identifiers: readonly { readonly scheme: string; readonly value: string }[],
) {
  return { id, regionCode, editionName, identifiers };
}

function coverGroup(
  countries: readonly string[],
  comments: string | null,
): Record<string, unknown> & { covers: Record<string, unknown>[] } {
  return {
    countries,
    comments,
    covers: [cover("Front Cover", `https://cdn.example/${countries.join("-")}.jpg`)],
  };
}

function cover(scanOf: string, image: string) {
  return { scan_of: scanOf, image, width: 800, height: 600 };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
