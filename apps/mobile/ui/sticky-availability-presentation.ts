import type { CopyAvailability, OwnedCopyCommercialState } from "@geek/domain";

import { formatMoney } from "./format-money";
import { formatAuctionCountdown } from "./auction-countdown";

export type StickyAvailabilityPresentation = {
  readonly label: string;
  readonly value: string;
  readonly action: string;
  readonly signal?: { readonly leading: string; readonly trailing: string };
};

export function getStickyAvailabilityPresentation(
  availability: CopyAvailability,
  commercialState: OwnedCopyCommercialState,
): StickyAvailabilityPresentation {
  if (commercialState.kind === "listing") {
    return {
      label: "Prix",
      value: formatMoney(commercialState.listing.askingPrice),
      action: "Annuler la vente",
    };
  }
  if (commercialState.kind === "auction") {
    const { auction } = commercialState;
    const bidLabel = auction.bidCount === 1 ? "1 enchère" : `${auction.bidCount} enchères`;
    return {
      label: auction.currentPrice ? "Mise actuelle" : "Mise de départ",
      value: formatMoney(auction.currentPrice ?? auction.startingPrice),
      action: "Aux enchères",
      signal: { leading: bidLabel, trailing: formatAuctionCountdown(auction.endsAt) },
    };
  }
  return {
    label: "Status",
    value: AVAILABILITY_LABELS[availability],
    action: commercialState.kind === "accepted_trade" ? "Réservée" : "Rendre disponible",
  };
}

const AVAILABILITY_LABELS: Record<CopyAvailability, string> = {
  private: "Privé",
  open_to_trade: "Ouvert à l’échange",
  for_sale: "En vente",
  in_auction: "Aux enchères",
};
