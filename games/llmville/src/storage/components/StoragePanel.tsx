/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneAction, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import {
  estimateBuildResalePrice,
  getBuildTabLabel,
  isHardwareStorageItem,
  type BuildMenuTabId,
  type StorageItem,
} from "@llmville/game/build/build";

import { useStoragePanelKeybindLabels } from "../../settings/settings";
import { Button, C, FULL, Label, Row, Stack, Text } from "../../ui/kit";
import { TutorialArrow } from "../../ui/shop";

interface StoragePanelProps {
  tabs: readonly BuildMenuTabId[];
  activeTab: BuildMenuTabId;
  activeBuildItems: readonly StorageItem[];
  buildInventory: Record<string, number>;
  selectedItem: StorageItem | null;
  selectedIndex: number;
  primaryActionLabel: string;
  primaryActionDisabled: boolean;
  trashDisabled: boolean;
  placementModeActive: boolean;
  canPlaceItem?: boolean;
  onConfirmPlacement?: () => void;
  showPlaceItemTutorialArrow?: boolean;
  onTabChange: (direction: -1 | 1) => void;
  onTabSelect: (tab: BuildMenuTabId) => void;
  onItemSelect: (index: number) => void;
  onPrimaryAction: () => void;
  onTrashAction: () => void;
}

/** Storage: build tabs, the stored items, and Place/Trash on the selected one. */
export function StoragePanel({
  tabs,
  activeTab,
  activeBuildItems,
  buildInventory,
  selectedItem,
  selectedIndex,
  primaryActionLabel,
  primaryActionDisabled,
  trashDisabled,
  placementModeActive,
  canPlaceItem = false,
  onConfirmPlacement,
  showPlaceItemTutorialArrow = false,
  onTabChange,
  onTabSelect,
  onItemSelect,
  onPrimaryAction,
  onTrashAction,
}: StoragePanelProps) {
  const keys = useStoragePanelKeybindLabels();
  const pointAtPlace = showPlaceItemTutorialArrow && primaryActionLabel === "Place Item" && !primaryActionDisabled;
  return <Stack gap={14} width={FULL}>
    <Row gap={4} width={FULL} padding={4} radius={14} fill="#00000066">
      <Button tone="chip" minWidth={32} label="Previous storage tab" onPress={() => onTabChange(-1)}><Text size={12}>{keys.previousTab}</Text></Button>
      <Row grow={1} gap={4}>{tabs.map((tab) => <Button key={tab} tone="chip" grow={1} fill={tab === activeTab ? C.teal : "#00000000"} label={`${getBuildTabLabel(tab)} storage`} onPress={() => onTabSelect(tab)}>
        <Text size={10} weight={800} color={tab === activeTab ? C.ink : C.cream}>{getBuildTabLabel(tab)}</Text>
      </Button>)}</Row>
      <Button tone="chip" minWidth={32} label="Next storage tab" onPress={() => onTabChange(1)}><Text size={12}>{keys.nextTab}</Text></Button>
    </Row>

    <RuneView scroll maxHeight={320} gap={8} width={FULL}>
      {activeBuildItems.length === 0 ? <RuneView padding={32} items="center" width={FULL}>
        <Label>{(activeTab === "hardware" ? "No GPUs in storage. Buy from Store → Hardware." : "No items in storage").toUpperCase()}</Label>
      </RuneView> : activeBuildItems.map((item, index) => {
        const selected = index === selectedIndex;
        if (isHardwareStorageItem(item)) {
          return <RuneAction key={item.id} variant="inset" width={FULL} gap={6} label={`Select ${item.name}`} run={() => onItemSelect(index)} border={{ width: 1, color: selected ? "#e8836b66" : C.line }}>
            <Row justify="between" width={FULL}>
              <RuneView><Text size={12} weight={800} color={selected ? C.coral : C.cream}>{item.name}</Text><Text size={9} color={C.faint}>{`In stock: ${item.count}`}</Text></RuneView>
              <Text size={10} color={C.coral}>GPU</Text>
            </Row>
            {selected ? <Text size={9} color={C.faint}>{`Configure at rack — press ${keys.interact} near a rack`}</Text> : null}
          </RuneAction>;
        }
        const owned = buildInventory[item.id] || 0;
        return <RuneView key={item.id} width={FULL} gap={8}>
          <RuneAction variant="inset" width={FULL} gap={6} label={`Select ${item.name}`} run={() => onItemSelect(index)} border={{ width: 1, color: selected ? "#5fc2a866" : C.line }}>
            <Row justify="between" width={FULL}>
              <RuneView><Text size={12} weight={800} color={selected ? C.teal : C.cream}>{item.name}</Text>{owned > 0 ? <Text size={9} color={C.faint}>{`In stock: ${owned}`}</Text> : null}</RuneView>
              <Text size={10} color={C.muted}>{owned > 0 ? `EST $${estimateBuildResalePrice(item.price).toLocaleString()}` : `$${item.price.toLocaleString()}`}</Text>
            </Row>
          </RuneAction>
          {selected && selectedItem?.id === item.id ? <Row gap={8} width={FULL}>
            {pointAtPlace ? <TutorialArrow /> : null}
            <Button tone="primary" grow={1} minHeight={36} disabled={primaryActionDisabled} label={`${primaryActionLabel} ${item.name}`}
              {...(pointAtPlace ? { border: { width: 2, color: C.teal } } : {})} onPress={onPrimaryAction}>
              <Text size={11} weight={800} color={C.ink}>{primaryActionLabel}</Text>
            </Button>
            <Button tone="danger" minHeight={36} disabled={trashDisabled} label={`Trash ${item.name}`} onPress={onTrashAction}><Text size={11} weight={800} color={C.error}>Trash</Text></Button>
          </Row> : null}
        </RuneView>;
      })}
    </RuneView>

    {placementModeActive ? <Stack gap={8} width={FULL}>
      {onConfirmPlacement ? <Button tone="primary" width={FULL} disabled={!canPlaceItem} onPress={onConfirmPlacement}>Place here</Button> : null}
      <Label color={C.teal}>{`${keys.confirm} or Click to place, ${keys.rotatePlacement} rotate, ${keys.cancel} cancel`.toUpperCase()}</Label>
    </Stack> : null}
  </Stack>;
}
