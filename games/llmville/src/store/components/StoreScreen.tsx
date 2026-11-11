/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo, useState } from "@jgengine/core/ui/jsx";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { BuildCatalogPanel } from "../../build/components/BuildCatalog";
import type { PlacedBuildItem } from "@llmville/game/build/build";
import type { PlacedRack } from "../../infrastructure/infrastructure";
import {
  mergeOwnedBuildQuantitiesForStore,
  mergeOwnedHardwareQuantitiesForStore,
  useStoreCheckoutHandlers,
  type PersonalUpgradeItem,
  type ShopCatalogItem,
} from "../store";
import type { PersonalUpgradeId } from "@llmville/game/user/personalUpgrades";
import { TABLET_STORE_TAB_ID, type TutorialBenchOption, type TabletStoreTabId } from "../../tablet/tablet";
import { TUTORIAL_STAGE, type TutorialStage } from "@llmville/game/tutorial/tutorialStages";
import type { HardwareModelId } from "@llmville/game/infrastructure/catalog";
import type { ResearchUnlocks } from "@llmville/game/research/researchUnlocks";
import { canAffordShopPurchase } from "@llmville/game/economy/storeTransition";

import { HardwareCatalog } from "../../infrastructure/components/HardwareCatalog";
import { C, FULL, Muted, Row, Stack, Text } from "../../ui/kit";
import { Card, PriceButton, ResearchButton } from "../../ui/shop";

interface StoreScreenProps {
  activeStoreTab: TabletStoreTabId;
  onBuyItem: (itemId: string) => Promise<unknown> | undefined;
  onUnlockResearch: (itemId: string) => Promise<unknown>;
  tutorialBench?: TutorialBenchOption | undefined;
  money: number;
  dataTokens: number;
  researchUnlocks?: ResearchUnlocks | undefined;
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

/** Rack-mounted coolers: research with data tokens, then buy with cash. */
function CoolingList({ shopItems, money, dataTokens, onBuyItem, onUnlockResearch }: Pick<StoreScreenProps, "shopItems" | "money" | "dataTokens" | "onBuyItem" | "onUnlockResearch">) {
  const [pendingResearchId, setPendingResearchId] = useState<string | null>(null);
  return <Stack gap={10}>
    <Muted size={12}>Rack-mounted coolers install into a rack's cooler slot. Match coolant type to your rack (air, water, or LN2). Research with data tokens, then buy with cash.</Muted>
    {shopItems.filter((item) => item.kind === "cooling").map((item) => {
      const researched = item.unlocked !== false;
      const tokenCost = item.researchTokenCost ?? 0;
      const affordable = canAffordShopPurchase({ researched, cost: item.cost, researchTokenCost: tokenCost, money, dataTokens });
      return <Card key={item.id} layout="row" items="center" justify="between" gap={12}>
        <RuneView grow={1} shrink gap={2}>
          <Text size={14} weight={800}>{item.label}</Text>
          <Text size={11} color={C.faint}>{item.description}</Text>
        </RuneView>
        {researched
          ? <PriceButton price={item.cost} affordable={affordable} name={item.label} onPress={() => void onBuyItem(item.id)} />
          : <ResearchButton tokens={tokenCost} affordable={affordable} pending={pendingResearchId === item.id} name={item.label} onPress={() => {
            setPendingResearchId(item.id);
            void onUnlockResearch(item.id).finally(() => setPendingResearchId((current) => (current === item.id ? null : current)));
          }} />}
      </Card>;
    })}
  </Stack>;
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
  const ownedBuildQuantities = useMemo(() => mergeOwnedBuildQuantitiesForStore(buildInventory, placedBuildItems), [buildInventory, placedBuildItems]);
  const ownedHardwareQuantities = useMemo(() => mergeOwnedHardwareQuantitiesForStore(hardwareInventory, racks), [hardwareInventory, racks]);
  const { handleBuyBuild, handleBuyHardware } = useStoreCheckoutHandlers(onPlaceOrder);

  return <Stack width={FULL} gap={12}>
    {activeStoreTab === "infrastructure" || activeStoreTab === "decor" ? <BuildCatalogPanel
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
    /> : null}
    {activeStoreTab === "cooling" ? <CoolingList shopItems={shopItems} money={money} dataTokens={dataTokens} onBuyItem={onBuyItem} onUnlockResearch={onUnlockResearch} /> : null}
    {activeStoreTab === TABLET_STORE_TAB_ID.hardware || activeStoreTab === TABLET_STORE_TAB_ID.operator ? <HardwareCatalog
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
    /> : null}
    <Row height={24} />
  </Stack>;
}
