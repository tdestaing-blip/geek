import { createAuctionStartingPrice, parseCurrencyCode, type Money } from "@geek/domain";

const EUR = requireCurrencyCode("EUR");

export type AuctionStartingPriceInputResult =
  { readonly valid: true; readonly startingPrice: Money } | { readonly valid: false };

/** Parses decimal euros into non-negative integer cents without float arithmetic. */
export function parseAuctionStartingPriceInput(value: string): AuctionStartingPriceInputResult {
  const match = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(value.trim());
  if (!match) return { valid: false };

  const euros = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(euros)) return { valid: false };

  const startingPrice = createAuctionStartingPrice(euros * 100 + cents, EUR);
  return startingPrice === null ? { valid: false } : { valid: true, startingPrice };
}

function requireCurrencyCode(value: string) {
  const currency = parseCurrencyCode(value);
  if (currency === null) throw new Error(`${value} must be a valid ISO 4217 currency`);
  return currency;
}

export type CreateAuctionSubmissionResult =
  | { readonly outcome: "ignored" }
  | { readonly outcome: "committed" }
  | { readonly outcome: "failed" };

export function createAuctionSubmissionCoordinator(dependencies: {
  readonly create: (startingPrice: Money) => Promise<boolean>;
}) {
  let status: "idle" | "pending" | "committed" = "idle";
  return {
    getStatus: () => status,
    async submit(startingPrice: Money): Promise<CreateAuctionSubmissionResult> {
      if (status !== "idle") return { outcome: "ignored" };
      status = "pending";
      try {
        if (!(await dependencies.create(startingPrice))) {
          status = "idle";
          return { outcome: "failed" };
        }
        status = "committed";
        return { outcome: "committed" };
      } catch {
        status = "idle";
        return { outcome: "failed" };
      }
    },
  };
}
