import type {
  Copy,
  CopyComponentAssessment,
  CopyComponentState,
  CopyPrivateDetails,
  Edition,
  Game,
  Platform,
} from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import { resolveCaller } from "../caller";
import { toEdition, toGame, toPlatform } from "../catalog/mapping";
import type { OwnedEntityResult } from "../result";
import { databaseFailure, InvalidRowError, mapRows } from "../result";
import { toCopy, toCopyComponentState, toCopyPrivateDetails, toEditionComponent } from "./mapping";

/**
 * The detail view of a Copy the caller owns.
 *
 * Named for its subject on purpose. There is no `getCopyDetail`, because a
 * public collector view must not be able to reach this by passing a different
 * id and hoping row-level security catches it. A future public view gets its
 * own function returning its own type, and the compiler will not let one stand
 * in for the other.
 */
export type MyCopyDetail = {
  readonly copy: Copy;
  readonly edition: Edition;
  readonly game: Game;
  readonly platform: Platform;
  /**
   * Every component the Edition shipped with, in catalog order, each with
   * whatever the owner recorded about it.
   *
   * The list is driven by the Edition rather than by what has been assessed, so
   * a component the owner has never looked at still appears, with a `null`
   * state. That is the difference between "not checked yet" and "checked, and
   * its presence is unknown".
   */
  readonly components: readonly CopyComponentAssessment[];
  /**
   * What this owner privately recorded, or `null` if they recorded nothing.
   *
   * A separate field holding a separate type, so private data is visible in the
   * shape of the result and cannot ride along inside `copy`.
   */
  readonly privateDetails: CopyPrivateDetails | null;
};

const COPY_SELECT = `
  id, edition_id, owner_id, visibility, trade_availability, created_at,
  editions!inner (
    id, game_id, platform_id, edition_name, region_code, supported_languages,
    release_date, publisher_name, packaging_type,
    games!inner (id, canonical_title, description, original_release_date),
    platforms!inner (id, slug, name)
  )
`;

const COMPONENT_SELECT = `
  id, edition_id, component_key, name, kind, required_for_complete, sort_order,
  copy_component_states (
    copy_id, edition_component_id, presence, condition_grade, condition_notes
  )
`;

const PRIVATE_DETAILS_SELECT = `
  copy_id, owner_id, acquired_at, purchase_amount_minor, purchase_currency,
  provenance, private_notes, storage_location
`;

/**
 * Reads one of the caller's own Copies in full.
 *
 * Scoped by owner in the query as well as by row-level security. A Copy that
 * exists but belongs to someone else is `not_found`, which is both the honest
 * answer to "show me my Copy" and the one that reveals nothing: distinguishing
 * "not yours" from "does not exist" would confirm the existence of other
 * people's Copies to anyone guessing ids.
 *
 * Three reads. The Copy comes first because its Edition determines which
 * components to ask for; the components and the private details are then
 * fetched together, since neither depends on the other.
 */
export async function getMyCopyDetail(
  client: GeekSupabaseClient,
  copyId: string,
): Promise<OwnedEntityResult<MyCopyDetail>> {
  const caller = await resolveCaller(client);

  if (caller.outcome !== "ok") {
    return caller;
  }

  const copyResponse = await client
    .from("copies")
    .select(COPY_SELECT)
    .eq("id", copyId)
    .eq("owner_id", caller.userId)
    .maybeSingle();

  if (copyResponse.error !== null) {
    return databaseFailure(copyResponse.error);
  }

  const copyRow = copyResponse.data;

  if (copyRow === null) {
    return { outcome: "not_found" };
  }

  const [componentsResponse, privateResponse] = await Promise.all([
    client
      .from("edition_components")
      .select(COMPONENT_SELECT)
      .eq("edition_id", copyRow.edition_id)
      // Restricts the embedded states to this Copy. Without it the embed would
      // also carry states belonging to other people's public Copies of the same
      // Edition, which row-level security permits reading but which have
      // nothing to do with this one.
      .eq("copy_component_states.copy_id", copyId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    client
      .from("copy_private_details")
      .select(PRIVATE_DETAILS_SELECT)
      .eq("copy_id", copyId)
      // Private details are keyed by Copy *and* owner: a Copy that has changed
      // hands keeps one row per person who has owned it. Asking for both halves
      // of the key is what makes this the caller's own record rather than
      // whichever row happens to come back first.
      .eq("owner_id", caller.userId)
      .maybeSingle(),
  ]);

  if (componentsResponse.error !== null) {
    return databaseFailure(componentsResponse.error);
  }

  if (privateResponse.error !== null) {
    return databaseFailure(privateResponse.error);
  }

  const componentRows = componentsResponse.data;
  const privateRow = privateResponse.data;

  return mapRows((): MyCopyDetail => ({
    copy: toCopy(copyRow),
    edition: toEdition(copyRow.editions),
    game: toGame(copyRow.editions.games),
    platform: toPlatform(copyRow.editions.platforms),
    components: componentRows.map((row) => ({
      component: toEditionComponent(row),
      state: toAssessedState(row.copy_component_states, row.id),
    })),
    privateDetails: privateRow === null ? null : toCopyPrivateDetails(privateRow),
  }));
}

/**
 * Collapses the embedded state list into the one state a component can have.
 *
 * The embed is a list because PostgREST cannot know that
 * `(copy_id, edition_component_id)` is unique, but the database does. An empty
 * list means unassessed; more than one would mean that key had stopped holding,
 * which is worth refusing rather than resolving by picking the first.
 */
function toAssessedState(
  rows: readonly StateFields[],
  componentId: string,
): CopyComponentState | null {
  const [first, ...rest] = rows;

  if (first === undefined) {
    return null;
  }

  if (rest.length > 0) {
    throw new InvalidRowError(
      "copy_component_states",
      `expected at most one state for component ${componentId}, got ${rows.length}`,
    );
  }

  return toCopyComponentState(first);
}

type StateFields = Parameters<typeof toCopyComponentState>[0];
