import { createListingAskingPrice, parseCurrencyCode, type Money } from "@geek/domain";

const EUR = requireCurrencyCode("EUR");

export type ListingPriceInputResult =
  { readonly valid: true; readonly askingPrice: Money } | { readonly valid: false };

/** Parses decimal euros into positive integer cents without float arithmetic. */
export function parseListingPriceInput(value: string): ListingPriceInputResult {
  const match = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(value.trim());
  if (!match) return { valid: false };

  const euros = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(euros)) return { valid: false };

  const askingPrice = createListingAskingPrice(euros * 100 + cents, EUR);
  return askingPrice === null ? { valid: false } : { valid: true, askingPrice };
}

function requireCurrencyCode(value: string) {
  const currency = parseCurrencyCode(value);
  if (currency === null) throw new Error(`${value} must be a valid ISO 4217 currency`);
  return currency;
}

export type CreateListingSubmissionResult =
  | { readonly outcome: "ignored" }
  | { readonly outcome: "committed" }
  | { readonly outcome: "failed" };

export function createListingSubmissionCoordinator(dependencies: {
  readonly create: (askingPrice: Money) => Promise<boolean>;
}) {
  let status: "idle" | "pending" | "committed" = "idle";
  return {
    getStatus: () => status,
    async submit(askingPrice: Money): Promise<CreateListingSubmissionResult> {
      if (status !== "idle") return { outcome: "ignored" };
      status = "pending";
      try {
        if (!(await dependencies.create(askingPrice))) {
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
