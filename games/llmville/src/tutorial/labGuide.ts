import { getBaseModelDefinition } from "@llmville/game/models/baseModels";
import { STARTER_RACK_CATALOG_ID } from "@llmville/game/infrastructure/catalog";
import { TUTORIAL_TRAIN_BASE_MODEL_ID } from "@llmville/game/tutorial/tutorialProgress";
import { DEFAULT_STARTING_MONEY } from "@llmville/game/world/worldBootstrap";

import type { ReadyWorldViewModel } from "../runtime/worldViewModel";
import { engineActions } from "../runtime/gameEngine";
import type { TabletNavState } from "../tablet/tablet";
import type { TabletAppId, TabletStoreTabId } from "../tablet/tabletIds";
import type { TutorialViewModel } from "./tutorialRuntime";

export interface LabGoalSelection {
  id: string | null;
  select: (id: string) => void;
}

export interface LabGoal {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  action: () => void;
  label: string;
}

/** What the lab guide says now: the tutorial step, or the next open goal, and the one action that moves it on. */
export interface LabGuideState {
  heading: string;
  /** Tutorial step and total while the tutorial runs. */
  step: { step: number; total: number } | null;
  title: string;
  detail: string;
  label: string;
  action: () => void;
  goals: readonly LabGoal[];
  goal: LabGoal | undefined;
}

type GuideNav = Pick<TabletNavState, "closeMenu" | "openTabletApp" | "openMenu">;

/** The guide's words and action for this world, tutorial and chosen goal. */
export function labGuideState(world: ReadyWorldViewModel, tutorial: TutorialViewModel, nav: GuideNav, chosenGoal: string | null): LabGuideState {
  const placeStarterRack = () => {
    world.engine.dispatch(engineActions.startPlacementDraft(STARTER_RACK_CATALOG_ID));
    nav.closeMenu();
  };
  const open = (app: TabletAppId, storeTab?: TabletStoreTabId) => {
    tutorial.onTabletAppOpened(app);
    nav.openTabletApp(app, storeTab);
    if (storeTab) tutorial.onTabletStoreTabOpened(storeTab);
  };
  const requiredData = getBaseModelDefinition(TUTORIAL_TRAIN_BASE_MODEL_ID)?.requiredDataTokens ?? 0;
  const goals: LabGoal[] = [
    { id: "income", title: "First earnings", detail: "Serve a model and assign enough GPU memory to earn income.", done: world.servingIncomeRate > 0, action: () => open("inference"), label: "Set up serving" },
    { id: "models", title: "Model collection", detail: "Train or license a second model. Compare its stats and choose what to serve.", done: world.userModels.length >= 2, action: () => open("models"), label: "Find your next model" },
    { id: "expand", title: "Room to grow", detail: "Place another item beside your lab to grow its tiled footprint.", done: world.racks.length + world.placedBuildItems.length >= 2, action: () => open("store", "infrastructure"), label: "Find your next addition" },
    { id: "decorate", title: "Make it yours", detail: "Place three decorations to give your lab some personality.", done: world.placedBuildItems.length >= 3, action: () => open("store", "decor"), label: "Choose decorations" },
  ];
  const goal = goals.find((entry) => entry.id === chosenGoal && !entry.done) ?? goals.find((entry) => !entry.done);
  let title = goal?.title ?? "A lab to be proud of";
  let detail = goal?.detail ?? "Your lab is growing. Meet a neighbor, compare models, or redesign your space.";
  let label = goal?.label ?? "Explore the neighborhood";
  let action = goal?.action ?? (() => open("map"));
  if (!tutorial.tutorialCompleted) {
    detail = tutorial.tutorialHint?.text ?? "Build a rack, collect data, train a model, and earn your first income.";
    switch (tutorial.tutorialStage) {
      case "open_tablet":
      case "place_rack": {
        const owned = (world.buildInventory[STARTER_RACK_CATALOG_ID] ?? 0) > 0;
        title = "Give your GPUs a home";
        detail = owned ? "Place your rack in an open space. Its footprint establishes your plot; placing more items adds tiles around them." : `You start with $${DEFAULT_STARTING_MONEY.toLocaleString()}. Buy a rack in the Store, then choose where to place it and start your plot.`;
        label = owned ? "Place your rack" : "Shop for a rack";
        action = owned ? placeStarterRack : () => open("store", "infrastructure");
        break;
      }
      case "buy_gpus":
        title = "Power up your lab";
        label = "Shop for GPUs";
        action = () => open("store", "hardware");
        break;
      case "install_gpus":
        title = "Put your GPUs to work";
        label = "Install GPUs";
        action = () => { if (world.racks[0]) nav.openMenu({ type: "rack-config", rackId: world.racks[0].id }); };
        break;
      case "license_scraper":
        title = "Meet your first model";
        detail = "License Alpaca 1 for $200 to collect data faster and complete this step.";
        label = "Open model library";
        action = () => open("models");
        break;
      case "scrape_tokens":
        title = "Collect your first dataset";
        detail = `${Math.min(requiredData, Math.floor(world.dataTokens)).toLocaleString()} / ${requiredData.toLocaleString()} data tokens. Assign a GPU to Collect data; it gathers tokens automatically.`;
        label = "Collect data";
        action = () => open("inference");
        break;
      case "fine_tune":
        title = world.isTraining ? "Your model is learning" : "Train something of your own";
        detail = world.isTraining ? "Training uses the GPUs in the Training lane. You can decorate or chat while it runs." : world.dataTokens < requiredData ? `Collect ${Math.ceil(requiredData - world.dataTokens).toLocaleString()} more data tokens for Llamma 3.` : world.trainingGpus === 0 ? "Assign a GPU to Training, then start a training run in Train models." : "Start a Llamma 3 training run. Review the data cost and estimated time before you commit.";
        label = world.dataTokens < requiredData ? "Collect more data" : world.trainingGpus === 0 ? "Assign a training GPU" : "Train models";
        action = () => open(world.dataTokens < requiredData || world.trainingGpus === 0 ? "inference" : "models");
        break;
      case "reveal_model":
        title = "Your first model is ready!";
        detail = "Reveal its stats, then put it to work earning income.";
        label = "Reveal your model";
        action = () => open("inference");
        break;
      case "serve":
        title = "Make your first earnings";
        detail = "Serve your model, then assign GPUs with enough memory. Income starts when the model has compute.";
        label = "Start earning";
        action = () => open("inference");
        break;
    }
  }
  if (tutorial.tutorialCompleted && world.isTraining && world.trainingGpus === 0) {
    title = "Training needs a GPU";
    detail = "Your training run is paused. Move a GPU to the Training lane to continue.";
    label = "Assign a GPU";
    action = () => open("inference");
  } else if (tutorial.tutorialCompleted && world.siteHealth.thermalThrottle < 1 && world.siteHealth.heatLoadKw > world.siteHealth.coolingCapacityKw) {
    title = "Your lab needs cooling";
    detail = "Heat is slowing your GPUs. Add cooling to recover performance.";
    label = "Choose cooling";
    action = () => open("store", "cooling");
  }
  const hint = tutorial.tutorialHint;
  return {
    heading: tutorial.tutorialCompleted ? "Your next chapter" : "Your first earning model",
    step: !tutorial.tutorialCompleted && hint ? { step: hint.step, total: hint.total } : null,
    title, detail, label, action, goals, goal,
  };
}
