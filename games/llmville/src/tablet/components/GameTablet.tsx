/** @jsxImportSource @jgengine/core/ui/jsx */
/**
 * The tablet that slides up from the bottom: a status bar, the home grid of apps (with the lab guide
 * and community project), and the open app under a back/title header. It owns the whole tablet flow
 * so the home screen, app sheet and tutorial locks can be traced in one place.
 */
import { useState, type ReactNode } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneGlyph, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { useSettings } from "@jgengine/core/settings/settings.view";

import type { BuildViewModel } from "../../build/buildSession";
import type { ReadyWorldViewModel } from "../../runtime/worldViewModel";
import { TABLET_APP_ID, TABLET_APPS, useGameTabletFrame, type TabletAppShortcut } from "../tablet";
import type { TutorialViewModel } from "../../tutorial/tutorialRuntime";
import { useTabletNavContext } from "./tabletNav";
import { SettingsPanel } from "../../settings/components/SettingsPanel";
import { AllModelsApp } from "../../models/components/AllModelsApp";
import { InferenceApp } from "../../inference/components/InferenceApp";
import { StatsApp } from "../../stats/components/StatsApp";
import { MapApp } from "../../world/components/MapApp";
import { BotApp } from "./BotApp";
import { BillsApp } from "../../economy/components/BillsApp";
import ModelRevealOverlay, { type RevealingModelStats } from "../../models/components/ModelRevealOverlay";
import { StorageScreen } from "../../storage/components/StorageScreen";
import { StoreScreen } from "../../store/components/StoreScreen";
import { TabletStoreTabs } from "./TabletStoreTabs";
import { LabGuide, type LabGoalSelection } from "../../tutorial/components/LabGuide";
import { NeighborhoodProject } from "../../community/components/NeighborhoodProject";
import { Button, C, FULL, Icon, Row, Stack, Text } from "../../ui/kit";
import { DISPLAY } from "../../ui/theme";
import { TutorialArrow } from "../../ui/shop";

interface GameTabletProps {
  world: ReadyWorldViewModel;
  build: BuildViewModel;
  tutorial: TutorialViewModel;
  isTouch: boolean;
  /** When true, the tablet is scoped to a dev preview frame instead of the screen. */
  embedded?: boolean;
  goalSelection?: LabGoalSelection;
}

