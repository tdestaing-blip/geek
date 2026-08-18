import type { Copy, CopyAvailability, CopyVisibility } from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import { resolveCaller } from "../caller";
import type { OwnedEntityResult, OwnedResult } from "../result";
import { databaseFailure, mapRows } from "../result";
import { toCopy } from "./mapping";

/**
 * The two ownership writes the current schema already supports safely.
 *
 * Both go through ordinary authenticated inserts and updates under existing
 * row-level security, which grants the owner exactly these columns and no
 * others. Nothing here invents a database function or a policy to make a future
 * screen easier: `owner_id` cannot be written to anything but the caller, and
 * ownership transfer is a server-side operation that no client may perform.
 */

const RETURNING = "id, game_id, edition_id, owner_id, visibility, availability, created_at";

/** What the owner may decide when adding a Copy. */
export type CopyCreationAvailability = Extract<CopyAvailability, "private" | "open_to_trade">;

export type AddCopyInput = {
  readonly editionId: string;
  /** Defaults to private, matching the column default. */
  readonly visibility?: CopyVisibility;
  /** Defaults to not open to trade, matching the column default. */
  readonly availability?: CopyCreationAvailability;
};

/**
 * Adds a Copy of an Edition to the caller's collection.
 *
 * The owner is the caller, never an argument. The insert policy would reject
 * anything else, but not being able to express it is better than being refused.
 *
 * The defaults are the cautious ones: a new Copy is private and closed to
 * trade until its owner says otherwise. An Edition id that does not exist comes
 * back as a `failed` outcome carrying the foreign-key violation, since that is
 * a caller bug rather than a state a screen should render.
 */
export async function addCopy(
  client: GeekSupabaseClient,
  input: AddCopyInput,
): Promise<OwnedEntityResult<Copy>> {
  const caller = await resolveCaller(client);

  if (caller.outcome !== "ok") {
    return caller;
  }

  const edition = await client
    .from("editions")
    .select("game_id")
    .eq("id", input.editionId)
    .maybeSingle();

  if (edition.error !== null) {
    return databaseFailure(edition.error);
  }

  if (edition.data === null) {
    return { outcome: "not_found" };
  }

  const { data, error } = await client
    .from("copies")
    .insert({
      owner_id: caller.userId,
      game_id: edition.data.game_id,
      edition_id: input.editionId,
      ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
      ...(input.availability === undefined ? {} : { availability: input.availability }),
    })
    .select(RETURNING)
    .single();

  if (error !== null) {
    return databaseFailure(error);
  }

  return mapRows(() => toCopy(data));
}

/** The owner-controlled flags on a Copy. */
export type CopyAvailabilityUpdate = {
  readonly visibility?: CopyVisibility;
  readonly availability?: CopyAvailability;
};

/**
 * Changes how a Copy is exposed: visible in a public collection, open to trade,
 * or neither.
 *
 * These two columns are the only ones an owner may update, which is a
 * deliberate property of the schema rather than a limitation of this function.
 * Condition, components and private details each have their own boundary, and
 * an owner cannot rewrite `edition_id` to turn their Copy into a different
 * release.
 *
 * A Copy that is not the caller's is `not_found` — the update matches no row,
 * and saying anything more precise would confirm that someone else's Copy
 * exists.
 */
export async function updateCopyAvailability(
  client: GeekSupabaseClient,
  copyId: string,
  update: CopyAvailabilityUpdate,
): Promise<OwnedEntityResult<Copy>> {
  const caller = await resolveCaller(client);

  if (caller.outcome !== "ok") {
    return caller;
  }

  const changes = {
    ...(update.visibility === undefined ? {} : { visibility: update.visibility }),
    ...(update.availability === undefined ? {} : { availability: update.availability }),
  };

  if (Object.keys(changes).length === 0) {
    throw new RangeError("updateCopyAvailability needs at least one field to change");
  }

  const { data, error } = await client
    .from("copies")
    .update(changes)
    .eq("id", copyId)
    .eq("owner_id", caller.userId)
    .select(RETURNING)
    .maybeSingle();

  if (error !== null) {
    return databaseFailure(error);
  }

  if (data === null) {
    return { outcome: "not_found" };
  }

  return mapRows(() => toCopy(data));
}

/** Adds a real Copy when only its Game is known. */
export async function addQuickCopy(
  client: GeekSupabaseClient,
  gameId: string,
): Promise<OwnedResult<Copy>> {
  const caller = await resolveCaller(client);

  if (caller.outcome !== "ok") {
    return caller;
  }

  const { data, error } = await client
    .from("copies")
    .insert({ owner_id: caller.userId, game_id: gameId })
    .select(RETURNING)
    .single();

  if (error !== null) {
    return databaseFailure(error);
  }

  return mapRows(() => toCopy(data));
}

/**
 * Attaches or safely corrects a Copy's Edition without replacing its identity.
 *
 * The database rejects cross-Game Editions and corrections while the Copy has
 * Edition-specific component state or a commercial commitment. Those failures
 * retain their database message so the caller can explain what must be cleared
 * before retrying.
 */
export async function setCopyEdition(
  client: GeekSupabaseClient,
  copyId: string,
  editionId: string,
): Promise<OwnedEntityResult<Copy>> {
  const caller = await resolveCaller(client);

  if (caller.outcome !== "ok") {
    return caller;
  }

  const { data, error } = await client
    .from("copies")
    .update({ edition_id: editionId })
    .eq("id", copyId)
    .eq("owner_id", caller.userId)
    .select(RETURNING)
    .maybeSingle();

  if (error !== null) {
    return databaseFailure(error);
  }

  if (data === null) {
    return { outcome: "not_found" };
  }

  return mapRows(() => toCopy(data));
}
