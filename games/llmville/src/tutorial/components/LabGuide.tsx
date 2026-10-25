import { useState } from "react";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { getBaseModelDefinition } from "@llmville/game/models/baseModels";
import { STARTER_RACK_CATALOG_ID } from "@llmville/game/infrastructure/catalog";
import { TUTORIAL_TRAIN_BASE_MODEL_ID } from "@llmville/game/tutorial/tutorialProgress";
import type { ReadyWorldViewModel } from "@/runtime/worldViewModel";
import type { TutorialViewModel } from "@/tutorial/tutorialRuntime";
import { useTabletNavContext } from "@/tablet/components/tabletNav";
import type { TabletAppId, TabletStoreTabId } from "@/tablet/tabletIds";
import { engineActions } from "@/runtime/gameEngine";
import { DEFAULT_STARTING_MONEY } from "@llmville/game/world/worldBootstrap";

export interface LabGoalSelection {
  id: string | null;
  select: (id: string) => void;
}

export function LabGuide({ world, tutorial, compact = false, selection }: { world: ReadyWorldViewModel; tutorial: TutorialViewModel; compact?: boolean; selection?: LabGoalSelection }) {
  const nav = useTabletNavContext();
  const [localGoal, setLocalGoal] = useState<string | null>(null);
  const chosenGoal = selection?.id ?? localGoal;
  const setChosenGoal = selection?.select ?? setLocalGoal;
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
  const models = world.userModels;
  const goals = [
    { id: "income", title: "First earnings", detail: "Serve a model and assign enough GPU memory to earn income.", done: world.servingIncomeRate > 0, action: () => open("inference"), label: "Set up serving" },
    { id: "models", title: "Model collection", detail: "Train or license a second model. Compare its stats and choose what to serve.", done: models.length >= 2, action: () => open("models"), label: "Find your next model" },
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
  return (
    <section aria-label="Lab guide" className={`rounded-2xl border border-brand-teal/25 bg-brand-ink/95 p-4 text-brand-cream shadow-lg ${compact ? "w-full" : "col-span-full"}`}>
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-brand-teal"><span className="flex items-center gap-2"><Sparkles size={14} />{tutorial.tutorialCompleted ? "Your next chapter" : "Your first earning model"}</span>{!tutorial.tutorialCompleted && tutorial.tutorialHint && <span>{tutorial.tutorialHint.step} / {tutorial.tutorialHint.total}</span>}</div>
      {!tutorial.tutorialCompleted && tutorial.tutorialHint && <progress aria-label="Tutorial progress" max={tutorial.tutorialHint.total} value={tutorial.tutorialHint.step - 1} className="mb-2 h-1 w-full accent-brand-teal" />}
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-brand-cream-dim">{detail}</p>
      <button type="button" disabled={!world.canEditGame} onClick={action} className="mt-3 flex min-h-10 w-full items-center justify-between gap-2 rounded-xl bg-brand-coral px-3 py-2 text-sm font-semibold text-brand-ink hover:brightness-110 disabled:opacity-40">{label}<ArrowRight size={16} /></button>
      {!compact && tutorial.tutorialCompleted && <div className="mt-4 grid grid-cols-2 gap-2">{goals.map((entry) => <button key={entry.id} type="button" onClick={() => setChosenGoal(entry.id)} aria-pressed={goal?.id === entry.id} className={`rounded-xl border p-2 text-left text-xs ${entry.done ? "border-brand-teal/30 text-brand-teal" : goal?.id === entry.id ? "border-brand-coral text-brand-cream" : "border-white/10 text-brand-cream-dim"}`}><span className="flex items-center gap-1">{entry.done && <Check size={12} />}{entry.title}</span></button>)}</div>}
    </section>
  );
}
