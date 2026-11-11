/** @jsxImportSource @jgengine/core/ui/jsx */
import { useCallback, useState } from "@jgengine/core/ui/jsx";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { getHardwareDefinition, parseHardwareModelId } from "@llmville/game/infrastructure/catalog";
import type { HardwareModelId } from "@llmville/game/infrastructure/catalog";
import { canAffordShopPurchase } from "@llmville/game/economy/storeTransition";
import type { PersonalUpgradeItem, ShopCatalogItem } from "../../store/store";
import type { PersonalUpgradeId } from "@llmville/game/user/personalUpgrades";

import { TABLET_STORE_TAB_ID } from "../../tablet/tablet";
import { GpuModelPreview } from "../../scene/components/GpuModelPreview";
import { Button, C, FULL, Label, Muted, Row, Stack, Text } from "../../ui/kit";
import { Card, money as cash, Pill, QuantityBuy, ResearchButton } from "../../ui/shop";

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

interface RecentPurchase { amount: number; quantity: number; token: number }

type HardwareShopItem = ShopCatalogItem & { hardwareModelId: HardwareModelId };

/** One GPU listing: shot, name, price, speed/memory/power, then quantity and buy (or research). */
function HardwareShopCard({ item, quantity, interactive, researched, dataTokens, pending, researchPending, recentPurchase, onQtyChange, onBuy, onUnlockResearch }: {
  item: HardwareShopItem; quantity: number; interactive: boolean; researched: boolean; dataTokens: number; pending: boolean; researchPending: boolean;
  recentPurchase: RecentPurchase | undefined; onQtyChange: (next: number) => void; onBuy: () => void; onUnlockResearch: () => void;
}) {
  const hw = getHardwareDefinition(item.hardwareModelId);
  const tokens = item.researchTokenCost ?? 0;
  return <Card dim={!interactive && researched} gap={10}>
    <Row gap={12} items="start" width={FULL}>
      <GpuModelPreview hardwareModelId={item.hardwareModelId} />
      <RuneView grow={1} shrink gap={6}>
        <Row justify="between" width={FULL} items="start">
          <Text size={14} weight={800} grow={1} shrink>{item.label}</Text>
          <RuneView items="end" gap={2}>
            <Text size={14} weight={800} color={C.teal}>{researched ? cash(item.cost) : `${tokens.toLocaleString()} tokens`}</Text>
            <Label size={9}>{researched ? "IN STOCK" : "RESEARCH"}</Label>
          </RuneView>
        </Row>
        <Row gap={6}>
          <Pill label="SPEED" value={`${hw.trainingPowerFp16} TF`} accent={C.teal} />
          <Pill label="MEMORY" value={`${hw.vramGb} GB`} />
          <Pill label="POWER" value={`${hw.tdpWatts}W`} />
        </Row>
      </RuneView>
    </Row>
    <Row justify="end" gap={8} width={FULL}>
      {recentPurchase === undefined ? null : <Text size={11} weight={800} color={C.teal}>{`Bought ×${recentPurchase.quantity}`}</Text>}
      {researched
        ? <QuantityBuy quantity={quantity} onQuantity={onQtyChange} onBuy={onBuy} disabled={!interactive || pending || researchPending} pending={pending} name={item.label} />
        : <ResearchButton tokens={tokens} affordable={dataTokens >= tokens} pending={researchPending} name={item.label} onPress={onUnlockResearch} />}
    </Row>
  </Card>;
}

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
    setTimeout(() => {
      setRecentPurchases((prev) => (prev[itemId]?.token === token ? Object.fromEntries(Object.entries(prev).filter(([id]) => id !== itemId)) : prev));
    }, 1600);
  }, []);

  return <Stack width={FULL} gap={10}>
    {initialCategory === TABLET_STORE_TAB_ID.hardware || initialCategory === undefined ? <>
      {hardwareItems.map((item) => {
        const researched = item.unlocked !== false;
        const quantity = forceSingleQuantity ? 1 : getQty(item.id);
        const canInteract = researched && canAffordShopPurchase({ researched, cost: item.cost * quantity, researchTokenCost: item.researchTokenCost ?? 0, money, dataTokens });
        return <HardwareShopCard key={item.id} item={item} quantity={quantity} interactive={canInteract} researched={researched} dataTokens={dataTokens}
          pending={pendingItemId === item.id} researchPending={pendingResearchId === item.id} recentPurchase={recentPurchases[item.id]}
          onQtyChange={(q) => setQty(item.id, q)}
          onBuy={() => {
            void (async () => {
              const selectedQuantity = forceSingleQuantity ? 1 : getQty(item.id);
              setPendingItemId(item.id);
              try {
                if (await onBuy(item.id, selectedQuantity)) registerPurchase(item.id, item.cost * selectedQuantity, selectedQuantity);
              } finally {
                setPendingItemId((current) => (current === item.id ? null : current));
              }
            })();
          }}
          onUnlockResearch={() => {
            setPendingResearchId(item.id);
            void onUnlockResearch(item.id).finally(() => setPendingResearchId((current) => (current === item.id ? null : current)));
          }} />;
      })}
      {hardwareItems.length === 0 ? <Card items="center" padding={20}><Label>NO HARDWARE LISTINGS AVAILABLE.</Label></Card> : null}
    </> : null}
    {initialCategory === TABLET_STORE_TAB_ID.operator || initialCategory === undefined ? personalUpgrades.map((upgrade) => {
      const canInteract = !upgrade.owned && canAffordShopPurchase({ researched: true, cost: upgrade.cost, researchTokenCost: 0, money, dataTokens });
      return <Card key={upgrade.id} owned={upgrade.owned} dim={!canInteract && !upgrade.owned} layout="row" items="start" justify="between" gap={12}>
        <RuneView grow={1} shrink gap={4}>
          <Text size={15} weight={800}>{upgrade.label}</Text>
          <Muted size={13}>{upgrade.description}</Muted>
        </RuneView>
        <RuneView items="end" gap={8}>
          <Text size={15} weight={800} color={canInteract ? C.teal : C.error}>{cash(upgrade.cost)}</Text>
          <Button tone={canInteract ? "primary" : "secondary"} minHeight={32} padding={[6, 14, 6, 14]} disabled={upgrade.owned || !canInteract}
            label={`${upgrade.owned ? "Owned" : canInteract ? "Upgrade" : "Locked"} ${upgrade.label}`} onPress={() => onBuyPersonalUpgrade(upgrade.id)}>
            <Text size={11} weight={800} color={canInteract ? C.ink : C.cream}>{upgrade.owned ? "OWNED" : canInteract ? "UPGRADE" : "LOCKED"}</Text>
          </Button>
        </RuneView>
      </Card>;
    }) : null}
  </Stack>;
}
