import type { PlaceAuctionBidResult } from "@geek/data";
import { createMoney, parseCurrencyCode, type Money } from "@geek/domain";

const EUR = requireCurrencyCode("EUR");

export type BidAmountInputResult =
  { readonly valid: true; readonly amount: Money } | { readonly valid: false };

/** Parses decimal euros into integer cents without using float money. */
export function parseBidAmountInput(value: string): BidAmountInputResult {
  const match = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(value.trim());
  if (!match) return { valid: false };
  const euros = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(euros)) return { valid: false };
  const amount = createMoney(euros * 100 + cents, EUR);
  return amount === null || amount.amountMinor < 0 ? { valid: false } : { valid: true, amount };
}

export function formatBidAmountInput(amountMinor: number): string {
  const euros = Math.floor(amountMinor / 100);
  const cents = String(amountMinor % 100).padStart(2, "0");
  return `${euros},${cents}`;
}

export type StableBidAttempt = {
  readonly bidId: string;
  readonly amountMinor: number;
};

/** Reuses an identity only while retrying the exact same explicit amount. */
export function resolveStableBidAttempt(
  previous: StableBidAttempt | null,
  amountMinor: number,
  createId: () => string,
): StableBidAttempt {
  return previous?.amountMinor === amountMinor ? previous : { bidId: createId(), amountMinor };
}

export type PlaceBidSubmissionResult =
  | { readonly outcome: "ignored" }
  | { readonly outcome: "result"; readonly result: PlaceAuctionBidResult };

/** Owns request identity and synchronous duplicate-confirm suppression. */
export function createPlaceBidSubmissionCoordinator(dependencies: {
  readonly createId: () => string;
  readonly place: (attempt: StableBidAttempt, amount: Money) => Promise<PlaceAuctionBidResult>;
}) {
  let pending = false;
  let committed = false;
  let attempt: StableBidAttempt | null = null;
  return {
    getAttempt: () => attempt,
    async submit(amount: Money): Promise<PlaceBidSubmissionResult> {
      if (pending || committed) return { outcome: "ignored" };
      attempt = resolveStableBidAttempt(attempt, amount.amountMinor, dependencies.createId);
      pending = true;
      try {
        const result = await dependencies.place(attempt, amount);
        if (result.outcome === "ok") committed = true;
        if (result.outcome === "bid_too_low") attempt = null;
        return { outcome: "result", result };
      } finally {
        pending = false;
      }
    },
  };
}

function requireCurrencyCode(value: string) {
  const currency = parseCurrencyCode(value);
  if (currency === null) throw new Error(`${value} must be a valid ISO 4217 currency`);
  return currency;
}
