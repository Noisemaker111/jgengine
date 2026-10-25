import {
  estimateBuildResalePrice,
  getBuildTabLabel,
  isHardwareStorageItem,
  type BuildMenuTabId,
  type StorageItem,
} from "@llmville/game/build/build";
import { InventoryTrayCard } from "@/store/components/StoreListRow";
import { useStoragePanelKeybindLabels } from "@/settings/settings";
import { TutorialArrow } from "@/tutorial/components/TutorialUi";
import { cn } from "@/components/ui/cn";

interface StoragePanelProps {
  tabs: readonly BuildMenuTabId[];
  activeTab: BuildMenuTabId;
  activeBuildItems: readonly StorageItem[];
  buildInventory: Record<string, number>;
  selectedItem: StorageItem | null;
  selectedIndex: number;
  priceLabel: string;
  primaryActionLabel: string;
  primaryActionDisabled: boolean;
  trashDisabled: boolean;
  placementModeActive: boolean;
  canPlaceItem?: boolean;
  onConfirmPlacement?: () => void;
  showPlaceItemTutorialArrow?: boolean;
  onTabChange: (direction: -1 | 1) => void;
  onTabSelect: (tab: BuildMenuTabId) => void;
  onItemChange: (direction: -1 | 1) => void;
  onItemSelect: (index: number) => void;
  onPrimaryAction: () => void;
  onTrashAction: () => void;
}

export function StoragePanel({
  tabs,
  activeTab,
  activeBuildItems,
  buildInventory,
  selectedItem,
  selectedIndex,
  priceLabel: _priceLabel,
  primaryActionLabel,
  primaryActionDisabled,
  trashDisabled,
  placementModeActive,
  canPlaceItem = false,
  onConfirmPlacement,
  showPlaceItemTutorialArrow,
  onTabChange,
  onTabSelect,
  onItemChange: _onItemChange,
  onItemSelect,
  onPrimaryAction,
  onTrashAction,
}: StoragePanelProps) {
  const {
    previousTab: previousTabKeyLabel,
    nextTab: nextTabKeyLabel,
    interact: interactKeyLabel,
    confirm: confirmKeyLabel,
    rotatePlacement: rotateKeyLabel,
    cancel: cancelKeyLabel,
  } = useStoragePanelKeybindLabels();

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="game-control-group">
        <button
          type="button"
          onClick={() => onTabChange(-1)}
          className="game-control-segment w-8 shrink-0 px-0 text-xs"
        >
          {previousTabKeyLabel}
        </button>
        <div className="flex flex-1 gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabSelect(tab)}
              className={`game-control-segment text-[10px] ${tab === activeTab ? "game-control-segment-active" : ""}`}
            >
              {getBuildTabLabel(tab)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onTabChange(1)}
          className="game-control-segment w-8 shrink-0 px-0 text-xs"
        >
          {nextTabKeyLabel}
        </button>
      </div>

      <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto scrollbar-none">
        {activeBuildItems.length === 0 ? (
          <div className="py-8 text-center text-[11px] uppercase tracking-wider text-brand-cream/30">
            {activeTab === "hardware" ? "No GPUs in storage. Buy from Store → Hardware." : "No items in storage"}
          </div>
        ) : (
          activeBuildItems.map((item, index) => {
            const isSelected = index === selectedIndex;
            const isHardware = isHardwareStorageItem(item);

            if (isHardware) {
              return (
                <InventoryTrayCard
                  key={item.id}
                  className={cn(
                    "w-full cursor-pointer text-left",
                    isSelected && "ring-1 ring-brand-coral/40",
                  )}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onItemSelect(index)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onItemSelect(index); } }}
                  >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-xs font-bold ${isSelected ? "text-brand-coral" : "text-brand-cream"}`}>{item.name}</p>
                      <p className="text-[9px] text-brand-cream/40">In stock: {item.count}</p>
                    </div>
                    <span className="text-[10px] text-brand-coral/80">GPU</span>
                  </div>
                  {isSelected && (
                    <p className="mt-2 text-[9px] text-brand-cream/45">Configure at rack — press {interactKeyLabel} near a rack</p>
                  )}
                  </div>
                </InventoryTrayCard>
              );
            }

            const itemOwnedCount = buildInventory[item.id] || 0;
            const rowPriceLabel = itemOwnedCount > 0 ? `EST $${estimateBuildResalePrice(item.price).toLocaleString()}` : `$${item.price.toLocaleString()}`;

            return (
              <InventoryTrayCard
                key={item.id}
                className={cn(
                  "w-full cursor-pointer text-left",
                  isSelected && "ring-1 ring-brand-teal/40",
                )}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onItemSelect(index)}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onItemSelect(index); } }}
                >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-xs font-bold ${isSelected ? "text-brand-teal" : "text-brand-cream"}`}>{item.name}</p>
                    {itemOwnedCount > 0 && <p className="text-[9px] text-brand-cream/40">In stock: {itemOwnedCount}</p>}
                  </div>
                  <span className="text-[10px] text-brand-cream/55">{rowPriceLabel}</span>
                </div>
                {isSelected && selectedItem?.id === item.id && (
                  <div className="game-divider mt-3 flex gap-2 pt-3" onClick={(event) => event.stopPropagation()}>
                    <div className="flex-1 relative">
                      {showPlaceItemTutorialArrow && primaryActionLabel === "Place Item" && !primaryActionDisabled && (
                        <TutorialArrow className="!-top-6 scale-75" />
                      )}
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); onPrimaryAction(); }}
                        disabled={primaryActionDisabled}
                        className={`game-button game-button-compact w-full text-[10px] ${
                          primaryActionDisabled ? "opacity-40" : "game-button-primary"
                        } ${showPlaceItemTutorialArrow && primaryActionLabel === "Place Item" ? "ring-2 ring-brand-teal/70" : ""}`}
                      >
                        {primaryActionLabel}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); onTrashAction(); }}
                      disabled={trashDisabled}
                      className={`game-button game-button-compact px-3 text-[10px] ${
                        trashDisabled ? "opacity-40" : "game-button-secondary border-[#d9544a]/30 text-[#f0a097]"
                      }`}
                    >
                      Trash
                    </button>
                  </div>
                )}
                </div>
              </InventoryTrayCard>
            );
          })
        )}
      </div>

      {placementModeActive && (
        <div className="flex flex-col gap-2">
          {onConfirmPlacement && (
            <button
              type="button"
              onClick={onConfirmPlacement}
              disabled={!canPlaceItem}
              className={`game-button game-button-compact w-full text-[10px] ${
                canPlaceItem ? "game-button-primary" : "opacity-40"
              }`}
            >
              Place here
            </button>
          )}
          <p className="text-[9px] uppercase tracking-widest text-brand-teal/80">{confirmKeyLabel} or Click to place, {rotateKeyLabel} rotate, {cancelKeyLabel} cancel</p>
        </div>
      )}
    </div>
  );
}
