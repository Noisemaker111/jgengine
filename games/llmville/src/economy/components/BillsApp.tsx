import { useMutation, useQuery } from "convex/react";

import { api } from "@llmville/backend/convex/_generated/api";
import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { formatMoney } from "@/economy/economy";
import { InvoiceBillCard } from "@/economy/components/InvoiceBillCard";
import { wrapMutation } from "@/runtime/gameEngine";

interface BillsAppProps {
  gameId: Id<"games">;
  playerId: string;
  money: number;
  canEditGame: boolean;
}

export function BillsApp({ gameId, playerId, money, canEditGame }: BillsAppProps) {
  const bills = useQuery(api.bills.list, { gameId });
  const payBill = useMutation(api.bills.pay);

  if (bills === undefined) {
    return <p className="p-4 text-sm text-brand-cream/70">Loading invoices…</p>;
  }

  if (bills.length === 0) {
    return <p className="p-4 text-sm text-brand-cream/70">No outstanding bills. The lab is paid up.</p>;
  }

  const overdueCount = bills.filter((bill) => bill.isOverdue).length;

  return (
    <div className="space-y-3 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-cream/60">
        {bills.length} unpaid · {overdueCount} overdue · bills auto-pay when the lab can afford them
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {bills.map((bill) => (
          <InvoiceBillCard
            key={bill.id}
            label={bill.description}
            amountUsd={bill.totalDue}
            billType={bill.type}
            isOverdue={bill.isOverdue}
            canAfford={money >= bill.totalDue}
            disabled={!canEditGame}
            onPay={() => wrapMutation("payBill", payBill({ gameId, billId: bill.id, externalId: playerId }))}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6b5c4a]">
              {bill.billingPeriod} · {bill.lateFeeAccrued > 0 ? `late fee $${formatMoney(bill.lateFeeAccrued)}` : `grace ${bill.gracePeriodDays} days`}
            </p>
          </InvoiceBillCard>
        ))}
      </div>
    </div>
  );
}
