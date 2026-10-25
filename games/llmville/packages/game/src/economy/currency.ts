import type { CurrencyDefinition } from "@jgengine/core/economy/currency";

export const TRANSACTION_TYPE_VALUES = [
  "income_passive",
  "income_serving",
  "income_event",
  "expense_bill",
  "expense_shop",
  "expense_upgrade",
  "expense_license",
  "expense_training",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPE_VALUES)[number];

export const CURRENCY_IDS = ["money", "data"] as const;
export type CurrencyId = (typeof CURRENCY_IDS)[number];

export const CURRENCIES: Record<CurrencyId, CurrencyDefinition<CurrencyId>> = {
  money: { id: "money", name: "Money", symbol: "$", decimals: 2 },
  data: { id: "data", name: "Data", unit: "tokens" },
};
