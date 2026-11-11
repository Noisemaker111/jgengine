/** @jsxImportSource @jgengine/core/ui/jsx */
import type { Id } from "@llmville/backend/convex/_generated/dataModel";
import { useCallback, useEffect, useMemo, useRef, useState } from "@jgengine/core/ui/jsx";

import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind, runeTween } from "@jgengine/core/ui/rune/primitives";
import {
  dataTokenRateToBarValue,
  formatHourlyIncome,
  formatModelQualityTierLabel,
  moneyPerTokenToPmt,
  priceToBarValue,
  tpsToBarValue,
} from "../models";
import { DISPLAY } from "../../ui/theme";
import { Button, C, FULL, Icon, Label, Mascot, Muted, Panel, Row, Stack, Text } from "../../ui/kit";

export interface RevealingModelStats {
  modelId: Id<"models">;
  name: string;
  qualityTier: "common" | "uncommon" | "rare" | "sota";
  trainingVolumeLabel: string;
  baseModelId?: string | undefined;
  moneyPerToken: number;
  tokensPerSecond: number;
  tokensPerToken: number;
  tflopsUsed?: number | undefined;
  estimatedIncomePerSecond: number;
  trainingDataTokens?: number | undefined;
}

type RevealedStatKey = "moneyPerToken" | "tokensPerSecond" | "tokensPerToken" | "estimatedIncomePerSecond";
type RevealPhase = "sealed" | "opening" | "stats" | "complete";

interface RevealedStatConfig {
  key: RevealedStatKey;
  label: string;
  color: string;
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
  { key: "moneyPerToken", label: "Money/token", color: "#e0a95c", prefix: "$", suffix: "/M", formatPmt: true },
  { key: "tokensPerSecond", label: "TPS", color: "#e8836b", prefix: "", suffix: " / TFLOP" },
  { key: "tokensPerToken", label: "Data/token", color: "#5fc2a8", prefix: "", suffix: "" },
  { key: "estimatedIncomePerSecond", label: "Income", color: "#7fd5bd", prefix: "$", suffix: "/hr", formatHourly: true },
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

/** The sealed dossier: one tap opens it. */
function ModelRevealSealedCard({ onOpen }: { onOpen: () => void }) {
  return <Button tone="secondary" label="Open classified model" width={208} height={256} padding={24} radius={6} fill={C.paper} border={{ width: 2, color: C.paperInk }} onPress={onOpen}>
    <RuneView gap={14} items="center" width={FULL}>
      <RuneView width={80} height={80} radius={40} fill="#16201e66" justify="center" items="center"><Mascot size={44} color={C.paperInk} /></RuneView>
      <Text family={DISPLAY} size={14} weight={800} color={C.paperInk}>CLASSIFIED MODEL</Text>
      <Label color={C.paperMuted}>TAP DOSSIER TO OPEN</Label>
    </RuneView>
  </Button>;
}

/** The dossier flips open while the reveal request lands. */
function ModelRevealOpeningCard({ showGlow }: { showGlow: boolean }) {
  return <RuneView width={208} height={256} radius={6} fill={C.paper} justify="center" items="center"
    {...(showGlow ? { shadow: { y: 0, blur: 40, spread: 6, color: "#e0a95c80" } } : {})}>
    <Icon name="sparkles" size={64} color={C.amber} />
  </RuneView>;
}

/** One stat line that rises in when its turn comes. */
function RevealStat({ stat, value, visible }: { stat: RevealedStatConfig; value: number; visible: boolean }) {
  const bar = getRevealBarValue(stat, value);
  const target = useRef(visible);
  target.current = visible;
  const shown = useMemo(() => runeTween(() => (target.current ? 1 : 0), 400), []);
  return <RuneView gap={4} width={FULL} opacity={shown} y={bind(() => (1 - shown.get()) * 16)}>
    <Row justify="between" width={FULL}><Label color={stat.color}>{stat.label.toUpperCase()}</Label><Text size={13} weight={800} color={stat.color}>{getRevealStatDisplay(stat, value)}</Text></Row>
    {bar === null ? null : <RuneView height={6} radius={3} fill={C.line} width={FULL}><RuneView height={6} radius={3} fill={stat.color} width={{ fraction: Math.max(0, Math.min(1, bar / 100)) }} /></RuneView>}
  </RuneView>;
}

function ModelRevealStatsPanel({ model, availableStats, revealedStatIndex, phase, onComplete }: {
  model: RevealingModelStats;
  availableStats: readonly RevealedStatConfig[];
  revealedStatIndex: number;
  phase: Extract<RevealPhase, "stats" | "complete">;
  onComplete: () => void;
}) {
  return <Panel shell="panel" width={FULL} gap={14} padding={18}>
    <RuneView items="center" gap={6} width={FULL}>
      <RuneView width={64} height={64} radius={6} fill="#5fc2a81a" border={{ width: 1, color: "#5fc2a84d" }} justify="center" items="center"><Mascot size={36} /></RuneView>
      <Text family={DISPLAY} size={20} weight={800}>{model.name}</Text>
      <Muted size={12}>{`${formatModelQualityTierLabel(model.qualityTier)} · ${model.trainingVolumeLabel}`}</Muted>
    </RuneView>
    <Stack gap={10} width={FULL}>{availableStats.map((stat, index) => {
      const value = getRevealStatValue(model, stat.key);
      return value === undefined ? null : <RevealStat key={stat.key} stat={stat} value={value} visible={index <= revealedStatIndex} />;
    })}</Stack>
    {phase === "complete" && (model.trainingDataTokens !== undefined || model.tflopsUsed !== undefined) ? <Row gap={8} width={FULL}>
      {model.trainingDataTokens === undefined ? null : <Panel shell="inset" grow={1} items="center" gap={2} padding={8}><Label color={C.amber}>TOKENS USED</Label><Text weight={800}>{model.trainingDataTokens.toLocaleString()}</Text></Panel>}
      {model.tflopsUsed === undefined ? null : <Panel shell="inset" grow={1} items="center" gap={2} padding={8}><Label color={C.teal}>TFLOPS USED</Label><Text weight={800}>{String(model.tflopsUsed)}</Text></Panel>}
    </Row> : null}
    {phase === "complete" ? <Button tone="primary" width={FULL} onPress={onComplete}>Continue</Button> : null}
  </Panel>;
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

  return <RuneView anchor="fill" fill="#000000cc" modal label="Reveal your model" role="dialog" justify="center" items="center">
    <RuneView width={320} padding={16} items="center">
      {phase === "sealed" ? <ModelRevealSealedCard onOpen={handleOpen} /> : null}
      {phase === "opening" ? <ModelRevealOpeningCard showGlow={showGlow} /> : null}
      {phase === "stats" || phase === "complete" ? <ModelRevealStatsPanel model={model} availableStats={availableStats} revealedStatIndex={revealedStatIndex} phase={phase} onComplete={onComplete} /> : null}
    </RuneView>
  </RuneView>;
}
