import type { Follow, FollowCounts, Profile } from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import { resolveCaller } from "../caller";
import type { Page, PageRequest } from "../pagination";
import { resolvePage, toRange } from "../pagination";
import { toProfile } from "../profile/mapping";
import type { OwnedResult } from "../result";
import { databaseFailure, mapRows } from "../result";

const FOLLOW_PAGE_BOUNDS = { defaultLimit: 20, maxLimit: 50 } as const;
const FOLLOW_COLUMNS = "follower_id, followed_id, created_at";
const PROFILE_COLUMNS = "id, username, display_name, avatar_path, bio";

export type FollowCollector = {
  readonly follow: Follow;
  readonly collector: Profile;
};

function toFollow(row: {
  readonly follower_id: string;
  readonly followed_id: string;
  readonly created_at: string;
}): Follow {
  return {
    followerId: row.follower_id,
    followedId: row.followed_id,
    createdAt: row.created_at,
  };
}

export async function followCollector(
  client: GeekSupabaseClient,
  collectorId: string,
): Promise<OwnedResult<Follow>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const inserted = await client
    .from("follows")
    .insert({ follower_id: caller.userId, followed_id: collectorId })
    .select(FOLLOW_COLUMNS)
    .single();

  if (inserted.error === null) return mapRows(() => toFollow(inserted.data));
  if (inserted.error.code !== "23505") return databaseFailure(inserted.error);

  const existing = await client
    .from("follows")
    .select(FOLLOW_COLUMNS)
    .eq("follower_id", caller.userId)
    .eq("followed_id", collectorId)
    .single();
  if (existing.error !== null) return databaseFailure(existing.error);
  return mapRows(() => toFollow(existing.data));
}

export async function unfollowCollector(
  client: GeekSupabaseClient,
  collectorId: string,
): Promise<OwnedResult<null>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const { error } = await client
    .from("follows")
    .delete()
    .eq("follower_id", caller.userId)
    .eq("followed_id", collectorId);
  if (error !== null) return databaseFailure(error);
  return { outcome: "ok", data: null };
}

export async function isFollowingCollector(
  client: GeekSupabaseClient,
  collectorId: string,
): Promise<OwnedResult<boolean>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const { data, error } = await client
    .from("follows")
    .select("followed_id")
    .eq("follower_id", caller.userId)
    .eq("followed_id", collectorId)
    .maybeSingle();
  if (error !== null) return databaseFailure(error);
  return { outcome: "ok", data: data !== null };
}

export async function getFollowers(
  client: GeekSupabaseClient,
  collectorId: string,
  request?: PageRequest,
): Promise<OwnedResult<Page<FollowCollector>>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;
  const { limit, offset } = resolvePage(request, FOLLOW_PAGE_BOUNDS);
  const { from, to } = toRange(limit, offset);

  const { data, error } = await client
    .from("follows")
    .select(
      `${FOLLOW_COLUMNS}, collector:profiles!follows_follower_foreign_key (${PROFILE_COLUMNS})`,
    )
    .eq("followed_id", collectorId)
    .order("created_at", { ascending: false })
    .order("follower_id", { ascending: true })
    .range(from, to);
  if (error !== null) return databaseFailure(error);

  return mapRows(() => ({
    items: data.map((row) => ({ follow: toFollow(row), collector: toProfile(row.collector) })),
    limit,
    offset,
  }));
}

export async function getFollowing(
  client: GeekSupabaseClient,
  collectorId: string,
  request?: PageRequest,
): Promise<OwnedResult<Page<FollowCollector>>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;
  const { limit, offset } = resolvePage(request, FOLLOW_PAGE_BOUNDS);
  const { from, to } = toRange(limit, offset);

  const { data, error } = await client
    .from("follows")
    .select(
      `${FOLLOW_COLUMNS}, collector:profiles!follows_followed_foreign_key (${PROFILE_COLUMNS})`,
    )
    .eq("follower_id", collectorId)
    .order("created_at", { ascending: false })
    .order("followed_id", { ascending: true })
    .range(from, to);
  if (error !== null) return databaseFailure(error);

  return mapRows(() => ({
    items: data.map((row) => ({ follow: toFollow(row), collector: toProfile(row.collector) })),
    limit,
    offset,
  }));
}

export async function getFollowCounts(
  client: GeekSupabaseClient,
  collectorId: string,
): Promise<OwnedResult<FollowCounts>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const [followers, following] = await Promise.all([
    client
      .from("follows")
      .select("followed_id", { count: "exact", head: true })
      .eq("followed_id", collectorId),
    client
      .from("follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("follower_id", collectorId),
  ]);
  if (followers.error !== null) return databaseFailure(followers.error);
  if (following.error !== null) return databaseFailure(following.error);
  return {
    outcome: "ok",
    data: { followers: followers.count ?? 0, following: following.count ?? 0 },
  };
}
