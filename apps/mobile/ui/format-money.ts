import type { Money } from "@geek/domain";

/** Formats canonical integer minor units for Geek's French mobile presentation. */
export function formatMoney(money: Money): string {
  const currencyFormatter = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: money.currency,
  });
  const fractionDigits = currencyFormatter.resolvedOptions().maximumFractionDigits ?? 2;
  const absoluteDigits = Math.abs(money.amountMinor)
    .toString()
    .padStart(fractionDigits + 1, "0");
  const wholeEnd = fractionDigits === 0 ? absoluteDigits.length : -fractionDigits;
  const whole = absoluteDigits.slice(0, wholeEnd);
  const fraction = fractionDigits === 0 ? "" : absoluteDigits.slice(-fractionDigits);
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
  const currency = currencyFormatter.format(0).replace(/[\d\s.,+-]/g, "") || money.currency;
  const fractionText = fraction.length === 0 || /^0+$/.test(fraction) ? "" : `,${fraction}`;
  return `${money.amountMinor < 0 ? "-" : ""}${groupedWhole}${fractionText}\u00a0${currency}`;
}
