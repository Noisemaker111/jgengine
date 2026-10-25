import { useState } from "react";
import { cn } from "@/components/ui/cn";

import {
  BUILD_CATALOG,
  type PlaceableBuildItemId,
} from "@llmville/game/build/catalog";
import type { BuildTabId } from "@llmville/game/build/catalog";
import { canAffordShopPurchase } from "@llmville/game/economy/storeTransition";
import { getRackCatalogDefinition, STARTER_RACK_CATALOG_ID } from "@llmville/game/infrastructure/catalog";
import type { ShopCatalogItem } from "@/store/store";
import { QuantityBuyControl, InventoryTrayCard, StorePriceButton } from "@/store/components/StoreListRow";
import { DecorShopCard } from "@/build/components/DecorShopCard";
import { TutorialArrow } from "@/tutorial/components/TutorialUi";
import { getResearchTokenCost, isResearchUnlocked, type ResearchUnlocks } from "@llmville/game/research/researchUnlocks";

interface BuildCatalogProps {
  money: number;
  dataTokens: number;
  researchUnlocks?: ResearchUnlocks;
  shopItems: readonly ShopCatalogItem[];
  onBuy: (itemId: string, quantity?: number) => Promise<boolean>;
  onUnlockResearch: (itemId: string) => Promise<unknown>;
  ownedQuantities: Record<string, number>;
  tutorialBench?: { visible: boolean; placed: boolean };
  showItems?: boolean;
  filterTab: BuildTabId;
}

function rackFeatureBullets(itemId: string): string[] {
  const rack = getRackCatalogDefinition(itemId);
  return [`${rack.slotCapacity} GPU slots`, `${rack.allowedCoolantTypes.join(" / ")} cooling`];
}

function shopRowForItem(shopItems: readonly ShopCatalogItem[], itemId: string): ShopCatalogItem | undefined {
  return shopItems.find((row) => row.id === itemId);
}

export function BuildCatalog({
  money,
  dataTokens,
  researchUnlocks,
  shopItems,
  onBuy,
  onUnlockResearch,
  ownedQuantities,
  tutorialBench,
  showItems = true,
  filterTab,
}: BuildCatalogProps) {
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [pendingResearchId, setPendingResearchId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const items = BUILD_CATALOG.filter((item) => item.tab === filterTab);

  if (!showItems) {
    return (
      <div className="py-8 text-center text-[11px] uppercase tracking-wider text-white/30">
        Unlock more space to place these.
      </div>
    );
  }

  const getQty = (id: string) => Math.max(1, quantities[id] ?? 1);
  const setQty = (id: string, q: number) => setQuantities((prev) => ({ ...prev, [id]: Math.max(1, q) }));

  const handleBuy = async (itemId: string) => {
    const qty = getQty(itemId);
    setPendingItemId(itemId);
    try {
      await onBuy(itemId, qty);
    } finally {
      setPendingItemId((current) => (current === itemId ? null : current));
    }
  };

  if (filterTab === "decor") {
    return (
      <div className="space-y-3">
        {items.map((item) => {
          const owned = ownedQuantities[item.id] ?? 0;
          const quantity = getQty(item.id);
          const tokenCost = getResearchTokenCost(item.id) ?? 0;
          const shopRow = shopRowForItem(shopItems, item.id);
          const researched = shopRow?.unlocked ?? isResearchUnlocked(researchUnlocks, item.id);
          const affordable = canAffordShopPurchase({ researched, cost: item.price * quantity, researchTokenCost: tokenCost, money, dataTokens });
          return (
            <DecorShopCard
              key={item.id}
              itemId={item.id as PlaceableBuildItemId}
              label={item.label}
              description={item.description}
              price={item.price}
              quantity={quantity}
              owned={owned}
              affordable={affordable}
              researched={researched}
              researchTokenCost={tokenCost}
              pending={pendingItemId === item.id}
              researchPending={pendingResearchId === item.id}
              onQtyChange={(q) => setQty(item.id, q)}
              onBuy={() => void handleBuy(item.id)}
              onUnlockResearch={() => {
                setPendingResearchId(item.id);
                void onUnlockResearch(item.id).finally(() => {
                  setPendingResearchId((current) => (current === item.id ? null : current));
                });
              }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const owned = ownedQuantities[item.id] ?? 0;
        const shopRow = shopRowForItem(shopItems, item.id);
        const researched = shopRow?.unlocked ?? isResearchUnlocked(researchUnlocks, item.id);
        const tokenCost = shopRow?.researchTokenCost ?? getResearchTokenCost(item.id) ?? 0;
        const qty = getQty(item.id);
        const affordable = canAffordShopPurchase({ researched, cost: item.price * qty, researchTokenCost: tokenCost, money, dataTokens });
        const isPending = pendingItemId === item.id;
        const showBenchArrow =
          tutorialBench?.visible === true &&
          tutorialBench.placed === false &&
          item.id === STARTER_RACK_CATALOG_ID;
        const rackFeatures = rackFeatureBullets(item.id);

        return (
          <InventoryTrayCard
            key={item.id}
            className={cn(
              "p-2.5",
              showBenchArrow && "!overflow-visible",
              !affordable && owned === 0 ? "opacity-40 grayscale" : undefined,
            )}
          >
            <div className="flex gap-3">
              <div className="w-14 h-14 shrink-0 rounded border border-white/20 bg-[#3a3a3a] flex flex-col justify-center gap-[2px] p-1.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-[3px] bg-[#222] mx-[2px]" />
                ))}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between">
                  <div className="font-bold text-sm text-brand-cream">{item.label}</div>
                  <div className="text-emerald-400 font-mono text-sm font-bold tabular-nums">
                    {researched ? `$${item.price.toLocaleString()}` : `${tokenCost.toLocaleString()} tokens`}
                  </div>
                </div>

                <div className="mt-1 text-[11px] text-brand-cream/70 leading-tight">
                  {rackFeatures.map((feature) => (
                    <div key={feature}>– {feature}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-end">
              <div className="relative">
                {showBenchArrow && <TutorialArrow className="!-top-6 scale-75" />}
                {researched ? (
                  <QuantityBuyControl
                    quantity={qty}
                    onQtyChange={(q) => setQty(item.id, q)}
                    onBuy={() => void handleBuy(item.id)}
                    disabled={!affordable || isPending}
                    className={showBenchArrow ? "rounded ring-2 ring-brand-teal/70" : undefined}
                  />
                ) : (
                  <StorePriceButton
                    price={tokenCost}
                    affordable={affordable}
                    pending={pendingResearchId === item.id}
                    label={`Research — ${tokenCost.toLocaleString()} tokens`}
                    onClick={() => {
                      setPendingResearchId(item.id);
                      void onUnlockResearch(item.id).finally(() => {
                        setPendingResearchId((current) => (current === item.id ? null : current));
                      });
                    }}
                  />
                )}
              </div>
            </div>
          </InventoryTrayCard>
        );
      })}
    </div>
  );
}
