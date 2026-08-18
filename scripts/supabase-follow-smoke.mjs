import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { register } from "node:module";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

register("./typescript-resolver.mjs", import.meta.url);

const {
  followCollector,
  getFollowCounts,
  getFollowers,
  getFollowing,
  isFollowingCollector,
  unfollowCollector,
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
const clients = [
  createClient(status.API_URL, status.ANON_KEY, options),
  createClient(status.API_URL, status.ANON_KEY, options),
  createClient(status.API_URL, status.ANON_KEY, options),
];
const runId = randomUUID().slice(0, 8);
const password = `Follow-${randomUUID()}`;
const results = [];

function record(name, passed, detail) {
  results.push({ name, passed });
  process.stdout.write(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
}

const users = [];
for (const [index, client] of clients.entries()) {
  const auth = await client.auth.signUp({
    email: `follow-${index}-${runId}@example.com`,
    password,
  });
  users.push(auth.data.user.id);
  await client
    .from("profiles")
    .update({ username: `follow_${index}_${runId}`, display_name: `Collector ${index}` })
    .eq("id", auth.data.user.id);
}
const [collectorA, collectorB, collectorC] = users;
const [clientA, clientB] = clients;

try {
  const followed = await followCollector(clientA, collectorB);
  record(
    "A follows B using authenticated follower identity",
    followed.outcome === "ok" &&
      followed.data.followerId === collectorA &&
      followed.data.followedId === collectorB,
  );

  const followingState = await isFollowingCollector(clientA, collectorB);
  record(
    "isFollowingCollector reports the edge",
    followingState.outcome === "ok" && followingState.data,
  );

  const selfFollow = await followCollector(clientA, collectorA);
  record(
    "self-follow is database-rejected",
    selfFollow.outcome === "failed" && selfFollow.failure.code === "23514",
  );

  const duplicate = await clientA
    .from("follows")
    .insert({ follower_id: collectorA, followed_id: collectorB });
  const idempotent = await followCollector(clientA, collectorB);
  record(
    "duplicate edge is unique while followCollector is idempotent",
    duplicate.error?.code === "23505" && idempotent.outcome === "ok",
  );

  const reciprocal = await followCollector(clientB, collectorA);
  record("reciprocal B to A follow is allowed", reciprocal.outcome === "ok");

  const bFollowsC = await followCollector(clientB, collectorC);
  const foreignDelete = await clientA
    .from("follows")
    .delete()
    .eq("follower_id", collectorB)
    .eq("followed_id", collectorC)
    .select("follower_id");
  const bStillFollowsC = await isFollowingCollector(clientB, collectorC);
  record(
    "A cannot delete B's outgoing edge",
    bFollowsC.outcome === "ok" &&
      foreignDelete.error === null &&
      foreignDelete.data.length === 0 &&
      bStillFollowsC.outcome === "ok" &&
      bStillFollowsC.data,
  );

  const spoof = await clientA
    .from("follows")
    .insert({ follower_id: collectorB, followed_id: collectorC });
  record("owner spoofing is rejected", spoof.error?.code === "42501", spoof.error?.code);

  const anonymousFollow = await followCollector(anonymous, collectorB);
  const anonymousUnfollow = await unfollowCollector(anonymous, collectorB);
  record(
    "anonymous follow and unfollow are rejected",
    anonymousFollow.outcome === "unauthenticated" &&
      anonymousUnfollow.outcome === "unauthenticated",
  );

  const followers = await getFollowers(clientA, collectorA, { limit: 10 });
  const following = await getFollowing(clientA, collectorB, { limit: 10 });
  record(
    "bounded follower and following reads return safe Profile summaries",
    followers.outcome === "ok" &&
      followers.data.items.some((entry) => entry.collector.id === collectorB) &&
      following.outcome === "ok" &&
      following.data.items.some((entry) => entry.collector.id === collectorA) &&
      Object.keys(followers.data.items[0].collector).sort().join(",") ===
        "avatarPath,bio,displayName,id,username",
  );

  const counts = await getFollowCounts(clientA, collectorB);
  record(
    "followers and following counts are calculated correctly",
    counts.outcome === "ok" && counts.data.followers === 1 && counts.data.following === 2,
  );

  await unfollowCollector(clientA, collectorB);
  const secondUnfollow = await unfollowCollector(clientA, collectorB);
  const noLongerFollowing = await isFollowingCollector(clientA, collectorB);
  record(
    "unfollow is idempotent and removes only the caller's edge",
    secondUnfollow.outcome === "ok" &&
      noLongerFollowing.outcome === "ok" &&
      !noLongerFollowing.data,
  );

  const concurrent = await Promise.all([
    followCollector(clientA, collectorB),
    followCollector(clientA, collectorB),
  ]);
  const stored = await admin
    .from("follows")
    .select("follower_id", { count: "exact" })
    .eq("follower_id", collectorA)
    .eq("followed_id", collectorB);
  record(
    "concurrent idempotent follows store one edge",
    concurrent.every((result) => result.outcome === "ok") && stored.count === 1,
  );

  const anonymousRead = await anonymous.from("follows").select("follower_id");
  record(
    "anonymous graph reads are denied",
    anonymousRead.error?.code === "42501",
    anonymousRead.error?.code,
  );
} finally {
  for (const userId of users) await admin.auth.admin.deleteUser(userId);
}

const failed = results.filter((result) => !result.passed);
process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
process.exitCode = failed.length === 0 ? 0 : 1;
