import { useMemo, useState } from "react";

import { BuildCatalog } from "@/build/components/BuildCatalog";
import type { PlacedBuildItem } from "@llmville/game/build/build";
import type { PlacedRack } from "@/infrastructure/infrastructure";
import {
  mergeOwnedBuildQuantitiesForStore,
  mergeOwnedHardwareQuantitiesForStore,
  useStoreCheckoutHandlers,
  type PersonalUpgradeItem,
  type ShopCatalogItem,
} from "@/store/store";
import type { PersonalUpgradeId } from "@llmville/game/user/personalUpgrades";
import { TABLET_STORE_TAB_ID, type TutorialBenchOption, type TabletStoreTabId } from "@/tablet/tablet";
import { TUTORIAL_STAGE, type TutorialStage } from "@llmville/game/tutorial/tutorialStages";
import type { HardwareModelId } from "@llmville/game/infrastructure/catalog";
import type { ResearchUnlocks } from "@llmville/game/research/researchUnlocks";
import { canAffordShopPurchase } from "@llmville/game/economy/storeTransition";

import { HardwareCatalog } from "@/infrastructure/components/HardwareCatalog";
import { InventoryTrayCard, StorePriceButton } from "@/store/components/StoreListRow";

interface StoreScreenProps {
  activeStoreTab: TabletStoreTabId;
  onBuyItem: (itemId: string) => Promise<unknown> | undefined;
  onUnlockResearch: (itemId: string) => Promise<unknown>;
  tutorialBench?: TutorialBenchOption;
  money: number;
  dataTokens: number;
  researchUnlocks?: ResearchUnlocks;
  shopItems: readonly ShopCatalogItem[];
  personalUpgrades: readonly PersonalUpgradeItem[];
  onBuyPersonalUpgrade: (upgradeId: PersonalUpgradeId) => void;
  hardwareInventory: Record<string, number>;
  showRackOptions?: boolean;
  racks: readonly PlacedRack[];
  buildInventory: Record<string, number>;
  placedBuildItems: readonly PlacedBuildItem[];
  tutorialStarted: boolean;
  tutorialCompleted: boolean;
  tutorialStage: TutorialStage;
  onPlaceOrder: (
    buildItems: { itemId: string; quantity: number }[],
    hardwareItems: { hardwareModelId: HardwareModelId; quantity: number }[],
  ) => Promise<boolean>;
}

export function StoreScreen({
  activeStoreTab,
  onBuyItem,
  onUnlockResearch,
  tutorialBench,
  money,
  dataTokens,
  researchUnlocks,
  shopItems,
  personalUpgrades,
  onBuyPersonalUpgrade,
  hardwareInventory,
  showRackOptions = true,
  racks,
  buildInventory,
  placedBuildItems,
  tutorialStarted,
  tutorialCompleted,
  tutorialStage,
  onPlaceOrder,
}: StoreScreenProps) {
  const forceSingleHardwareQuantity = tutorialStarted && !tutorialCompleted && tutorialStage === TUTORIAL_STAGE.buyGpus;
  const ownedBuildQuantities = useMemo(
    () => mergeOwnedBuildQuantitiesForStore(buildInventory, placedBuildItems),
    [buildInventory, placedBuildItems],
  );
  const ownedHardwareQuantities = useMemo(
    () => mergeOwnedHardwareQuantitiesForStore(hardwareInventory, racks),
    [hardwareInventory, racks],
  );

  const { handleBuyBuild, handleBuyHardware } = useStoreCheckoutHandlers(onPlaceOrder);
  const [pendingResearchId, setPendingResearchId] = useState<string | null>(null);

  return (
    <div className="pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {(activeStoreTab === "infrastructure" || activeStoreTab === "decor") && (
        <div className="space-y-4">
          <BuildCatalog
            money={money}
            dataTokens={dataTokens}
            researchUnlocks={researchUnlocks}
            shopItems={shopItems}
            onBuy={handleBuyBuild}
            onUnlockResearch={onUnlockResearch}
            ownedQuantities={ownedBuildQuantities}
            tutorialBench={activeStoreTab === "infrastructure" && tutorialBench?.show === true ? { visible: true, placed: tutorialBench.placed } : undefined}
            showItems={showRackOptions}
            filterTab={activeStoreTab}
          />
        </div>
      )}

      {activeStoreTab === "cooling" && (
        <div className="space-y-3 pt-2">
          <p className="px-1 text-xs leading-relaxed text-slate-400">
            Rack-mounted coolers install into a rack&apos;s cooler slot. Match coolant type to your rack
            (air, water, or LN2). Research with data tokens, then buy with cash.
          </p>
          {shopItems
            .filter((item) => item.kind === "cooling")
            .map((item) => {
              const researched = item.unlocked !== false;
              const tokenCost = item.researchTokenCost ?? 0;
              const affordable = canAffordShopPurchase({ researched, cost: item.cost, researchTokenCost: tokenCost, money, dataTokens });
              return (
                <InventoryTrayCard key={item.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-brand-cream">{item.label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-brand-cream/50">{item.description}</p>
                  </div>
                  {researched ? (
                    <StorePriceButton
                      price={item.cost}
                      affordable={affordable}
                      onClick={() => onBuyItem(item.id)}
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
                </InventoryTrayCard>
              );
            })}
        </div>
      )}

      {(activeStoreTab === TABLET_STORE_TAB_ID.hardware || activeStoreTab === TABLET_STORE_TAB_ID.operator) && (
        <HardwareCatalog
          money={money}
          dataTokens={dataTokens}
          items={shopItems}
          onBuy={handleBuyHardware}
          onUnlockResearch={onUnlockResearch}
          ownedQuantities={ownedHardwareQuantities}
          personalUpgrades={personalUpgrades}
          onBuyPersonalUpgrade={onBuyPersonalUpgrade}
          initialCategory={activeStoreTab}
          forceSingleQuantity={activeStoreTab === "hardware" && forceSingleHardwareQuantity}
        />
      )}
    </div>
  );
}
