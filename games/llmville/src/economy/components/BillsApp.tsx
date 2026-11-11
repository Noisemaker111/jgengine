/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMutation, useQuery } from "convex/react";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { api } from "@llmville/backend/convex/_generated/api";
import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { formatMoney } from "../economy";
import type { BillType } from "../events";
import { InvoiceBillCard } from "./InvoiceBillCard";
import { wrapMutation } from "../../runtime/gameEngine";
import { C, FULL, Label, Muted, Stack, useCompact } from "../../ui/kit";

interface BillsAppProps {
  gameId: Id<"games">;
  playerId: string;
  money: number;
  canEditGame: boolean;
}

/** One unpaid invoice as the bills list shows it. */
export interface BillRow {
  id: Id<"bills">;
  description: string;
  totalDue: number;
  type: BillType;
  isOverdue: boolean;
  billingPeriod: string;
  lateFeeAccrued: number;
  gracePeriodDays: number;
}

export function BillsApp({ gameId, playerId, money, canEditGame }: BillsAppProps) {
  const bills = useQuery(api.bills.list, { gameId });
  const payBill = useMutation(api.bills.pay);
  if (bills === undefined) return <Muted size={13}>Loading invoices…</Muted>;
  return <BillsList bills={bills} money={money} canEditGame={canEditGame}
    onPay={(billId) => wrapMutation("payBill", payBill({ gameId, billId, externalId: playerId }))} />;
}

/** The unpaid invoices, two columns on wide tablets. */
export function BillsList({ bills, money, canEditGame, onPay }: { bills: readonly BillRow[]; money: number; canEditGame: boolean; onPay: (billId: BillRow["id"]) => unknown }) {
  const compact = useCompact();
  if (bills.length === 0) return <Muted size={13}>No outstanding bills. The lab is paid up.</Muted>;
  const overdue = bills.filter((bill) => bill.isOverdue).length;
  return <Stack gap={12} width={FULL}>
    <Label>{`${bills.length} UNPAID · ${overdue} OVERDUE · BILLS AUTO-PAY WHEN THE LAB CAN AFFORD THEM`}</Label>
    <RuneView layout="grid" columns={compact ? 1 : 2} gap={12} width={FULL}>
      {bills.map((bill) => <InvoiceBillCard key={bill.id} label={bill.description} amountUsd={bill.totalDue} billType={bill.type} isOverdue={bill.isOverdue}
        canAfford={money >= bill.totalDue} disabled={!canEditGame} onPay={() => void onPay(bill.id)}>
        <Label color={C.paperMuted}>{`${bill.billingPeriod} · ${bill.lateFeeAccrued > 0 ? `late fee $${formatMoney(bill.lateFeeAccrued)}` : `grace ${bill.gracePeriodDays} days`}`.toUpperCase()}</Label>
      </InvoiceBillCard>)}
    </RuneView>
  </Stack>;
}
