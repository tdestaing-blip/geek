import type { AuctionResult } from "@geek/domain";

export type AuctionResultPresentation = {
  readonly heading: string;
  readonly stateLabel: string;
};

/** Caller-relative resolved copy for the existing commercial footer grammar. */
export function getAuctionResultPresentation(
  outcome: AuctionResult["callerOutcome"],
): AuctionResultPresentation {
  switch (outcome) {
    case "seller_no_sale":
      return { heading: "Auction terminée", stateLabel: "Non vendue" };
    case "seller_won":
      return { heading: "Auction remportée", stateLabel: "Terminée" };
    case "won":
      return { heading: "Vous avez remporté l’enchère", stateLabel: "Remportée" };
    case "lost":
      return { heading: "Enchère terminée", stateLabel: "Non remportée" };
  }
}
