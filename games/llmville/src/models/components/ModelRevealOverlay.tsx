import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { CARD_VARIANT, Card } from "@/components/ui/card";
import { ProgressRow } from "@/components/ui/progress";
import { cn } from "@/components/ui/cn";
import {
  dataTokenRateToBarValue,
  formatHourlyIncome,
  formatModelQualityTierLabel,
  moneyPerTokenToPmt,
  priceToBarValue,
  tpsToBarValue,
} from "@/models/models";

export interface RevealingModelStats {
  modelId: Id<"models">;
  name: string;
  qualityTier: "common" | "uncommon" | "rare" | "sota";
  trainingVolumeLabel: string;
  baseModelId?: string;
  moneyPerToken: number;
  tokensPerSecond: number;
  tokensPerToken: number;
  tflopsUsed?: number;
  estimatedIncomePerSecond: number;
  trainingDataTokens?: number;
}

type RevealedStatKey = "moneyPerToken" | "tokensPerSecond" | "tokensPerToken" | "estimatedIncomePerSecond";
type RevealPhase = "sealed" | "opening" | "stats" | "complete";

interface RevealedStatConfig {
  key: RevealedStatKey;
  label: string;
  color: string;
  icon: string;
  prefix: string;
  suffix: string;
  formatHourly?: boolean;
  formatPmt?: boolean;
}

interface ModelRevealOverlayProps {
  model: RevealingModelStats;
  onComplete: () => void;
  onReveal: (modelId: RevealingModelStats["modelId"]) => void;
}

const revealTimingMs = {
  opening: 1200,
  completionPause: 600,
  statStep: 400,
} as const;

const revealStatConfigs: readonly RevealedStatConfig[] = [
  { key: "moneyPerToken", label: "Money/token", color: "#e0a95c", icon: "💰", prefix: "$", suffix: "/M", formatPmt: true },
  { key: "tokensPerSecond", label: "TPS", color: "#e8836b", icon: "⚡", prefix: "", suffix: " / TFLOP" },
  { key: "tokensPerToken", label: "Data/token", color: "#5fc2a8", icon: "🧬", prefix: "", suffix: "" },
  { key: "estimatedIncomePerSecond", label: "Income", color: "#7fd5bd", icon: "💵", prefix: "$", suffix: "/hr", formatHourly: true },
];

function getRevealStatValue(model: RevealingModelStats, key: RevealedStatKey): number | undefined {
  if (key === "moneyPerToken") return model.moneyPerToken;
  if (key === "tokensPerSecond") return model.tokensPerSecond;
  if (key === "tokensPerToken") return model.tokensPerToken;
  return model.estimatedIncomePerSecond;
}

function getRevealStatDisplay(stat: RevealedStatConfig, value: number): string {
  if (stat.formatHourly) {
    return formatHourlyIncome(value);
  }
  if (stat.formatPmt) {
    return `$${moneyPerTokenToPmt(value)}/M`;
  }
  return `${stat.prefix}${value.toLocaleString()}${stat.suffix}`;
}

function getRevealBarValue(stat: RevealedStatConfig, value: number): number | null {
  if (stat.key === "moneyPerToken") return priceToBarValue(moneyPerTokenToPmt(value));
  if (stat.key === "tokensPerSecond") return tpsToBarValue(value);
  if (stat.key === "tokensPerToken") return dataTokenRateToBarValue(value);
  return null;
}

const REVEAL_STAT_TONE = {
  moneyPerToken: "amber",
  tokensPerSecond: "coral",
  tokensPerToken: "teal",
  estimatedIncomePerSecond: "teal",
} as const satisfies Record<RevealedStatKey, "teal" | "amber" | "coral" | "cream">;

