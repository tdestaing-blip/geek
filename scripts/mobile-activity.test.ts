import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const activity = source("apps/mobile/navigation/activity-screen.tsx");
const navigationRoot = source("apps/mobile/navigation/navigation-root.tsx");
const types = source("apps/mobile/navigation/types.ts");
const auctionPresence = source("apps/mobile/ui/auction-presence.tsx");
const auctionPresenceProvider = source("apps/mobile/lib/auction/auction-presence-provider.tsx");
const marketplaceData = source("apps/mobile/navigation/marketplace-data.ts");

test("Activity is canonical data with current as its default segment", () => {
  assert.match(activity, /getMyActivity\(supabase, \{ segment \}\)/);
  assert.match(activity, /useState<ActivitySegment>\("current"\)/);
  assert.match(activity, /\{ id: "current", label: "En cours" \}/);
  assert.match(activity, /\{ id: "history", label: "Historique" \}/);
  assert.doesNotMatch(activity, /fixture|mock|activity_events/i);
});

test("Activity preserves canonical object navigation without a detail route", () => {
  assert.match(activity, /rootNavigation\.navigate\("PublicCopy", \{/);
  assert.match(activity, /rootNavigation\.navigate\("Copy", \{/);
  assert.doesNotMatch(types, /ActivityDetail|TradeActivity|Conversation/);
  assert.doesNotMatch(navigationRoot, /name="ActivityDetail"/);
});

test("Activity renders server-projected state, Money, attention, and truthful empties", () => {
  assert.match(activity, /formatMoney\(item\.amount\)/);
  assert.match(activity, /item\.requiresAttention \? styles\.attentionPill/);
  assert.match(activity, /Aucune activité en cours/);
  assert.match(activity, /Aucune activité terminée/);
  assert.match(activity, /appendPage\(current, result\.data\)/);
  assert.doesNotMatch(activity, /\.sort\(/);
});

test("the existing My Auctions overlay remains mounted and bidder-focused", () => {
  assert.match(navigationRoot, /<AuctionPresenceOverlay \/>/);
  assert.match(auctionPresence, /useAuctionPresence/);
  assert.match(auctionPresenceProvider, /loadMyAuctionParticipations/);
  assert.match(marketplaceData, /getMyAuctionParticipations/);
});

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
