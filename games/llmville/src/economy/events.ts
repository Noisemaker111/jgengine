export {
  TWEET_NOTIFICATION_DURATION_MS,
  TWEET_NOTIFICATION_TICK_MS,
} from "@llmville/game/economy/events";

export type { BillType, DisplayBillType } from "@llmville/game/economy/events";

export const BILL_TYPE_LABELS: Record<import("@llmville/game/economy/events").DisplayBillType, string> = {
  electricity: "Electricity",
  water: "Water",
  rent: "Rent",
};