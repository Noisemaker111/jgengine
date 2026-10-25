import { useCallback, useState } from "react";

import { parseHardwareModelId } from "@llmville/game/infrastructure/catalog";
import type { HardwareModelId } from "@llmville/game/infrastructure/catalog";
import { canAffordShopPurchase } from "@llmville/game/economy/storeTransition";
import type { PersonalUpgradeItem, ShopCatalogItem } from "@/store/store";
import type { PersonalUpgradeId } from "@llmville/game/user/personalUpgrades";

import { TABLET_STORE_TAB_ID } from "@/tablet/tablet";
import { BlueprintCard } from "@/store/components/StoreListRow";
import { HardwareShopCard } from "@/infrastructure/components/HardwareShopCard";

type ShopItemId = string;

interface HardwareCatalogProps {
  money: number;
  dataTokens: number;
  items: readonly ShopCatalogItem[];
  onBuy: (itemId: ShopItemId, quantity?: number) => Promise<boolean>;
  onUnlockResearch: (itemId: string) => Promise<unknown>;
  ownedQuantities: Record<string, number>;
  personalUpgrades: readonly PersonalUpgradeItem[];
  onBuyPersonalUpgrade: (upgradeId: PersonalUpgradeId) => void;
  initialCategory?: typeof TABLET_STORE_TAB_ID.hardware | typeof TABLET_STORE_TAB_ID.operator;
  forceSingleQuantity?: boolean;
}

interface RecentPurchase {
  amount: number;
  quantity: number;
  token: number;
}

type HardwareShopItem = ShopCatalogItem & { hardwareModelId: HardwareModelId };

export function HardwareCatalog({
  money,
  dataTokens,
  items,
  onBuy,
  onUnlockResearch,
  ownedQuantities: _ownedQuantities,
  personalUpgrades,
  onBuyPersonalUpgrade,
  initialCategory,
  forceSingleQuantity = false,
}: HardwareCatalogProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [recentPurchases, setRecentPurchases] = useState<Record<string, RecentPurchase>>({});
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [pendingResearchId, setPendingResearchId] = useState<string | null>(null);
  const hardwareItems: HardwareShopItem[] = items
    .filter((item) => item.kind === "hardware" || item.kind === "gpu" || item.kind === "rental")
    .map((item) => {
      const hardwareModelId = parseHardwareModelId(item.id);
      return hardwareModelId === null ? null : { ...item, hardwareModelId };
    })
    .filter((item): item is HardwareShopItem => item !== null);

  const getQty = (id: string) => Math.max(1, quantities[id] ?? 1);
  const setQty = (id: string, qty: number) => setQuantities((prev) => ({ ...prev, [id]: Math.max(1, qty) }));
  const registerPurchase = useCallback((itemId: string, amount: number, quantity: number) => {
    const token = Date.now();
    setRecentPurchases((prev) => ({ ...prev, [itemId]: { amount, quantity, token } }));
    window.setTimeout(() => {
      setRecentPurchases((prev) => (prev[itemId]?.token === token
        ? Object.fromEntries(Object.entries(prev).filter(([id]) => id !== itemId))
        : prev));
    }, 1600);
  }, []);

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {(initialCategory === TABLET_STORE_TAB_ID.hardware || !initialCategory) && (
        <div className="grid grid-cols-1 gap-3">
          {hardwareItems.map((item) => {
            const researched = item.unlocked !== false;
            const quantity = forceSingleQuantity ? 1 : getQty(item.id);
            const totalCost = item.cost * quantity;
            const canInteract =
              researched &&
              canAffordShopPurchase({
                researched,
                cost: totalCost,
                researchTokenCost: item.researchTokenCost ?? 0,
                money,
                dataTokens,
              });
            const recentPurchase = recentPurchases[item.id];

            return (
              <HardwareShopCard
                key={item.id}
                hardwareModelId={item.hardwareModelId}
                label={item.label}
                cost={item.cost}
                quantity={quantity}
                interactive={canInteract}
                researched={researched}
                researchTokenCost={item.researchTokenCost ?? 0}
                dataTokens={dataTokens}
                pending={pendingItemId === item.id}
                researchPending={pendingResearchId === item.id}
                recentPurchase={recentPurchase}
                onQtyChange={(q) => setQty(item.id, q)}
                onBuy={() => {
                  void (async () => {
                    const selectedQuantity = forceSingleQuantity ? 1 : getQty(item.id);
                    setPendingItemId(item.id);
                    try {
                      const purchased = await onBuy(item.id, selectedQuantity);
                      if (purchased) {
                        registerPurchase(item.id, item.cost * selectedQuantity, selectedQuantity);
                      }
                    } finally {
                      setPendingItemId((current) => (current === item.id ? null : current));
                    }
                  })();
                }}
                onUnlockResearch={() => {
                  setPendingResearchId(item.id);
                  void onUnlockResearch(item.id).finally(() => {
                    setPendingResearchId((current) => (current === item.id ? null : current));
                  });
                }}
              />
            );
          })}

          {hardwareItems.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-6 text-center">
              <p className="text-[10px] font-game tracking-[0.2em] text-white/50 uppercase">No hardware listings available.</p>
            </div>
          )}
        </div>
      )}

      {(initialCategory === TABLET_STORE_TAB_ID.operator || !initialCategory) && (
        <div className="grid grid-cols-1 gap-3">
          {personalUpgrades.map((upgrade) => {
            const canInteract =
              !upgrade.owned &&
              canAffordShopPurchase({
                researched: true,
                cost: upgrade.cost,
                researchTokenCost: 0,
                money,
                dataTokens,
              });
            const disabled = upgrade.owned || !canInteract;
            return (
              <BlueprintCard key={upgrade.id} owned={upgrade.owned} className={!canInteract && !upgrade.owned ? "opacity-40 grayscale" : undefined}>
                <div className="group relative flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="m-0 text-base font-game font-bold text-brand-cream transition-colors group-hover:text-brand-teal">{upgrade.label}</h3>
                    <p className="text-sm text-white/50 leading-snug mt-1">{upgrade.description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className={`text-base font-game tabular-nums ${canInteract ? "text-brand-teal" : "text-red-400"}`}>
                      <span className="text-[10px] opacity-50 mr-0.5">$</span>
                      {upgrade.cost.toLocaleString()}
                    </div>
                    <button
                      onClick={() => onBuyPersonalUpgrade(upgrade.id)}
                      disabled={disabled}
                      className={`w-auto px-4 py-1.5 game-button text-[10px] tracking-[0.2em] transition-all duration-300 ${disabled ? "opacity-20 pointer-events-none" : "game-button-primary"}`}
                    >
                      {upgrade.owned ? "Owned" : canInteract ? "Upgrade" : "Locked"}
                    </button>
                  </div>
                </div>
              </BlueprintCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
