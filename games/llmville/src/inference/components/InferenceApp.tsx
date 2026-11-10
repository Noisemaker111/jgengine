/**
 * Inference app — drag installed GPU cards onto Training, Scraping, or a specific serving model to
 * dedicate them. Replaces the old ratio-based Dashboard: each physical card is a draggable chip, and
 * a card's full stats belong to exactly one job (see `computeAssignments.ts`).
 */
import { KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";
import { useCallback, useMemo, useState } from "@jgengine/core/ui/jsx";
import { DragGhost, DraggableCard, DropZone, useDragLayer, type DragLayer } from "@jgengine/core/inventory/dragLayer.view";

import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import type { PlacedRack } from "../../infrastructure/infrastructure";
import { placedRackAssignmentInputs } from "../../infrastructure/infrastructure";
import {
  assignmentKey,
  computeAssignmentStats,
  type ComputeAssignmentMap,
  type ComputeLane,
} from "@llmville/game/infrastructure/infrastructure";
import { getRackInstalledHardwareSlots } from "@llmville/game/infrastructure/infrastructure";
import { getHardwareDefinition, type ComputePrecision, type HardwareModelId } from "@llmville/game/infrastructure/catalog";
import { SERVING_MODE_PROFILES, SERVING_MODE_VALUES, type ServingModeId } from "@llmville/game/models/servingMode";
import {
  getScrapeTierDef,
  computeScrapeTokensPerProc,
  isScrapeTierRunnable,
  SCRAPE_TICK_INTERVAL_MS,
  SCRAPE_TIER_LIST,
  type ScrapeTierId,
} from "@llmville/game/models/scrapingTiers";
import type { TutorialStage } from "@llmville/game/tutorial/tutorialStages";

import { cn } from "../../kit/cn";
import RackSlot from "../../infrastructure/components/RackSlot";
import { RevealedModelCard, UnknownModelCard } from "../../models/components/ModelCard";
import { ModelDetailView } from "../../models/components/ModelDetailView";
import type { RevealingModelStats } from "../../models/components/ModelRevealOverlay";
import { userModelTrainingVolumeLabel, type GameUserModel } from "../../models/models";

interface InferenceAppProps {
  racks: readonly PlacedRack[];
  computeAssignments: ComputeAssignmentMap;
  onAssignCard: (rackId: string, slotIndex: number, lane: ComputeLane, targetModelId?: Id<"models">) => void;
  onUnassignCard: (rackId: string, slotIndex: number) => void;
  activeScrapeTier: ScrapeTierId;
  scrapeSourceTokensPerToken: number;
  onSetScrapeTier: (tier: ScrapeTierId) => void;
  servingMode: ServingModeId;
  onSetServingMode: (mode: ServingModeId) => void;
  userModels: readonly GameUserModel[];
  onServeModel: (modelId: GameUserModel["id"]) => void | Promise<unknown> | undefined;
  onQuantizeModel: (modelId: GameUserModel["id"], precision: ComputePrecision) => void | Promise<unknown> | undefined;
  onQueueModelReveal: (model: RevealingModelStats) => void;
  tutorialStarted: boolean;
  tutorialCompleted: boolean;
  tutorialStage: TutorialStage;
}

interface InstalledCard {
  key: string;
  rackId: string;
  slotIndex: number;
  hardwareModelId: HardwareModelId;
  lane: ComputeLane | null;
  targetModelId?: string | undefined;
}

type ChipDragData = { rackId: string; slotIndex: number; hardwareModelId: HardwareModelId };

function ComputeChip({ card, layer }: { card: InstalledCard; layer: DragLayer<ChipDragData> }) {
  return (
    <DraggableCard
      id={card.key}
      value={{ rackId: card.rackId, slotIndex: card.slotIndex, hardwareModelId: card.hardwareModelId }}
      layer={layer}
      onRotate={false}
      className="w-[180px] shrink-0 cursor-grab transition-opacity active:cursor-grabbing data-[dragging]:opacity-30"
    >
      <RackSlot hardwareModelId={card.hardwareModelId} useExternalDrag />
    </DraggableCard>
  );
}

function DropLane({ id, cards, emptyLabel, layer }: { id: string; cards: InstalledCard[]; emptyLabel: string; layer: DragLayer<ChipDragData> }) {
  return (
    <DropZone
      id={id}
      layer={layer}
      className="flex min-h-[76px] flex-wrap items-center gap-2 rounded-[var(--kit-r-field)] border-2 border-dashed border-[var(--kit-line)] p-2 transition-colors"
      activeClassName="border-brand-teal/60 bg-brand-teal/5"
    >
      {cards.length === 0 ? (
        <p className="w-full py-4 text-center text-[11px] text-brand-cream/40">{emptyLabel}</p>
      ) : (
        cards.map((card) => <ComputeChip key={card.key} card={card} layer={layer} />)
      )}
    </DropZone>
  );
}

export function InferenceApp({
  racks,
  computeAssignments,
  onAssignCard,
  onUnassignCard,
  activeScrapeTier,
  scrapeSourceTokensPerToken,
  onSetScrapeTier,
  servingMode,
  onSetServingMode,
  userModels,
  onServeModel,
  onQuantizeModel,
  onQueueModelReveal,
  tutorialStarted,
  tutorialCompleted,
  tutorialStage,
}: InferenceAppProps) {
  const [detailModel, setDetailModel] = useState<GameUserModel | null>(null);
  const [detailBaseModelId, setDetailBaseModelId] = useState<string | null>(null);

  const installedCards = useMemo<InstalledCard[]>(() => {
    const cards: InstalledCard[] = [];
    for (const rack of racks) {
      const slots = getRackInstalledHardwareSlots(rack);
      slots.forEach((hardwareModelId, slotIndex) => {
        if (hardwareModelId === null) return;
        const key = assignmentKey(rack.id, slotIndex);
        const assignment = computeAssignments[key];
        cards.push({
          key,
          rackId: rack.id,
          slotIndex,
          hardwareModelId,
          lane: assignment?.lane ?? null,
          targetModelId: assignment?.targetModelId,
        });
      });
    }
    return cards;
  }, [racks, computeAssignments]);

  const undedicatedCards = useMemo(() => installedCards.filter((card) => card.lane === null), [installedCards]);
  const trainingCards = useMemo(() => installedCards.filter((card) => card.lane === "training"), [installedCards]);
  const scrapingCards = useMemo(() => installedCards.filter((card) => card.lane === "scraping"), [installedCards]);
  const servingCardsByModel = useMemo(() => {
    const map = new Map<string, InstalledCard[]>();
    for (const card of installedCards) {
      if (card.lane === "serving" && card.targetModelId) {
        const list = map.get(card.targetModelId) ?? [];
        list.push(card);
        map.set(card.targetModelId, list);
      }
    }
    return map;
  }, [installedCards]);

  const assignmentStats = useMemo(
    () => computeAssignmentStats(placedRackAssignmentInputs(racks), computeAssignments),
    [racks, computeAssignments],
  );

  const servingModels = useMemo(() => userModels.filter((model) => model.launchState === "serving"), [userModels]);

  const drag = useDragLayer<ChipDragData>({
    onDrop({ payload, target }) {
      if (target === null) return;
      const { rackId, slotIndex } = payload.value;
      if (target === "undedicated") {
        onUnassignCard(rackId, slotIndex);
      } else if (target === "lane:training") {
        onAssignCard(rackId, slotIndex, "training");
      } else if (target === "lane:scraping") {
        onAssignCard(rackId, slotIndex, "scraping");
      } else if (target.startsWith("serving:")) {
        onAssignCard(rackId, slotIndex, "serving", target.slice("serving:".length) as Id<"models">);
      }
    },
  });

  const scrapeTflops = assignmentStats.scraping.tflops;

  return (
    <>
      <div className="flex animate-in fade-in slide-in-from-bottom-4 flex-col gap-6 pb-24 duration-300">
        <KitPanel data-shell="inset"
          eyebrow="Available GPUs"
          aside={<span className="flex flex-col gap-3 text-[10px] font-semibold text-brand-cream/45">{undedicatedCards.length} undedicated</span>}
        >
          <p className="text-[11px] leading-snug text-brand-cream/45">
            Choose a job for each GPU below, or drag its card onto a lane. Each GPU works on one job at a time.
          </p>
          <DropLane layer={drag} id="undedicated" cards={undedicatedCards} emptyLabel="Every installed GPU is dedicated." />
          <div className="space-y-2">
            {installedCards.map((card) => (
              <label key={card.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 p-2 text-xs">
                <span>{getHardwareDefinition(card.hardwareModelId).name} · slot {card.slotIndex + 1}</span>
                <select aria-label={`Job for ${card.hardwareModelId}, slot ${card.slotIndex + 1}`} className="max-w-full rounded-lg border border-white/15 bg-brand-ink px-2 py-2 text-brand-cream" value={card.lane === "serving" ? `serving:${card.targetModelId}` : card.lane ?? "idle"} onChange={(event) => {
                  const value = event.target.value;
                  if (value === "idle") onUnassignCard(card.rackId, card.slotIndex);
                  else if (value === "training" || value === "scraping") onAssignCard(card.rackId, card.slotIndex, value);
                  else onAssignCard(card.rackId, card.slotIndex, "serving", value.slice(8) as Id<"models">);
                }}>
                  <option value="idle">Available</option>
                  <option value="training">Train models</option>
                  <option value="scraping">Collect data</option>
                  {servingModels.map((model) => <option key={model.id} value={`serving:${model.id}`}>Serve {model.name}</option>)}
                </select>
              </label>
            ))}
          </div>
        </KitPanel>

        <KitPanel data-shell="inset" className="flex flex-col gap-3" eyebrow="Training" aside={<span className="llm-token llm-token--teal">{Math.round(assignmentStats.training.tflops)} TFLOPS</span>}>
          <p className="text-[11px] leading-snug text-brand-cream/45">GPUs here train your base model — more TFLOPs, faster runs.</p>
          <DropLane layer={drag} id="lane:training" cards={trainingCards} emptyLabel="Drag a GPU here to train." />
        </KitPanel>

        <div
          className={
            tutorialStarted && !tutorialCompleted && tutorialStage === "scrape_tokens"
              ? "rounded-[var(--kit-r-field)] ring-2 ring-brand-amber/80 ring-offset-2 ring-offset-brand-ink"
              : undefined
          }
        >
          {tutorialStarted && !tutorialCompleted && tutorialStage === "scrape_tokens" && (
            <p className="mb-2 text-xs leading-snug text-brand-amber/90">
              Collect data to train your first model. Assign a GPU below and tokens arrive automatically.
            </p>
          )}
          <KitPanel data-shell="inset" className="flex flex-col gap-3" eyebrow="Collect data" aside={<span className="llm-token llm-token--amber">{Math.round(scrapeTflops)} TFLOPS</span>}>
            <div className="game-control-group">
              {SCRAPE_TIER_LIST.map((tierDef) => {
                const active = activeScrapeTier === tierDef.id;
                const runnable = isScrapeTierRunnable(tierDef.id, scrapeTflops);
                return (
                  <button
                    key={tierDef.id}
                    type="button"
                    onClick={() => {
                      if (!active && runnable) onSetScrapeTier(tierDef.id);
                    }}
                    disabled={active || !runnable}
                    className={cn("game-control-segment", active && "game-control-segment-active")}
                  >
                    <span className="block text-xs font-bold">{tierDef.label}</span>
                    <span className="mt-0.5 block text-[9px] font-semibold tabular-nums opacity-80">
                      +{computeScrapeTokensPerProc(tierDef.id, scrapeTflops, scrapeSourceTokensPerToken)} /{" "}
                      {SCRAPE_TICK_INTERVAL_MS / 1000}s
                    </span>
                    {!runnable && (
                      <span className="mt-0.5 block text-[9px] font-semibold text-brand-coral/80">
                        Needs {tierDef.tflopThreshold} scraping TFLOPS
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] leading-snug text-brand-cream/45">{getScrapeTierDef(activeScrapeTier).description}</p>
            <DropLane layer={drag} id="lane:scraping" cards={scrapingCards} emptyLabel="Drag a GPU here to scrape data tokens." />
          </KitPanel>
        </div>

        <KitPanel data-shell="inset" className="flex flex-col gap-3" eyebrow="Serving">
          <p className="text-[11px] leading-snug text-brand-cream/45">
            Serve a model in the deck below, then drag GPUs onto it here — its VRAM and TFLOPs come only from the cards
            you dedicate to it.
          </p>
          {servingModels.length === 0 ? (
            <KitPanel data-shell="inset" className="py-6 text-center text-sm text-brand-cream/45">
              No models are serving yet. Reveal and serve a model in the deck below.
            </KitPanel>
          ) : (
            <div className="flex flex-col gap-3">
              {servingModels.map((model) => {
                const bound = servingCardsByModel.get(model.id) ?? [];
                const boundStats = assignmentStats.servingByModel.get(model.id);
                const boundVramGb = boundStats?.vramGb ?? 0;
                const boundTflops = boundStats?.tflops ?? 0;
                const fits = boundVramGb + 1e-6 >= model.footprintGb;
                return (
                  <div key={model.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-brand-cream">{model.name}</p>
                      <div className="flex items-center gap-1.5">
                        <span className="llm-token llm-token--teal">{Math.round(boundTflops)} TFLOPS</span>
                        <span className={`llm-token llm-token--${fits ? "muted" : "coral"}`}>
                          {Math.round(boundVramGb)}/{Math.round(model.footprintGb)} GB
                        </span>
                      </div>
                    </div>
                    <DropLane layer={drag} id={`serving:${model.id}`} cards={bound} emptyLabel="Drag a GPU here to serve this model." />
                    {!fits && <p role="status" className="text-xs text-brand-coral">Needs {(model.footprintGb - boundVramGb).toFixed(1)} GB more GPU memory to earn income. Assign another GPU or choose a supported lower precision.</p>}
                  </div>
                );
              })}
            </div>
          )}
        </KitPanel>

        <KitPanel data-shell="inset"
          eyebrow="Serving mode"
          aside={<span className="flex flex-col gap-3 text-[10px] font-semibold text-brand-cream/45">{SERVING_MODE_PROFILES[servingMode].latencyLabel}</span>}
        >
          <div className="game-control-group">
            {SERVING_MODE_VALUES.map((mode) => {
              const profile = SERVING_MODE_PROFILES[mode];
              const active = servingMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    if (!active) onSetServingMode(mode);
                  }}
                  disabled={active}
                  className={cn("game-control-segment", active && "game-control-segment-active")}
                >
                  <span className="block text-xs font-bold">{profile.label}</span>
                  <span className="mt-0.5 block text-[9px] font-semibold tabular-nums opacity-80">
                    {profile.throughputMult.toFixed(1)}× tok · {profile.revenueMult.toFixed(2)}× $
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] leading-snug text-brand-cream/45">{SERVING_MODE_PROFILES[servingMode].description}</p>
        </KitPanel>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="game-section-label">Model deck</p>
            <span className="text-[10px] font-semibold text-brand-cream/45">{userModels.length} total</span>
          </div>
          {userModels.length === 0 ? (
            <KitPanel data-shell="inset" className="py-6 text-center text-sm text-brand-cream/45">
              Trained models land here when they are ready to reveal or deploy.
            </KitPanel>
          ) : (
            <div className="flex flex-col gap-3">
              {userModels.map((model) =>
                !model.isRevealed ? (
                  <div
                    key={model.id}
                    className={
                      tutorialStarted && !tutorialCompleted && tutorialStage === "reveal_model"
                        ? "rounded-[var(--kit-r-field)] ring-2 ring-brand-teal/80 ring-offset-2 ring-offset-brand-ink"
                        : undefined
                    }
                  >
                    <UnknownModelCard
                      qualityTier={model.qualityTier}
                      onReveal={() =>
                        onQueueModelReveal({
                          modelId: model.id,
                          name: model.name,
                          qualityTier: model.qualityTier,
                          trainingVolumeLabel: userModelTrainingVolumeLabel(model),
                          baseModelId: model.baseModelId,
                          moneyPerToken: model.moneyPerToken,
                          tokensPerSecond: model.tokensPerSecond,
                          tokensPerToken: model.tokensPerToken,
                          tflopsUsed: model.tflopsUsed,
                          estimatedIncomePerSecond: model.estimatedIncomePerSecond,
                          trainingDataTokens: model.trainingDataTokens,
                        })
                      }
                    />
                  </div>
                ) : (
                  <div
                    key={model.id}
                    className={
                      tutorialStarted &&
                        !tutorialCompleted &&
                        tutorialStage === "serve" &&
                        model.launchState !== "serving"
                        ? "rounded-[var(--kit-r-field)] ring-2 ring-brand-teal/80 ring-offset-2 ring-offset-brand-ink"
                        : undefined
                    }
                  >
                    <RevealedModelCard
                      model={model}
                      onServe={() => onServeModel(model.id)}
                      onViewBaseModel={setDetailBaseModelId}
                      onViewUserModel={() => setDetailModel(model)}
                    />
                  </div>
                ),
              )}
            </div>
          )}
        </section>

        {detailBaseModelId !== null && (
          <ModelDetailView baseModelId={detailBaseModelId} initialMode="base" onClose={() => setDetailBaseModelId(null)} />
        )}
        {detailModel !== null && (
          <ModelDetailView
            userModel={detailModel}
            baseModelId={detailModel.baseModelId}
            initialMode="user"
            onQuantizeModel={onQuantizeModel}
            onClose={() => setDetailModel(null)}
            onViewBaseModel={(id) => {
              setDetailModel(null);
              setDetailBaseModelId(id);
            }}
          />
        )}
      </div>

      <DragGhost layer={drag} className="w-[180px] scale-105 cursor-grabbing opacity-95 shadow-2xl shadow-black/60">
        {(payload) => <RackSlot hardwareModelId={payload.value.hardwareModelId} useExternalDrag />}
      </DragGhost>
    </>
  );
}
