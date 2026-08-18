import type { Profile } from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import { resolveCaller } from "../caller";
import type { OwnedEntityResult } from "../result";
import { databaseFailure, mapRows } from "../result";
import { toProfile } from "./mapping";

/**
 * Reading the caller's own Profile as a domain model.
 *
 * The Auth layer already resolves a Profile while establishing session state,
 * and that remains the owner of Auth state: nothing here duplicates it or is
 * meant to drive what the app renders while it is signing in. This exists for
 * data surfaces that want a `Profile` in the same mapped form as everything
 * else they read, rather than a generated database row.
 *
 * Read-only on purpose. Profiles are created by a database trigger when the
 * Auth user appears, so there is no creation path here, and nothing repairs a
 * missing row: a signed-in user without a Profile is an integrity problem to
 * surface, and writing the row from a client would hide it.
 */

const PROFILE_COLUMNS = "id, username, display_name, avatar_path, bio";

/**
 * Reads the signed-in user's Profile.
 *
 * `not_found` here means the trigger did not do its job, which is why it is
 * reported rather than smoothed over.
 */
export async function getMyProfile(
  client: GeekSupabaseClient,
): Promise<OwnedEntityResult<Profile>> {
  const caller = await resolveCaller(client);

  if (caller.outcome !== "ok") {
    return caller;
  }

  const { data, error } = await client
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", caller.userId)
    .maybeSingle();

  if (error !== null) {
    return databaseFailure(error);
  }

  if (data === null) {
    return { outcome: "not_found" };
  }

  return mapRows(() => toProfile(data));
}
