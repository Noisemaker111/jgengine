import { cn } from "@/components/ui/cn";
import type { PlaceableBuildItemId } from "@llmville/game/build/catalog";
import { getWorldModelAsset } from "@llmville/game/world/worldModelCatalog";
import { InventoryTrayCard } from "@/store/components/StoreListRow";

interface DecorShopCardProps {
  itemId: PlaceableBuildItemId;
  label: string;
  description: string;
  price: number;
  quantity: number;
  owned: number;
  affordable: boolean;
  researched?: boolean;
  researchTokenCost?: number;
  pending: boolean;
  researchPending?: boolean;
  onQtyChange: (next: number) => void;
  onBuy: () => void;
  onUnlockResearch?: () => void;
}

function decorThumbClass(itemId: PlaceableBuildItemId): string {
  if (itemId.includes("plant") || itemId.includes("tree") || itemId === "cable_tidy_bin") {
    return "decor-shop-card__thumb--plant";
  }
  if (itemId.includes("chair") || itemId.includes("beanbag") || itemId.includes("rug") || itemId.includes("yoga") || itemId === "server_plushie") {
    return "decor-shop-card__thumb--seating";
  }
  if (itemId.includes("coffee") || itemId.includes("fridge") || itemId.includes("drink") || itemId.includes("table")) {
    return "decor-shop-card__thumb--utility";
  }
  if (itemId.includes("board") || itemId.includes("shelf") || itemId.includes("monitor")) {
    return "decor-shop-card__thumb--workspace";
  }
  if (itemId.includes("neon") || itemId.includes("banner") || itemId.includes("clock")) {
    return "decor-shop-card__thumb--neon";
  }
  return "decor-shop-card__thumb--display";
}

export function DecorShopCard({
  itemId,
  label,
  description,
  price,
  quantity,
  owned,
  affordable,
  researched = true,
  researchTokenCost = 0,
  pending,
  researchPending = false,
  onQtyChange,
  onBuy,
  onUnlockResearch,
}: DecorShopCardProps) {
  const dec = () => onQtyChange(Math.max(1, quantity - 1));
  const inc = () => onQtyChange(Math.min(99, quantity + 1));
  const disabled = !affordable || pending || researchPending;
  const hasModel = getWorldModelAsset(itemId)?.modelPath != null;

  return (
    <InventoryTrayCard
      interactive={affordable}
      className={cn("decor-shop-card", !affordable && owned === 0 && "opacity-45 grayscale")}
    >
      <div className="decor-shop-card__layout">
        <div
          className={cn("decor-shop-card__thumb", decorThumbClass(itemId), hasModel && "decor-shop-card__thumb--modeled")}
          aria-hidden
        />

        <div className="decor-shop-card__body">
          <div className="decor-shop-card__header">
            <h3 className="decor-shop-card__title">{label}</h3>
            <div className="decor-shop-card__price-block">
              {researched ? (
                <>
                  <span className="decor-shop-card__price">${price.toLocaleString()}</span>
                  <span className="decor-shop-card__stock">IN STOCK</span>
                </>
              ) : (
                <>
                  <span className="decor-shop-card__price">{researchTokenCost.toLocaleString()} tokens</span>
                  <span className="decor-shop-card__stock">RESEARCH</span>
                </>
              )}
            </div>
          </div>
          <p className="decor-shop-card__description">{description}</p>
          {owned > 0 && (
            <span className="decor-shop-card__owned">Owned ×{owned}</span>
          )}
        </div>

        <div className="decor-shop-card__controls">
          {researched ? (
            <>
              <div className="decor-shop-card__qty">
                <button
                  type="button"
                  onClick={dec}
                  disabled={disabled || quantity <= 1}
                  className="decor-shop-card__qty-btn"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="decor-shop-card__qty-value">{quantity}</span>
                <button
                  type="button"
                  onClick={inc}
                  disabled={disabled}
                  className="decor-shop-card__qty-btn"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={onBuy}
                disabled={disabled}
                className="decor-shop-card__buy"
              >
                {pending ? "…" : `Buy ×${quantity}`}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onUnlockResearch}
              disabled={!affordable || researchPending}
              className="decor-shop-card__buy"
            >
              {researchPending ? "…" : `Research — ${researchTokenCost.toLocaleString()} tokens`}
            </button>
          )}
        </div>
      </div>
    </InventoryTrayCard>
  );
}