function ModelRevealSealedCard({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="animate-in zoom-in-95 text-center duration-500">
      <button
        type="button"
        onClick={onOpen}
        className="group relative mx-auto block h-64 w-52 cursor-pointer border-0 bg-transparent p-0 text-left transition-transform duration-300 hover:scale-[1.03]"
      >
        <Card variant={CARD_VARIANT.redacted} decoration="stamp" className="flex h-full flex-col items-center justify-center gap-4 p-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-ink/40 animate-pulse">
            <span className="text-4xl">🤖</span>
          </div>
          <div className="space-y-1 text-center">
            <p className="font-game text-sm font-bold text-brand-cream">CLASSIFIED MODEL</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-cream/50">Tap dossier to open</p>
          </div>
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -inset-full skew-x-12 animate-[shimmer_2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </div>
        </Card>
      </button>
    </div>
  );
}

function ModelRevealOpeningCard({ showGlow }: { showGlow: boolean }) {
  return (
    <div className="text-center">
      <div className="relative mx-auto h-64 w-52">
        {showGlow && (
          <div className="absolute inset-0 animate-ping rounded-sm bg-gradient-to-br from-brand-amber/35 to-brand-teal/35" />
        )}
        <Card
          variant="polaroid"
          className="absolute inset-0 flex items-center justify-center animate-[flip_1s_ease-in-out_forwards]"
        >
          <span className="animate-bounce text-6xl">✨</span>
        </Card>
      </div>
    </div>
  );
}

function ModelRevealStatsPanel({
  model,
  availableStats,
  revealedStatIndex,
  phase,
  onComplete,
}: {
  model: RevealingModelStats;
  availableStats: readonly RevealedStatConfig[];
  revealedStatIndex: number;
  phase: Extract<RevealPhase, "stats" | "complete">;
  onComplete: () => void;
}) {
  return (
    <Card variant="model-report" decoration="fold" className="animate-in fade-in slide-in-from-bottom-8 space-y-4 p-4 duration-500">
      <div className="animate-in zoom-in-95 space-y-2 text-center duration-500">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-sm border border-brand-teal/30 bg-brand-teal/10">
          <span className="text-2xl">🤖</span>
        </div>
        <h2 className="font-game text-xl font-bold text-brand-cream">{model.name}</h2>
        <p className="text-xs text-brand-cream/50">
          {formatModelQualityTierLabel(model.qualityTier)} · {model.trainingVolumeLabel}
        </p>
      </div>

      <div className="space-y-2">
        {availableStats.map((stat, index) => {
          const value = getRevealStatValue(model, stat.key);
          if (value === undefined) return null;

          const isVisible = index <= revealedStatIndex;
          const barValue = getRevealBarValue(stat, value);

          return (
            <div
              key={stat.key}
              className={cn(
                "transition-all duration-500",
                isVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
              )}
            >
              <ProgressRow
                label={`${stat.icon} ${stat.label}`}
                valueLabel={getRevealStatDisplay(stat, value)}
                fill={barValue ?? 0}
                tone={REVEAL_STAT_TONE[stat.key]}
                compact
              />
            </div>
          );
        })}
      </div>

      {(model.trainingDataTokens || model.tflopsUsed) && (
        <div
          className={cn(
            "transition-all duration-500",
            phase === "complete" ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
          )}
        >
          <div className="flex gap-2">
            {model.trainingDataTokens !== undefined && (
              <div className="game-stat-display game-stat-display--inline game-stat-display--tone-amber flex-1 p-2 text-center">
                <span className="game-stat-display__label">Tokens used</span>
                <span className="game-stat-display__value">{model.trainingDataTokens.toLocaleString()}</span>
              </div>
            )}
            {model.tflopsUsed !== undefined && (
              <div className="game-stat-display game-stat-display--inline game-stat-display--tone-teal flex-1 p-2 text-center">
                <span className="game-stat-display__label">TFLOPs used</span>
                <span className="game-stat-display__value">{model.tflopsUsed}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {phase === "complete" && (
        <div className="animate-in fade-in slide-in-from-bottom-4 pb-1 duration-500">
          <Button variant="primary" onClick={onComplete} className="w-full py-3 text-sm">
            Continue
          </Button>
        </div>
      )}
    </Card>
  );
}

export type { RevealedStatConfig, RevealPhase };

export default function ModelRevealOverlay({ model, onComplete, onReveal }: ModelRevealOverlayProps) {
  const [phase, setRevealPhase] = useState<RevealPhase>("sealed");
  const [revealedStatIndex, setRevealedStatIndex] = useState(-1);
  const [showGlow, setShowGlow] = useState(false);

  const handleOpen = useCallback(() => {
    setRevealPhase("opening");
    setShowGlow(true);

    setTimeout(() => {
      onReveal(model.modelId);
      setRevealPhase("stats");
      setShowGlow(false);
    }, revealTimingMs.opening);
  }, [model.modelId, onReveal]);

  useEffect(() => {
    if (phase !== "stats") return;

    const availableStats = revealStatConfigs.filter((stat) => getRevealStatValue(model, stat.key) !== undefined);

    if (revealedStatIndex >= availableStats.length - 1) {
      const timer = setTimeout(() => setRevealPhase("complete"), revealTimingMs.completionPause);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setRevealedStatIndex((previous) => previous + 1);
    }, revealTimingMs.statStep);

    return () => clearTimeout(timer);
  }, [phase, revealedStatIndex, model]);

  const availableStats = revealStatConfigs.filter((stat) => getRevealStatValue(model, stat.key) !== undefined);

  return (
    <div role="dialog" aria-modal="true" aria-label="Reveal your model" className="animate-in fade-in fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm duration-300">
      <div className="max-h-[90dvh] w-[min(320px,calc(100vw-2rem))] overflow-y-auto scrollbar-none">
        {phase === "sealed" && <ModelRevealSealedCard onOpen={handleOpen} />}

        {phase === "opening" && <ModelRevealOpeningCard showGlow={showGlow} />}

        {(phase === "stats" || phase === "complete") && (
          <ModelRevealStatsPanel
            model={model}
            availableStats={availableStats}
            revealedStatIndex={revealedStatIndex}
            phase={phase}
            onComplete={onComplete}
          />
        )}
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%) skewX(-12deg); }
          100% { transform: translateX(200%) skewX(-12deg); }
        }
        @keyframes flip {
          0% { transform: perspective(600px) rotateY(0deg) scale(1); }
          40% { transform: perspective(600px) rotateY(90deg) scale(1.1); }
          60% { transform: perspective(600px) rotateY(180deg) scale(1.1); }
          100% { transform: perspective(600px) rotateY(360deg) scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
