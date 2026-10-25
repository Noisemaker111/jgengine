/**
 * The tablet frame that slides up from the bottom.
 * It owns the full tablet flow so the home screen, app sheet, and tutorial locks
 * can be traced in one place.
 */

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { BuildViewModel } from "@/build/buildSession";
import type { ReadyWorldViewModel } from "@/runtime/worldViewModel";
import { TABLET_APP_ID, TABLET_APPS, useGameTabletFrame, useEscapeToClose } from "@/tablet/tablet";
import type { TutorialViewModel } from "@/tutorial/tutorialRuntime";
import {
  GAME_TABLET_APP_ICON_GRADIENT_OVERLAY_CLASS,
  GAME_TABLET_APP_ICON_HIGHLIGHT_CLASS,
  GAME_TABLET_APP_ICON_SVG_CLASS,
  GAME_TABLET_APP_ICON_TILE_CLASS,
  GAME_TABLET_APP_LABEL_CLASS,
  GAME_TABLET_BACK_BUTTON_CLASS,
  GAME_TABLET_BACK_CHEVRON_PATH,
  GAME_TABLET_BATTERY_FILL_CLASS,
  GAME_TABLET_BATTERY_SHELL_CLASS,
  GAME_TABLET_BODY_CLASS,
  GAME_TABLET_CLOCK_ROW_CLASS,
  gameTabletFrameClass,
  GAME_TABLET_HOME_GRID_CLASS,
  GAME_TABLET_NOTCH_BAR_CLASS,
  GAME_TABLET_NOTCH_GRIP_CLASS,
  GAME_TABLET_NOTCH_DOT_CLASS,
  GAME_TABLET_SCAN_LINE_CLASS,
  GAME_TABLET_SPEND_PULSE_CLASS,
  GAME_TABLET_STATUS_ICONS_ROW_CLASS,
  GAME_TABLET_STATUS_ROW_CLASS,
  GAME_TABLET_STATUS_SIGNAL_PATH,
  GAME_TABLET_STATUS_WIFI_PATH,
  gameTabletViewportClass,
  tabletAppHeaderRowClass,
  tabletAppLayerBgClass,
  tabletAppScrollAreaClass,
  gameTabletAppTitleClass,
  tabletHomeAppButtonClass,
  gameTabletShellMotionClass,
} from "@/tablet/gameTabletChrome";
import { useTabletSheetGestures, TABLET_TOUCH_CLOSED_TRANSLATE_PERCENT, TABLET_TOUCH_OPEN_TRANSLATE_PERCENT } from "@/tablet/tabletSheetGesture";
import { useTabletNavContext } from "@/tablet/components/tabletNav";
import { UI_LAYER } from "@/runtime/uiLayers";

import { SettingsApp } from "@/settings/components/SettingsApp";
import { AllModelsApp } from "@/models/components/AllModelsApp";
import { InferenceApp } from "@/inference/components/InferenceApp";
import { StatsApp } from "@/stats/components/StatsApp";
import { MapApp } from "@/world/components/MapApp";
import { BotApp } from "@/tablet/components/BotApp";
import { BillsApp } from "@/economy/components/BillsApp";
import ModelRevealOverlay, { type RevealingModelStats } from "@/models/components/ModelRevealOverlay";
import { StorageScreen } from "@/storage/components/StorageScreen";
import { StoreScreen } from "@/store/components/StoreScreen";
import { TabletStoreTabs } from "@/tablet/components/TabletStoreTabs";
import { TutorialArrow } from "@/tutorial/components/TutorialUi";
import { LabGuide, type LabGoalSelection } from "@/tutorial/components/LabGuide";
import { NeighborhoodProject } from "@/multiplayer/components/NeighborhoodProject";

interface GameTabletProps {
  world: ReadyWorldViewModel;
  build: BuildViewModel;
  tutorial: TutorialViewModel;
  isTouch: boolean;
  /** When true, tablet is scoped to a dev preview frame instead of the browser viewport. */
  embedded?: boolean;
  goalSelection?: LabGoalSelection;
}

