/** @jsxImportSource @jgengine/core/ui/jsx */
import { useState } from "@jgengine/core/ui/jsx";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { BUILD_CATALOG, type PlaceableBuildItemId } from "@llmville/game/build/catalog";
import type { BuildTabId } from "@llmville/game/build/catalog";
import { canAffordShopPurchase } from "@llmville/game/economy/storeTransition";
import { getRackCatalogDefinition, STARTER_RACK_CATALOG_ID } from "@llmville/game/infrastructure/catalog";
import type { ShopCatalogItem } from "../../store/store";
import { getResearchTokenCost, isResearchUnlocked, type ResearchUnlocks } from "@llmville/game/research/researchUnlocks";
import { C, FULL, Label, Muted, Row, Stack, Text } from "../../ui/kit";
import { Card, money as cash, QuantityBuy, ResearchButton, TutorialArrow } from "../../ui/shop";
import { DecorThumb } from "./DecorShopCard";

interface BuildCatalogProps {
  money: number;
  dataTokens: number;
  researchUnlocks?: ResearchUnlocks | undefined;
  shopItems: readonly ShopCatalogItem[];
  onBuy: (itemId: string, quantity?: number) => Promise<boolean>;
  onUnlockResearch: (itemId: string) => Promise<unknown>;
  ownedQuantities: Record<string, number>;
  tutorialBench?: { visible: boolean; placed: boolean } | undefined;
  showItems?: boolean;
  filterTab: BuildTabId;
}

function rackFeatureBullets(itemId: string): string[] {
  const rack = getRackCatalogDefinition(itemId);
  return [`${rack.slotCapacity} GPU slots`, `${rack.allowedCoolantTypes.join(" / ")} cooling`];
}

/** A rack's front: four dark bays. */
function RackThumb() {
  return <RuneView width={56} height={56} radius={4} fill="#3a3a3a" border={{ width: 1, color: "#ffffff33" }} justify="center" gap={3} padding={6}>
    {[0, 1, 2, 3].map((i) => <RuneView key={i} height={3} fill="#222222" width={FULL} />)}
  </RuneView>;
}

export function BuildCatalogPanel({
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

  if (!showItems) return <RuneView padding={32} items="center" width={FULL}><Label>UNLOCK MORE SPACE TO PLACE THESE.</Label></RuneView>;

  const getQty = (id: string) => Math.max(1, quantities[id] ?? 1);
  const setQty = (id: string, q: number) => setQuantities((prev) => ({ ...prev, [id]: Math.max(1, q) }));
  const handleBuy = async (itemId: string) => {
    setPendingItemId(itemId);
    try { await onBuy(itemId, getQty(itemId)); } finally { setPendingItemId((current) => (current === itemId ? null : current)); }
  };
  const research = (itemId: string) => {
    setPendingResearchId(itemId);
    void onUnlockResearch(itemId).finally(() => setPendingResearchId((current) => (current === itemId ? null : current)));
  };

  return <Stack width={FULL} gap={10}>{items.map((item) => {
    const owned = ownedQuantities[item.id] ?? 0;
    const shopRow = shopItems.find((row) => row.id === item.id);
    const researched = shopRow?.unlocked ?? isResearchUnlocked(researchUnlocks, item.id);
    const tokenCost = shopRow?.researchTokenCost ?? getResearchTokenCost(item.id) ?? 0;
    const qty = getQty(item.id);
    const affordable = canAffordShopPurchase({ researched, cost: item.price * qty, researchTokenCost: tokenCost, money, dataTokens });
    const pending = pendingItemId === item.id;
    const decor = filterTab === "decor";
    const showBenchArrow = !decor && tutorialBench?.visible === true && tutorialBench.placed === false && item.id === STARTER_RACK_CATALOG_ID;
    return <Card key={item.id} dim={!affordable && owned === 0} gap={10}>
      <Row gap={12} items="start" width={FULL}>
        {decor ? <DecorThumb itemId={item.id as PlaceableBuildItemId} /> : <RackThumb />}
        <RuneView grow={1} shrink gap={4}>
          <Row justify="between" width={FULL} items="start">
            <Text size={14} weight={800} grow={1} shrink>{item.label}</Text>
            <RuneView items="end" gap={2}>
              <Text size={14} weight={800} color={C.teal}>{researched ? cash(item.price) : `${tokenCost.toLocaleString()} tokens`}</Text>
              {decor ? <Label size={9}>{researched ? "IN STOCK" : "RESEARCH"}</Label> : null}
            </RuneView>
          </Row>
          {decor ? <Muted size={12}>{item.description}</Muted> : rackFeatureBullets(item.id).map((feature) => <Muted key={feature} size={11}>{`– ${feature}`}</Muted>)}
          {decor && owned > 0 ? <Text size={11} weight={800} color={C.teal}>{`Owned ×${owned}`}</Text> : null}
        </RuneView>
      </Row>
      <Row justify="end" gap={8} width={FULL}>
        {showBenchArrow ? <TutorialArrow /> : null}
        {researched
          ? <QuantityBuy quantity={qty} onQuantity={(q) => setQty(item.id, q)} onBuy={() => void handleBuy(item.id)} disabled={!affordable || pending} pending={pending} name={item.label} highlight={showBenchArrow} />
          : <ResearchButton tokens={tokenCost} affordable={affordable} pending={pendingResearchId === item.id} name={item.label} onPress={() => research(item.id)} />}
      </Row>
    </Card>;
  })}</Stack>;
}
