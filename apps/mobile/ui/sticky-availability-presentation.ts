import type { CopyAvailability, OwnedCopyCommercialState } from "@geek/domain";

import { formatMoney } from "./format-money";

export type StickyAvailabilityPresentation = {
  readonly label: string;
  readonly value: string;
  readonly action: string;
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
  return {
    label: "Status",
    value: AVAILABILITY_LABELS[availability],
    action:
      commercialState.kind === "auction"
        ? "Aux enchères"
        : commercialState.kind === "accepted_trade"
          ? "Réservée"
          : "Rendre disponible",
  };
}

const AVAILABILITY_LABELS: Record<CopyAvailability, string> = {
  private: "Privé",
  open_to_trade: "Ouvert à l’échange",
  for_sale: "En vente",
  in_auction: "Aux enchères",
};
