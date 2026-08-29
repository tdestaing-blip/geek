import type { Profile } from "../profile/profile";
import type { Money } from "../values";

export const ORDER_STATUSES = ["awaiting_payment"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type Order = {
  readonly id: string;
  readonly buyerId: string;
  readonly sellerId: string;
  readonly status: OrderStatus;
  readonly currency: Money["currency"];
  readonly createdAt: string;
};

export type OrderItem = {
  readonly id: string;
  readonly orderId: string;
  readonly auctionId: string;
  readonly copyId: string;
  readonly winningBidId: string;
  readonly agreedPrice: Money;
  readonly createdAt: string;
};

export type AuctionOrderView = {
  readonly orderId: string;
  readonly auctionId: string;
  readonly copyId: string;
  readonly status: OrderStatus;
  readonly agreedPrice: Money;
  readonly createdAt: string;
  readonly callerRole: "buyer" | "seller";
  readonly counterparty: Pick<Profile, "id" | "displayName" | "avatarPath">;
};

export function parseOrderStatus(value: string): OrderStatus | null {
  return value === "awaiting_payment" ? value : null;
}
