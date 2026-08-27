import { getMyActiveListingsForCopies, getMyCopyPhotoRoles } from "@geek/data";
import type { CopyPhotoRole, Listing } from "@geek/domain";

import { supabase } from "../lib/supabase";
import {
  copyTilePresentationsOrEmpty,
  createCopyTilePresentation,
  type CopyTilePresentation,
  type CopyTilePresentationResult,
} from "./copy-tile-presentation";

/** Loads active Listing and private photo-role signals in two bounded owner-scoped queries. */
export async function loadCopyTilePresentations(
  copyIds: readonly string[],
): Promise<CopyTilePresentationResult> {
  const ids = [...new Set(copyIds)];
  const listingsByCopyId = new Map<string, Listing>();
  const rolesByCopyId = new Map<string, readonly CopyPhotoRole[]>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const [listings, photoRoles] = await Promise.all([
      getMyActiveListingsForCopies(supabase, batch),
      getMyCopyPhotoRoles(supabase, batch),
    ]);
    if (listings.outcome === "unauthenticated" || photoRoles.outcome === "unauthenticated") {
      return { outcome: "unauthenticated" };
    }
    if (listings.outcome !== "ok" || photoRoles.outcome !== "ok") {
      return { outcome: "error" };
    }
    for (const listing of listings.data) listingsByCopyId.set(listing.copyId, listing);
    for (const summary of photoRoles.data) {
      rolesByCopyId.set(summary.copyId, summary.photoRoles);
    }
  }

  return {
    outcome: "ok",
    data: new Map(
      ids.map((copyId) => [
        copyId,
        createCopyTilePresentation(listingsByCopyId.get(copyId), rolesByCopyId.get(copyId) ?? []),
      ]),
    ),
  };
}

/** Loads presentation-only signals without letting them erase canonical Collection rows. */
export async function loadOptionalCopyTilePresentations(
  copyIds: readonly string[],
): Promise<ReadonlyMap<string, CopyTilePresentation>> {
  try {
    const result = await loadCopyTilePresentations(copyIds);
    if (result.outcome !== "ok") reportOptionalEnrichmentFailure(result.outcome);
    return copyTilePresentationsOrEmpty(result);
  } catch {
    reportOptionalEnrichmentFailure("exception");
    return new Map();
  }
}

function reportOptionalEnrichmentFailure(outcome: "unauthenticated" | "error" | "exception"): void {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.error(`Optional Copy tile enrichment failed (${outcome}).`);
  }
}
