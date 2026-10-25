export const BILL_TYPE_VALUES = ["electricity", "water", "rent"] as const;
export const BILL_CATEGORY_VALUES = ["daily", "monthly"] as const;
export type BillType = (typeof BILL_TYPE_VALUES)[number];
export type BillCategory = (typeof BILL_CATEGORY_VALUES)[number];

export const TWEET_NOTIFICATION_DURATION_MS = 5_000;
export const TWEET_NOTIFICATION_TICK_MS = 50;

export type DisplayBillType = BillType;

export interface BillData {
  id: string;
  type: DisplayBillType;
  category: BillCategory;
  description: string;
  amount: number;
  dueAt: number;
  gracePeriodDays: number;
  aprRate: number;
  lateFeeAccrued: number;
  isOverdue: boolean;
  billingPeriod: string;
  createdAt: number;
  totalDue: number;
}

export interface BillPaymentItem {
  id: string;
  totalDue: number;
}

export interface PrioritizedBill extends BillPaymentItem {
  isOverdue: boolean;
  dueAt: number;
}

export function sortBillsByPriority<T extends PrioritizedBill>(bills: readonly T[]): T[] {
  return [...bills].sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    return a.dueAt - b.dueAt;
  });
}