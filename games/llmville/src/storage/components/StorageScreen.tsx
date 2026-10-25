import { StoragePanel } from "@/storage/components/StoragePanel";
import type { BuildMenuTabId, BuildPlacementPreview, StorageItem } from "@llmville/game/build/build";
import { STARTER_RACK_CATALOG_ID } from "@llmville/game/infrastructure/catalog";
import { TUTORIAL_STAGE, type TutorialStage } from "@llmville/game/tutorial/tutorialStages";

interface StorageScreenProps {
  buildTabs: readonly BuildMenuTabId[];
  activeBuildTab: BuildMenuTabId;
  activeBuildItems: readonly StorageItem[];
  buildInventory: Record<string, number>;
  selectedBuildItem: StorageItem | null;
  selectedBuildItemIndex: number;
  selectedBuildPriceLabel: string;
  buildPrimaryActionLabel: string;
  isBuildPrimaryActionDisabled: boolean;
  isBuildTrashActionDisabled: boolean;
  buildPlacementModeActive: boolean;
  placementPreview: BuildPlacementPreview | null;
  onConfirmPlacement: () => void;
  onCycleBuildTab: (direction: -1 | 1) => void;
  onSetBuildTab: (tab: BuildMenuTabId) => void;
  onCycleBuildItem: (direction: -1 | 1) => void;
  onSetBuildItemIndex: (index: number) => void;
  onBuildPrimaryAction: () => void;
  onBuildTrashAction: () => void;
  onToggleTablet: (nextOpen?: boolean) => void;
  tutorialStarted: boolean;
  tutorialCompleted: boolean;
  tutorialStage: TutorialStage;
}

export function StorageScreen({
  buildTabs,
  activeBuildTab,
  activeBuildItems,
  buildInventory,
  selectedBuildItem,
  selectedBuildItemIndex,
  selectedBuildPriceLabel,
  buildPrimaryActionLabel,
  isBuildPrimaryActionDisabled,
  isBuildTrashActionDisabled,
  buildPlacementModeActive,
  placementPreview,
  onConfirmPlacement,
  onCycleBuildTab,
  onSetBuildTab,
  onCycleBuildItem,
  onSetBuildItemIndex,
  onBuildPrimaryAction,
  onBuildTrashAction,
  onToggleTablet,
  tutorialStarted,
  tutorialCompleted,
  tutorialStage,
}: StorageScreenProps) {

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 w-full pb-24 duration-500">
      <p className="mb-3 text-xs leading-relaxed text-brand-cream-dim">Place purchased items to build your plot. To relocate, pick them up and place them in another open space. Picking up a rack returns its GPUs and cooler here for reinstallation.</p>
      <div className="w-full">
        <StoragePanel
          tabs={buildTabs}
          activeTab={activeBuildTab}
          activeBuildItems={activeBuildItems}
          buildInventory={buildInventory}
          selectedItem={selectedBuildItem}
          selectedIndex={selectedBuildItemIndex}
          priceLabel={selectedBuildPriceLabel}
          primaryActionLabel={buildPrimaryActionLabel}
          primaryActionDisabled={isBuildPrimaryActionDisabled}
          trashDisabled={isBuildTrashActionDisabled}
          placementModeActive={buildPlacementModeActive}
          canPlaceItem={placementPreview?.isValid ?? false}
          onConfirmPlacement={onConfirmPlacement}
          showPlaceItemTutorialArrow={
            tutorialStarted &&
            !tutorialCompleted &&
            tutorialStage === TUTORIAL_STAGE.placeRack &&
            (buildInventory[STARTER_RACK_CATALOG_ID] ?? 0) > 0 &&
            selectedBuildItem?.id === STARTER_RACK_CATALOG_ID
          }
          onTabChange={onCycleBuildTab}
          onTabSelect={onSetBuildTab}
          onItemChange={onCycleBuildItem}
          onItemSelect={onSetBuildItemIndex}
          onPrimaryAction={() => {
            onBuildPrimaryAction();
            if (buildPrimaryActionLabel === "Place Item" && !isBuildPrimaryActionDisabled) {
              onToggleTablet(false);
            }
          }}
          onTrashAction={onBuildTrashAction}
        />
      </div>
    </div>
  );
}
