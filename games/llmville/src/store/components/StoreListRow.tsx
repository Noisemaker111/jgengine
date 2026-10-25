import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { CARD_VARIANT, Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";

interface StorePriceButtonProps {
  price: number;
  affordable: boolean;
  pending?: boolean;
  label?: string;
  onClick: () => void;
  className?: string;
}

export function StorePriceButton({
  price,
  affordable,
  pending = false,
  label,
  onClick,
  className = "",
}: StorePriceButtonProps) {
  return (
    <Button
      variant={affordable && !pending ? "primary" : "default"}
      onClick={onClick}
      disabled={!affordable || pending}
      className={cn("game-btn--compact min-w-[78px] text-[10px]", !affordable && "cursor-not-allowed opacity-40", className)}
    >
      {pending ? "…" : label ?? `$${price.toLocaleString()}`}
    </Button>
  );
}

/** Hardware inventory tray card */
export function InventoryTrayCard({
  children,
  className,
  interactive,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <Card
      variant="inventory-tray"
      className={cn(
        "transition-all duration-300",
        interactive && "hover:border-brand-teal/40",
        className,
      )}
    >
      {children}
    </Card>
  );
}

/** Operator upgrade blueprint card */
export function BlueprintCard({
  children,
  className,
  owned,
}: {
  children: ReactNode;
  className?: string;
  owned?: boolean;
}) {
  return (
    <Card
      variant={CARD_VARIANT.blueprint}
      decoration="fold"
      className={cn(owned && "border-brand-teal/50 bg-brand-teal/5", className)}
    >
      {children}
    </Card>
  );
}

/** Matches reference buy controls: red - circle, green "Buy x N" pill, green + circle */
interface QuantityBuyControlProps {
  quantity: number;
  maxQuantity?: number;
  onQtyChange: (next: number) => void;
  onBuy: () => void;
  disabled?: boolean;
  className?: string;
}

export function QuantityBuyControl({
  quantity,
  maxQuantity = 99,
  onQtyChange,
  onBuy,
  disabled = false,
  className,
}: QuantityBuyControlProps) {
  const dec = () => onQtyChange(Math.max(1, quantity - 1));
  const inc = () => onQtyChange(Math.min(maxQuantity, quantity + 1));

  return (
    <div className={cn("flex items-center gap-1 select-none", className)}>
      <button
        type="button"
        onClick={dec}
        disabled={disabled || quantity <= 1}
        className="w-6 h-6 rounded-full bg-red-500/90 hover:bg-red-600 text-white text-sm font-bold flex items-center justify-center disabled:opacity-40 active:scale-95"
        aria-label="Decrease quantity"
      >
        −
      </button>
      <button
        type="button"
        onClick={onBuy}
        disabled={disabled}
        className="px-3 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold tracking-wider active:scale-[0.985] disabled:opacity-40"
      >
        Buy ×{quantity}
      </button>
      <button
        type="button"
        onClick={inc}
        disabled={disabled}
        className="w-6 h-6 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold flex items-center justify-center disabled:opacity-40 active:scale-95"
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}
