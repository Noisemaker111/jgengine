import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BillCardGlyph } from "@/economy/billCardGlyph";
import type { BillType } from "@/economy/events";

interface InvoiceBillCardProps {
  label: string;
  amountUsd: number;
  billType: BillType;
  canAfford: boolean;
  disabled?: boolean;
  isOverdue?: boolean;
  onPay?: () => void | Promise<void> | Promise<unknown>;
  readOnly?: boolean;
  className?: string;
  children?: ReactNode;
}

function InvoiceBillOverdueStamp() {
  return (
    <div className="invoice-bill-card__overdue-stamp" aria-hidden>
      <span className="invoice-bill-card__overdue-stamp-text">Overdue</span>
    </div>
  );
}

export function InvoiceBillCard({
  label,
  amountUsd,
  billType,
  canAfford,
  disabled = false,
  isOverdue = false,
  onPay,
  readOnly = false,
  className,
  children,
}: InvoiceBillCardProps) {
  const amountLabel = amountUsd.toLocaleString();
  const payBlocked = disabled || !canAfford;

  return (
    <Card
      variant="invoice"
      className={cn(
        "invoice-bill-card w-full",
        isOverdue && "invoice-bill-card--overdue",
        !canAfford && "invoice-bill-card--unaffordable",
        className,
      )}
    >
      {isOverdue ? <InvoiceBillOverdueStamp /> : null}

      <div className="relative z-10 flex items-start justify-between gap-3">
        <h4 className="truncate text-xs font-bold uppercase tracking-wide text-[#2d2416]">{label}</h4>
        <span
          className={cn(
            "invoice-bill-card__amount shrink-0 font-bold tabular-nums",
            canAfford ? "invoice-bill-card__amount--affordable" : "invoice-bill-card__amount--unaffordable",
          )}
        >
          ${amountLabel}
        </span>
      </div>

      <div
        className="invoice-bill-card__glyph pointer-events-none relative z-0 flex items-center justify-center py-2"
        aria-hidden
      >
        <BillCardGlyph billType={billType} className="h-14 w-full max-w-[11rem]" />
      </div>

      {children ? <div className="relative z-10 space-y-0.5">{children}</div> : null}

      {readOnly ? (
        <p className="relative z-10 mt-2 text-center text-[10px] font-semibold uppercase tracking-wide text-[#6b5c4a]">
          Auto-deducts
        </p>
      ) : (
        <Button
          variant={canAfford ? "invoice-pay" : "invoice-pay-unaffordable"}
          onClick={() => void onPay?.()}
          disabled={payBlocked}
          aria-label={canAfford ? `Pay $${amountLabel}` : `Insufficient funds for $${amountLabel}`}
          className={cn("invoice-bill-card__pay relative z-10 mt-2 w-full", disabled && canAfford && "opacity-60")}
        >
          Pay
        </Button>
      )}
    </Card>
  );
}
