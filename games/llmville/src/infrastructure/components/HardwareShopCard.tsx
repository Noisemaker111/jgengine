import { cn } from "@/components/ui/cn";
import { GpuModelPreview } from "@/scene/components/GpuModelPreview";
import { getHardwareDefinition } from "@llmville/game/infrastructure/catalog";
import type { HardwareModelId } from "@llmville/game/infrastructure/catalog";
import { InventoryTrayCard } from "@/store/components/StoreListRow";

interface HardwareShopCardProps {
  hardwareModelId: HardwareModelId;
  label: string;
  cost: number;
  quantity: number;
  maxQuantity?: number;
  interactive: boolean;
  researched: boolean;
  researchTokenCost?: number;
  dataTokens: number;
  pending: boolean;
  researchPending?: boolean;
  recentPurchase?: { quantity: number } | null;
  onQtyChange: (next: number) => void;
  onBuy: () => void;
  onUnlockResearch?: () => void;
}

function HardwareStatPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "speed";
}) {
  return (
    <div className="hardware-shop-card__pill">
      <span
        className={cn(
          "hardware-shop-card__pill-value",
          accent === "speed" && "hardware-shop-card__pill-value--speed",
        )}
      >
        {value}
      </span>
      <span className="hardware-shop-card__pill-label">{label}</span>
    </div>
  );
}

export function HardwareShopCard({
  hardwareModelId,
  label,
  cost,
  quantity,
  maxQuantity = 99,
  interactive,
  researched,
  researchTokenCost = 0,
  dataTokens,
  pending,
  researchPending = false,
  recentPurchase,
  onQtyChange,
  onBuy,
  onUnlockResearch,
}: HardwareShopCardProps) {
  const hw = getHardwareDefinition(hardwareModelId);
  const dec = () => onQtyChange(Math.max(1, quantity - 1));
  const inc = () => onQtyChange(Math.min(maxQuantity, quantity + 1));
  const canAffordResearch = dataTokens >= researchTokenCost;
  const disabled = !interactive || pending || researchPending;

  return (
    <InventoryTrayCard
      interactive={interactive || !researched}
      className={cn(
        "hardware-shop-card",
        !interactive && researched && "opacity-45 grayscale",
      )}
    >
      <div className="hardware-shop-card__layout">
        <div className="hardware-shop-card__thumb" aria-hidden>
          <GpuModelPreview hardwareModelId={hardwareModelId} className="h-full w-full" />
        </div>

        <div className="hardware-shop-card__body">
          <div className="hardware-shop-card__header">
            <h3 className="hardware-shop-card__title">{label}</h3>
            <div className="hardware-shop-card__price-block">
              {researched ? (
                <>
                  <span className="hardware-shop-card__price">${cost.toLocaleString()}</span>
                  <span className="hardware-shop-card__stock">IN STOCK</span>
                </>
              ) : (
                <>
                  <span className="hardware-shop-card__price">{researchTokenCost.toLocaleString()} tokens</span>
                  <span className="hardware-shop-card__stock">RESEARCH</span>
                </>
              )}
            </div>
          </div>

          <div className="hardware-shop-card__pills">
            <HardwareStatPill label="SPEED" value={`${hw.trainingPowerFp16} TF`} accent="speed" />
            <HardwareStatPill label="MEMORY" value={`${hw.vramGb} GB`} />
            <HardwareStatPill label="POWER" value={`${hw.tdpWatts}W`} />
          </div>
        </div>

        <div className="hardware-shop-card__controls">
          {recentPurchase && (
            <span className="hardware-shop-card__bought">Bought ×{recentPurchase.quantity}</span>
          )}

          {researched ? (
            <>
              <div className="hardware-shop-card__qty">
                <button
                  type="button"
                  onClick={dec}
                  disabled={disabled || quantity <= 1}
                  className="hardware-shop-card__qty-btn"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="hardware-shop-card__qty-value">{quantity}</span>
                <button
                  type="button"
                  onClick={inc}
                  disabled={disabled}
                  className="hardware-shop-card__qty-btn"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={onBuy}
                disabled={disabled}
                className="hardware-shop-card__buy"
              >
                {pending ? "…" : `Buy ×${quantity}`}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onUnlockResearch}
              disabled={!canAffordResearch || researchPending}
              className="hardware-shop-card__buy"
            >
              {researchPending ? "…" : `Research — ${researchTokenCost.toLocaleString()} tokens`}
            </button>
          )}
        </div>
      </div>
    </InventoryTrayCard>
  );
}