/** Each app tile's colour, in the order of `TABLET_APPS`. */
/** The app's line icon as glyph artwork (its stroke path in a 24-unit box). */
function appArtwork(app: TabletAppShortcut): string {
  return `<path d="${app.icon}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** A home-screen app: a coloured rounded tile with its icon and name; the tutorial can point at it. */
function AppTile({ app, allowed, highlighted, onOpen }: { app: TabletAppShortcut; allowed: boolean; highlighted: boolean; onOpen: () => void }) {
  return <RuneAction label={`Open ${app.label}`} disabled={!allowed} run={onOpen} items="center" gap={6} padding={4} radius={16} hover="#ffffff0d" press="#00000033" opacity={allowed ? 1 : 0.35}>
    {highlighted ? <TutorialArrow /> : null}
    <RuneView width={56} height={56} radius={16} fill={app.color} justify="center" items="center"
      gradient={{ angle: 180, stops: [[0, "#ffffff33"], [1, "#00000033"]] }} {...(highlighted ? { border: { width: 2, color: C.teal } } : {})}>
      <RuneGlyph artwork={appArtwork(app)} size={28} color="#ffffff" />
    </RuneView>
    <Text size={11} weight={700} align="center">{app.label}</Text>
  </RuneAction>;
}

/** The clock and date from the game's calendar, or the phone-ad time before one exists. */
function StatusBar({ world }: { world: ReadyWorldViewModel }) {
  return <Row justify="between" width={FULL} padding={[6, 18, 6, 18]}>
    <Row gap={8}>
      <Text size={13} weight={800}>{world.gameTime ? world.gameTime.formattedTime : "9:41"}</Text>
      <Text size={12} color={C.muted}>{world.gameTime ? `${world.gameTime.monthName} ${world.gameTime.dayOfMonth}` : "—"}</Text>
    </Row>
    <Row gap={6}>
      <Icon name="cpu" size={14} />
      <RuneView width={24} height={12} radius={3} border={{ width: 1, color: "#ffffffaa" }} padding={1}><RuneView height={8} width={18} radius={1} fill="#ffffff" /></RuneView>
    </Row>
  </Row>;
}

export function GameTablet({ world, build, tutorial, isTouch, embedded = false, goalSelection }: GameTabletProps) {
  const nav = useTabletNavContext();
  const { width, height } = useRuneViewport();
  const { activeTab, activeStoreTab, collapsed, lock, tutorialBench, isAppAllowed, isStoreTabAllowed, openTab, openStoreTab, isModelsTheme, headerTitle, openTabletHome, toggleTablet } =
    useGameTabletFrame({ world, tutorial, nav, isTouch });
  const [revealingModel, setRevealingModel] = useState<RevealingModelStats | null>(null);
  const settings = useSettings();
  const phone = width < 640;
  const tabletWidth = phone ? width : Math.min(760, width - 48);
  const tabletHeight = phone ? Math.round(height * 0.92) : Math.min(820, height - 48);

  const reveal = revealingModel === null ? null : <ModelRevealOverlay model={revealingModel} onReveal={world.onRevealModel} onComplete={() => setRevealingModel(null)} />;
  if (collapsed) {
    return <>
      {isTouch ? <RuneView anchor="bottom" safe>
        <RuneAction label="Open tablet" run={openTabletHome} width={144} height={44} items="center" justify="end" padding={[0, 0, 10, 0]}
          onDrag={(gesture) => { if (gesture.phase === "up" && !gesture.cancelled && gesture.y < 0) openTabletHome(); }}>
          <RuneView width={48} height={6} radius={3} fill="#ffffff59" />
        </RuneAction>
      </RuneView> : null}
      {reveal}
    </>;
  }

  let app: ReactNode = null;
  if (activeTab === TABLET_APP_ID.models) app = <AllModelsApp
    tutorialStarted={tutorial.tutorialStarted} tutorialCompleted={tutorial.tutorialCompleted} tutorialStage={tutorial.tutorialStage}
    baseModelLibrary={world.baseModelLibrary} isTraining={world.isTraining} trainingEndsAt={world.activeTraining?.endTime ?? null}
    trainingBaseModelId={world.activeTraining?.baseModelId ?? null} lastUnlockedBaseModelId={world.lastUnlockedBaseModelId}
    postTrainError={world.postTrainError} onDismissPostTrainError={world.onDismissPostTrainError} dataTokens={world.dataTokens}
    trainingDurationPreview={{ trainingLaneTflops: world.trainingLaneTflops, thermalThrottle: world.siteHealth.thermalThrottle, powerThrottle: world.siteHealth.powerThrottle }}
    trainingDurationMultiplier={world.playerProfile?.trainingDurationMultiplier ?? 1}
    onStartPostTraining={world.onStartPostTraining} onUnlockBaseModel={world.onUnlockBaseModel} onLaunchLicensedBaseServe={world.onLaunchLicensedBaseServe} />;
  else if (activeTab === TABLET_APP_ID.inference) app = <InferenceApp
    racks={world.racks} computeAssignments={world.computeAssignments} onAssignCard={world.onAssignCard} onUnassignCard={world.onUnassignCard}
    activeScrapeTier={world.activeScrapeTier} scrapeSourceTokensPerToken={world.scrapeSourceTokensPerToken} onSetScrapeTier={world.onSetScrapeTier}
    servingMode={world.servingMode} onSetServingMode={world.onSetServingMode} userModels={world.userModels} onServeModel={world.onServeModel}
    onQuantizeModel={world.onQuantizeModel} onQueueModelReveal={setRevealingModel}
    tutorialStarted={tutorial.tutorialStarted} tutorialCompleted={tutorial.tutorialCompleted} tutorialStage={tutorial.tutorialStage} />;
  else if (activeTab === TABLET_APP_ID.stats) app = <StatsApp
    servingIncomeRate={world.servingIncomeRate} servingThroughputTps={world.servingThroughputTps} siteHealth={world.siteHealth}
    totalGpus={world.totalGpus} trainingGpus={world.trainingGpus} scrapingGpus={world.scrapingGpus} servingGpus={world.servingGpus}
    onOpenCoolingStore={world.canEditGame ? () => { openTab(TABLET_APP_ID.store); openStoreTab("cooling"); } : undefined} />;
  else if (activeTab === TABLET_APP_ID.store) app = <StoreScreen
    activeStoreTab={activeStoreTab}
    onBuyItem={(id) => (world.onBuyItem ? world.onBuyItem(id) : Promise.resolve(false))}
    onUnlockResearch={(id) => world.onUnlockResearch?.(id) ?? Promise.resolve(false)}
    tutorialBench={tutorialBench} money={world.money} dataTokens={world.dataTokens} researchUnlocks={world.game?.researchUnlocks}
    shopItems={world.shopItems} personalUpgrades={world.personalUpgrades} onBuyPersonalUpgrade={world.onBuyPersonalUpgrade}
    hardwareInventory={world.hardwareInventory} racks={world.racks} buildInventory={world.buildInventory} placedBuildItems={world.placedBuildItems}
    tutorialStarted={tutorial.tutorialStarted} tutorialCompleted={tutorial.tutorialCompleted} tutorialStage={tutorial.tutorialStage} onPlaceOrder={world.onPlaceOrder} />;
  else if (activeTab === TABLET_APP_ID.storage) app = <StorageScreen
    buildTabs={build.buildTabs} activeBuildTab={build.activeBuildTab} activeBuildItems={build.activeBuildItems} buildInventory={build.buildInventory}
    selectedBuildItem={build.selectedBuildItem} selectedBuildItemIndex={build.selectedBuildItemIndex} selectedBuildPriceLabel={build.selectedBuildPriceLabel}
    buildPrimaryActionLabel={build.buildPrimaryActionLabel} isBuildPrimaryActionDisabled={build.isBuildPrimaryActionDisabled}
    isBuildTrashActionDisabled={build.isBuildTrashActionDisabled} buildPlacementModeActive={build.buildPlacementModeActive}
    placementPreview={build.placementPreview} onConfirmPlacement={build.onConfirmPlacement} onCycleBuildTab={build.onCycleBuildTab}
    onSetBuildTab={build.onSetBuildTab} onCycleBuildItem={build.onCycleBuildItem} onSetBuildItemIndex={build.onSetBuildItemIndex}
    onBuildPrimaryAction={build.onBuildPrimaryAction} onBuildTrashAction={build.onBuildTrashAction} onToggleTablet={toggleTablet}
    tutorialStarted={tutorial.tutorialStarted} tutorialCompleted={tutorial.tutorialCompleted} tutorialStage={tutorial.tutorialStage} />;
  else if (activeTab === TABLET_APP_ID.map) app = <MapApp money={world.money} canEditGame={world.canEditGame} localGameId={world.routeGameId}
    claims={world.claims ?? []} engine={world.engine} onClaimCell={world.onClaimCell} />;
  else if (activeTab === TABLET_APP_ID.bills) app = <BillsApp gameId={world.routeGameId} playerId={world.playerId} money={world.money} canEditGame={world.canEditGame} />;
  else if (activeTab === TABLET_APP_ID.bot) app = <BotApp />;
  else if (activeTab === TABLET_APP_ID.settings) app = <Stack gap={12} width={FULL}>
    <Row justify="end" width={FULL}><Button tone="ghost" onPress={world.onSaveProgress}>Main Menu</Button></Row>
    <SettingsPanel categories={settings.categories} />
  </Stack>;

  const body = activeTab === null
    ? <RuneView scroll grow={1} width={FULL} padding={[12, 16, 24, 16]} gap={16}>
      <LabGuide world={world} tutorial={tutorial} selection={goalSelection} />
      {embedded ? null : <NeighborhoodProject />}
      <RuneView layout="grid" columns={phone ? 3 : 4} gap={12} width={FULL}>
        {TABLET_APPS.map((entry) => <AppTile key={entry.id} app={entry} allowed={isAppAllowed(entry.id)} highlighted={lock !== null && lock.highlightedApp === entry.id} onOpen={() => openTab(entry.id)} />)}
      </RuneView>
    </RuneView>
    : <RuneView grow={1} width={FULL} fill={isModelsTheme ? "#1c1a22" : C.ink} gap={0}>
      <Row gap={10} width={FULL} padding={[10, 16, 10, 12]} fill={isModelsTheme ? "#25212e" : "#1f2b28"}>
        <Button tone="ghost" minHeight={36} padding={6} label="Back to tablet home" onPress={openTabletHome}><Icon name="back" size={18} /></Button>
        <Text family={DISPLAY} size={20} weight={800} grow={1}>{headerTitle}</Text>
        {world.spendPulse != null && world.spendPulse.amount > 0 ? <Text key={world.spendPulse.token} size={13} weight={800} color={C.coral}>{`-$${world.spendPulse.amount.toLocaleString()}`}</Text> : null}
      </Row>
      {activeTab === TABLET_APP_ID.store ? <TabletStoreTabs activeStoreTab={activeStoreTab} tutorialLock={lock} isStoreTabAllowed={isStoreTabAllowed} onOpenStoreTab={openStoreTab} /> : null}
      <RuneView scroll grow={1} width={FULL} padding={[12, 16, 24, 16]} gap={12}>{app}</RuneView>
    </RuneView>;

  return <>
    <RuneView anchor={embedded ? "fill" : "bottom"} {...(embedded ? {} : { safe: true })} modal onBack={nav.closeMenu} label="Tablet" role="dialog">
      <RuneView width={tabletWidth} height={tabletHeight} radius={phone ? 0 : 28} fill="#0b0f0e" border={{ width: phone ? 0 : 10, color: "#1d2321" }} clip gap={0}
        shadow={{ y: 24, blur: 60, color: "#000000aa" }}>
        <RuneAction label="Close tablet" run={nav.closeMenu} width={FULL} height={24} items="center" justify="center"
          onDrag={(gesture) => { if (gesture.phase === "up" && !gesture.cancelled && gesture.y > gesture.height) nav.closeMenu(); }}>
          <RuneView width={56} height={5} radius={3} fill="#ffffff40" />
        </RuneAction>
        <StatusBar world={world} />
        {body}
      </RuneView>
    </RuneView>
    {reveal}
  </>;
}
