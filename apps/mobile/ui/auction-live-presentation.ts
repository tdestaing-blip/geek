import type { AuctionCallerBidState } from "@geek/domain";

export type AuctionLiveBidderPresentation = {
  readonly actionLabel: "Enchérir" | "Surenchérir";
  readonly pillLabel: "Dépassée" | "Meilleure" | null;
};

export function getAuctionLiveBidderPresentation(
  callerBidState: AuctionCallerBidState | null,
): AuctionLiveBidderPresentation {
  switch (callerBidState) {
    case "leading":
      return { actionLabel: "Enchérir", pillLabel: "Meilleure" };
    case "outbid":
      return { actionLabel: "Surenchérir", pillLabel: "Dépassée" };
    case "none":
    case null:
      return { actionLabel: "Enchérir", pillLabel: null };
  }
}
