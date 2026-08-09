/**
 * Small value types shared across Geek's domain models.
 *
 * These exist because PostgreSQL and the generated Supabase types describe both
 * a calendar date and a currency as `string`, which loses the distinction that
 * actually matters in the domain: `2003-05-02` is not a timestamp, and `EUR` is
 * not arbitrary text. Each one is a branded string with a validating
 * constructor, so a value can only carry the type once it has been checked.
 */

/**
 * A date without a time or a zone, as `YYYY-MM-DD`.
 *
 * Release dates and acquisition dates are calendar facts. Widening them to a
 * timestamp would invent a precision the source data does not have and drag
 * timezone conversion into values that have no zone.
 */
export type CalendarDate = string & { readonly brand: "CalendarDate" };

/** An ISO 4217 alphabetic currency code, always uppercase. */
export type CurrencyCode = string & { readonly brand: "CurrencyCode" };

const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

/**
 * Parses a calendar date, returning `null` when the value is not one.
 *
 * The pattern check is not enough on its own: `2003-02-31` matches it but is
 * not a real day. Re-serialising through `Date` rejects those, and rejects the
 * silent rollover that would otherwise turn February 31st into March 3rd.
 */
export function parseCalendarDate(value: string): CalendarDate | null {
  if (!CALENDAR_DATE_PATTERN.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10) === value ? (value as CalendarDate) : null;
}

/** Parses an ISO 4217 code, returning `null` for anything else. */
export function parseCurrencyCode(value: string): CurrencyCode | null {
  return CURRENCY_CODE_PATTERN.test(value) ? (value as CurrencyCode) : null;
}

/**
 * An amount of money, held as an integer number of minor units.
 *
 * Currency is part of the value rather than an ambient assumption, because an
 * amount without one cannot be compared, summed or displayed correctly.
 */
export type Money = {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
};

/**
 * Builds a Money value, returning `null` when the amount is not usable.
 *
 * Minor units must be whole: a fractional amount means someone has multiplied a
 * float somewhere upstream. The safe-integer bound matters because the column
 * behind this is a 64-bit integer, and JSON transport would silently round
 * anything past 2^53.
 */
export function createMoney(amountMinor: number, currency: CurrencyCode): Money | null {
  if (!Number.isSafeInteger(amountMinor)) {
    return null;
  }

  return { amountMinor, currency };
}