export function GameTablet({ world, build, tutorial, isTouch, embedded = false, goalSelection }: GameTabletProps) {
  const nav = useTabletNavContext();
  const shellRef = useRef<HTMLDivElement>(null);
  const {
    activeTab,
    activeStoreTab,
    collapsed,
    lock,
    tutorialBench,
    isAppAllowed,
    isStoreTabAllowed,
    openTab,
    openStoreTab,
    isModelsTheme,
    headerTitle,
    openTabletHome,
    toggleTablet,
  } = useGameTabletFrame({ world, tutorial, nav, isTouch });
  const [revealingModel, setRevealingModel] = useState<RevealingModelStats | null>(null);
  const tabletInteractable = !collapsed;
  const peekEnabled = isTouch && collapsed;
  const { shellTranslatePercent, shellDragging, dismissHandle, peekHandle } = useTabletSheetGestures({
    shellRef,
    collapsed,
    dismissEnabled: tabletInteractable,
    peekEnabled,
    onDismiss: nav.closeMenu,
    onOpen: openTabletHome,
    openTranslatePercent: isTouch ? TABLET_TOUCH_OPEN_TRANSLATE_PERCENT : undefined,
    closedTranslatePercent: isTouch ? TABLET_TOUCH_CLOSED_TRANSLATE_PERCENT : undefined,
  });
  useEscapeToClose(nav.closeMenu, tabletInteractable);

  return (
    <>
      <div
        className={gameTabletViewportClass(isTouch, collapsed, embedded)}
        style={{ zIndex: UI_LAYER.tablet }}
        data-ui-layer={isTouch ? "tablet" : undefined}
      >
        {peekEnabled && (
          <button
            type="button"
            aria-label="Swipe up or tap to open tablet"
            data-ui-layer="tablet-peek-handle"
            className="pointer-events-auto absolute bottom-0 left-1/2 z-[2] flex h-[min(5rem,calc(env(safe-area-inset-bottom)+3.75rem))] w-36 max-w-[50vw] -translate-x-1/2 touch-none items-end justify-center pb-[max(0.5rem,env(safe-area-inset-bottom))]"
            onPointerDown={peekHandle.onPointerDown}
            onPointerMove={peekHandle.onPointerMove}
            onPointerUp={peekHandle.onPointerUp}
            onPointerCancel={peekHandle.onPointerCancel}
          >
            <span className="mb-2 h-1.5 w-12 rounded-full bg-white/35 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]" aria-hidden="true" />
          </button>
        )}
        <div
          ref={shellRef}
          data-no-pointer-lock="true"
          className={gameTabletShellMotionClass(tabletInteractable)}
          style={{
            transform: `translateY(${shellTranslatePercent}%)`,
            transition: shellDragging ? "none" : undefined,
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className={gameTabletFrameClass(isTouch, collapsed)}>
            <button
              type="button"
              aria-label="Swipe down or tap to close tablet"
              data-tablet-dismiss-handle="true"
              className={GAME_TABLET_NOTCH_BAR_CLASS}
              onPointerDown={dismissHandle.onPointerDown}
              onPointerMove={dismissHandle.onPointerMove}
              onPointerUp={dismissHandle.onPointerUp}
              onPointerCancel={dismissHandle.onPointerCancel}
            >
              <span className={GAME_TABLET_NOTCH_GRIP_CLASS} aria-hidden="true" />
              <span className={GAME_TABLET_NOTCH_DOT_CLASS}>Close tablet</span>
            </button>

            <div className={GAME_TABLET_STATUS_ROW_CLASS}>
              <span className={GAME_TABLET_CLOCK_ROW_CLASS}>
                {world.gameTime ? (
                  <>
                    <span>{world.gameTime.formattedTime}</span>
                    <span className="text-white/70 font-medium">
                      {world.gameTime.monthName} {world.gameTime.dayOfMonth}
                    </span>
                  </>
                ) : (
                  <>
                    <span>9:41</span>
                    <span className="text-white/50">—</span>
                  </>
                )}
              </span>
              <div className={GAME_TABLET_STATUS_ICONS_ROW_CLASS}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d={GAME_TABLET_STATUS_SIGNAL_PATH} />
                </svg>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d={GAME_TABLET_STATUS_WIFI_PATH} clipRule="evenodd" />
                </svg>
                <div className={GAME_TABLET_BATTERY_SHELL_CLASS}>
                  <div className={GAME_TABLET_BATTERY_FILL_CLASS} />
                </div>
              </div>
            </div>

            <div className={GAME_TABLET_BODY_CLASS}>
              {activeTab !== null && (
                <div className={tabletAppLayerBgClass(isModelsTheme)}>
                  <div className="h-full flex flex-col">
                    <div className={tabletAppHeaderRowClass(activeTab, isModelsTheme)}>
                      {world.spendPulse != null && world.spendPulse.amount > 0 && (
                        <span key={world.spendPulse.token} className={GAME_TABLET_SPEND_PULSE_CLASS}>
                          -${world.spendPulse.amount.toLocaleString()}
                        </span>
                      )}
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={openTabletHome}
                        aria-label="Back to tablet home"
                        className={GAME_TABLET_BACK_BUTTON_CLASS}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={GAME_TABLET_BACK_CHEVRON_PATH} />
                        </svg>
                      </button>
                      <div className="ml-3 flex items-center gap-3">
                        <h2 className={gameTabletAppTitleClass(isModelsTheme)}>{headerTitle}</h2>
                      </div>
                    </div>

                    {activeTab === TABLET_APP_ID.store && (
                      <TabletStoreTabs
                        activeStoreTab={activeStoreTab}
                        tutorialLock={lock}
                        isStoreTabAllowed={isStoreTabAllowed}
                        onOpenStoreTab={openStoreTab}
                      />
                    )}

                    <div className={activeTab === TABLET_APP_ID.settings ? "flex min-h-0 flex-1 flex-col overflow-hidden" : tabletAppScrollAreaClass(isModelsTheme)}>
                      {activeTab === TABLET_APP_ID.models && (
                        <AllModelsApp
                          tutorialStarted={tutorial.tutorialStarted}
                          tutorialCompleted={tutorial.tutorialCompleted}
                          tutorialStage={tutorial.tutorialStage}
                          baseModelLibrary={world.baseModelLibrary}
                          isTraining={world.isTraining}
                          trainingEndsAt={world.activeTraining?.endTime ?? null}
                          trainingBaseModelId={world.activeTraining?.baseModelId ?? null}
                          lastUnlockedBaseModelId={world.lastUnlockedBaseModelId}
                          postTrainError={world.postTrainError}
                          onDismissPostTrainError={world.onDismissPostTrainError}
                          dataTokens={world.dataTokens}
                          trainingDurationPreview={{
                            trainingLaneTflops: world.trainingLaneTflops,
                            thermalThrottle: world.siteHealth.thermalThrottle,
                            powerThrottle: world.siteHealth.powerThrottle,
                          }}
                          trainingDurationMultiplier={world.playerProfile?.trainingDurationMultiplier ?? 1}
                          onStartPostTraining={world.onStartPostTraining}
                          onUnlockBaseModel={world.onUnlockBaseModel}
                          onLaunchLicensedBaseServe={world.onLaunchLicensedBaseServe}
                        />
                      )}
                      {activeTab === TABLET_APP_ID.inference && (
                        <InferenceApp
                          racks={world.racks}
                          computeAssignments={world.computeAssignments}
                          onAssignCard={world.onAssignCard}
                          onUnassignCard={world.onUnassignCard}
                          activeScrapeTier={world.activeScrapeTier}
                          scrapeSourceTokensPerToken={world.scrapeSourceTokensPerToken}
                          onSetScrapeTier={world.onSetScrapeTier}
                          servingMode={world.servingMode}
                          onSetServingMode={world.onSetServingMode}
                          userModels={world.userModels}
                          onServeModel={world.onServeModel}
                          onQuantizeModel={world.onQuantizeModel}
                          onQueueModelReveal={setRevealingModel}
                          tutorialStarted={tutorial.tutorialStarted}
                          tutorialCompleted={tutorial.tutorialCompleted}
                          tutorialStage={tutorial.tutorialStage}
                        />
                      )}
                      {activeTab === TABLET_APP_ID.stats && (
                        <StatsApp
                          servingIncomeRate={world.servingIncomeRate}
                          servingThroughputTps={world.servingThroughputTps}
                          siteHealth={world.siteHealth}
                          totalGpus={world.totalGpus}
                          trainingGpus={world.trainingGpus}
                          scrapingGpus={world.scrapingGpus}
                          servingGpus={world.servingGpus}
                          onOpenCoolingStore={
                            world.canEditGame
                              ? () => {
                                  openTab(TABLET_APP_ID.store);
                                  openStoreTab("cooling");
                                }
                              : undefined
                          }
                        />
                      )}
                      {activeTab === TABLET_APP_ID.store && (
                        <StoreScreen
                          activeStoreTab={activeStoreTab}
                          onBuyItem={((id: string) => (world.onBuyItem ? world.onBuyItem(id) : Promise.resolve(false))) as (itemId: string) => Promise<unknown>}
                          onUnlockResearch={((id: string) => (world.onUnlockResearch ? world.onUnlockResearch(id) : Promise.resolve(false))) as (itemId: string) => Promise<unknown>}
                          tutorialBench={tutorialBench}
                          money={world.money}
                          dataTokens={world.dataTokens}
                          researchUnlocks={world.game?.researchUnlocks}
                          shopItems={world.shopItems}
                          personalUpgrades={world.personalUpgrades}
                          onBuyPersonalUpgrade={world.onBuyPersonalUpgrade}
                          hardwareInventory={world.hardwareInventory}
                          racks={world.racks}
                          buildInventory={world.buildInventory}
                          placedBuildItems={world.placedBuildItems}
                          tutorialStarted={tutorial.tutorialStarted}
                          tutorialCompleted={tutorial.tutorialCompleted}
                          tutorialStage={tutorial.tutorialStage}
                          onPlaceOrder={world.onPlaceOrder}
                        />
                      )}
                      {activeTab === TABLET_APP_ID.storage && (
                        <StorageScreen
                          buildTabs={build.buildTabs}
                          activeBuildTab={build.activeBuildTab}
                          activeBuildItems={build.activeBuildItems}
                          buildInventory={build.buildInventory}
                          selectedBuildItem={build.selectedBuildItem}
                          selectedBuildItemIndex={build.selectedBuildItemIndex}
                          selectedBuildPriceLabel={build.selectedBuildPriceLabel}
                          buildPrimaryActionLabel={build.buildPrimaryActionLabel}
                          isBuildPrimaryActionDisabled={build.isBuildPrimaryActionDisabled}
                          isBuildTrashActionDisabled={build.isBuildTrashActionDisabled}
                          buildPlacementModeActive={build.buildPlacementModeActive}
                          placementPreview={build.placementPreview}
                          onConfirmPlacement={build.onConfirmPlacement}
                          onCycleBuildTab={build.onCycleBuildTab}
                          onSetBuildTab={build.onSetBuildTab}
                          onCycleBuildItem={build.onCycleBuildItem}
                          onSetBuildItemIndex={build.onSetBuildItemIndex}
                          onBuildPrimaryAction={build.onBuildPrimaryAction}
                          onBuildTrashAction={build.onBuildTrashAction}
                          onToggleTablet={toggleTablet}
                          tutorialStarted={tutorial.tutorialStarted}
                          tutorialCompleted={tutorial.tutorialCompleted}
                          tutorialStage={tutorial.tutorialStage}
                        />
                      )}
                      {activeTab === TABLET_APP_ID.map && (
                        <MapApp
                          money={world.money}
                          canEditGame={world.canEditGame}
                          localGameId={world.routeGameId}
                          claims={world.claims ?? []}
                          engine={world.engine}
                          onClaimCell={world.onClaimCell}
                        />
                      )}
                      {activeTab === TABLET_APP_ID.bills && (
                        <BillsApp
                          gameId={world.routeGameId}
                          playerId={world.playerId}
                          money={world.money}
                          canEditGame={world.canEditGame}
                        />
                      )}
                      {activeTab === TABLET_APP_ID.bot && <BotApp />}
                      {activeTab === TABLET_APP_ID.settings && (
                        <SettingsApp onExitToMenu={world.onSaveProgress} />
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className={GAME_TABLET_HOME_GRID_CLASS} hidden={activeTab !== null}>
                <LabGuide world={world} tutorial={tutorial} selection={goalSelection} />
                {!embedded && <NeighborhoodProject />}
                {TABLET_APPS.map((app) => {
                  const allowed = isAppAllowed(app.id);
                  const highlighted = lock !== null && lock.highlightedApp === app.id;

                  return (
                    <button
                      key={app.id}
                      onClick={() => openTab(app.id)}
                      disabled={!allowed}
                      className={tabletHomeAppButtonClass(allowed)}
                    >
                      {highlighted && activeTab === null && <TutorialArrow />}
                      <div
                        className={`${GAME_TABLET_APP_ICON_TILE_CLASS} ${app.color} ${highlighted ? "ring-2 ring-brand-teal/80" : ""}`}
                      >
                        <div className={GAME_TABLET_APP_ICON_GRADIENT_OVERLAY_CLASS} />
                        <div className={GAME_TABLET_APP_ICON_HIGHLIGHT_CLASS} />
                        <svg className={GAME_TABLET_APP_ICON_SVG_CLASS} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={app.icon} />
                        </svg>
                      </div>
                      <span className={GAME_TABLET_APP_LABEL_CLASS}>{app.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className={GAME_TABLET_SCAN_LINE_CLASS} />
            </div>
          </div>
        </div>
      </div>

      {revealingModel !== null &&
        createPortal(
          <ModelRevealOverlay
            model={revealingModel}
            onReveal={world.onRevealModel}
            onComplete={() => setRevealingModel(null)}
          />,
          document.body,
        )}
    </>
  );
}
