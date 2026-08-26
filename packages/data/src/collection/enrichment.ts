import type {
  CalendarDate,
  CopyComponentPresence,
  CopyComponentState,
  CopyPrivateDetails,
  EditionComponent,
  Money,
} from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import { resolveCaller } from "../caller";
import type { OwnedEntityResult, OwnedResult, ReadResult } from "../result";
import { databaseFailure, mapRows } from "../result";
import { toCopyComponentState, toCopyPrivateDetails, toEditionComponent } from "./mapping";

const PRIVATE_DETAILS_RETURNING = `
  copy_id, owner_id, acquired_at, purchase_amount_minor, purchase_currency,
  provenance, is_completed, private_notes, storage_location
`;

export type CopyPrivateDetailsInput = {
  readonly acquiredAt: CalendarDate | null;
  readonly purchasePrice: Money | null;
  readonly provenance: string | null;
  readonly isCompleted: boolean;
};

export type CopyComponentStateInput = {
  readonly editionComponentId: string;
  readonly presence: CopyComponentPresence;
};

/** Reads the canonical physical components catalogued for an Edition. */
export async function getEditionComponents(
  client: GeekSupabaseClient,
  editionId: string,
): Promise<ReadResult<readonly EditionComponent[]>> {
  const { data, error } = await client
    .from("edition_components")
    .select("id, edition_id, component_key, name, kind, required_for_complete, sort_order")
    .eq("edition_id", editionId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error !== null) return databaseFailure(error);
  return mapRows(() => data.map(toEditionComponent));
}

/** Creates or updates this owner's private details for one currently-owned Copy. */
export async function updateCopyPrivateDetails(
  client: GeekSupabaseClient,
  copyId: string,
  input: CopyPrivateDetailsInput,
): Promise<OwnedEntityResult<CopyPrivateDetails>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const ownedCopy = await client
    .from("copies")
    .select("id")
    .eq("id", copyId)
    .eq("owner_id", caller.userId)
    .maybeSingle();
  if (ownedCopy.error !== null) return databaseFailure(ownedCopy.error);
  if (ownedCopy.data === null) return { outcome: "not_found" };

  const values = {
    acquired_at: input.acquiredAt,
    purchase_amount_minor: input.purchasePrice?.amountMinor ?? null,
    purchase_currency: input.purchasePrice?.currency ?? null,
    provenance: input.provenance,
    is_completed: input.isCompleted,
  };
  const inserted = await client
    .from("copy_private_details")
    .insert({ copy_id: copyId, owner_id: caller.userId, ...values })
    .select(PRIVATE_DETAILS_RETURNING)
    .single();

  if (inserted.error === null) return mapRows(() => toCopyPrivateDetails(inserted.data));
  if (inserted.error.code !== "23505") return databaseFailure(inserted.error);

  const updated = await client
    .from("copy_private_details")
    .update(values)
    .eq("copy_id", copyId)
    .eq("owner_id", caller.userId)
    .select(PRIVATE_DETAILS_RETURNING)
    .maybeSingle();
  if (updated.error !== null) return databaseFailure(updated.error);
  const updatedData = updated.data;
  if (updatedData === null) return { outcome: "not_found" };
  return mapRows(() => toCopyPrivateDetails(updatedData));
}

/** Records only the component assessments explicitly changed in the Add Copy sheet. */
export async function updateCopyComponentStates(
  client: GeekSupabaseClient,
  copyId: string,
  editionId: string,
  states: readonly CopyComponentStateInput[],
): Promise<OwnedResult<readonly CopyComponentState[]>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;
  if (states.length === 0) return { outcome: "ok", data: [] };

  const ownedCopy = await client
    .from("copies")
    .select("id, edition_id")
    .eq("id", copyId)
    .eq("owner_id", caller.userId)
    .maybeSingle();
  if (ownedCopy.error !== null) return databaseFailure(ownedCopy.error);
  if (ownedCopy.data === null || ownedCopy.data.edition_id !== editionId) {
    return {
      outcome: "failed",
      failure: {
        source: "database",
        message: "The Copy does not belong to the caller or its Edition changed.",
        code: null,
        details: null,
        hint: null,
      },
    };
  }

  const recorded: CopyComponentState[] = [];
  for (const state of states) {
    const values = {
      presence: state.presence,
      condition_grade: null,
      condition_notes: null,
    };
    const inserted = await client
      .from("copy_component_states")
      .insert({
        copy_id: copyId,
        edition_id: editionId,
        edition_component_id: state.editionComponentId,
        ...values,
      })
      .select("edition_component_id, presence, condition_grade, condition_notes")
      .single();

    if (inserted.error === null) {
      const mapped = mapRows(() => toCopyComponentState(inserted.data));
      if (mapped.outcome !== "ok") return mapped;
      recorded.push(mapped.data);
      continue;
    }
    if (inserted.error.code !== "23505") return databaseFailure(inserted.error);

    const updated = await client
      .from("copy_component_states")
      .update(values)
      .eq("copy_id", copyId)
      .eq("edition_component_id", state.editionComponentId)
      .select("edition_component_id, presence, condition_grade, condition_notes")
      .maybeSingle();
    if (updated.error !== null) return databaseFailure(updated.error);
    const updatedData = updated.data;
    if (updatedData === null) {
      return {
        outcome: "failed",
        failure: {
          source: "database",
          message: "The component state could not be recorded.",
          code: null,
          details: null,
          hint: null,
        },
      };
    }
    const mapped = mapRows(() => toCopyComponentState(updatedData));
    if (mapped.outcome !== "ok") return mapped;
    recorded.push(mapped.data);
  }

  return { outcome: "ok", data: recorded };
}
