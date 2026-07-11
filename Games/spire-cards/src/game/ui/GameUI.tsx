import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useGame } from "@jgengine/react/hooks";
import { HudCanvas, HudPanel, SettingsTrigger, useHudLayout } from "@jgengine/react";

import type { CardData, CardKind } from "../cards";
import type { CombatSnapshot, HandCard, Phase } from "../combat";
import type { EnemyTier, Intent } from "../enemy";
import { keybinds } from "../keybinds";
import type { RunPhase } from "../run";
import { CardArtIcon, IntentIcon, StatusIcon } from "./icons";
import { useRun } from "./useRun";

const KIND_ACCENT: Record<CardKind, { ring: string; gem: string; art: string; glow: string }> = {
  attack: { ring: "ring-rose-400/70", gem: "bg-rose-500", art: "text-rose-200", glow: "shadow-rose-900/60" },
  skill: { ring: "ring-sky-400/70", gem: "bg-sky-500", art: "text-sky-200", glow: "shadow-sky-900/60" },
  power: { ring: "ring-violet-400/70", gem: "bg-violet-500", art: "text-violet-200", glow: "shadow-violet-900/60" },
};

const TIER_STYLE: Record<EnemyTier, { label: string; accent: string }> = {
  normal: { label: "Foe", accent: "border-stone-500/50 bg-stone-800/70 text-stone-300" },
  elite: { label: "Elite", accent: "border-violet-400/60 bg-violet-900/70 text-violet-200" },
  boss: { label: "Boss", accent: "border-rose-400/60 bg-rose-900/70 text-rose-200" },
};

function HealthBar({ hp, maxHp, block }: { hp: number; maxHp: number; block: number }) {
  const pct = maxHp <= 0 ? 0 : Math.max(0, Math.min(100, (hp / maxHp) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-5 w-52 overflow-hidden rounded-full border border-stone-950/60 bg-stone-950/70 shadow-inner">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tracking-wide text-stone-50 drop-shadow">
          {hp} / {maxHp}
        </div>
      </div>
      {block > 0 && (
        <div className="flex items-center gap-1 rounded-full border border-sky-300/40 bg-sky-900/60 px-2 py-0.5 text-sky-100">
          <CardArtIcon art="shield" className="h-3.5 w-3.5" />
          <span className="text-xs font-bold">{block}</span>
        </div>
      )}
    </div>
  );
}

function StrengthPip({ strength }: { strength: number }) {
  if (strength <= 0) return null;
  return (
    <div className="flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-900/50 px-2 py-0.5 text-amber-100">
      <CardArtIcon art="flame" className="h-3.5 w-3.5" />
      <span className="text-xs font-bold">Str {strength}</span>
    </div>
  );
}

function StatusPip({ kind, value }: { kind: "weak" | "vulnerable"; value: number }) {
  if (value <= 0) return null;
  const tone =
    kind === "weak"
      ? "border-stone-400/40 bg-stone-800/60 text-stone-200"
      : "border-fuchsia-300/40 bg-fuchsia-900/50 text-fuchsia-100";
  return (
    <div className={["flex items-center gap-1 rounded-full border px-2 py-0.5", tone].join(" ")}>
      <StatusIcon kind={kind} className="h-3.5 w-3.5" />
      <span className="text-xs font-bold">
        {kind === "weak" ? "Weak" : "Vulnerable"} {value}
      </span>
    </div>
  );
}

function intentLabel(intent: Intent): string {
  if (intent.kind === "attack") {
    const hits = intent.hits ?? 1;
    return hits > 1 ? `Attacks ${hits}x for ${intent.value}` : `Attacks for ${intent.value}`;
  }
  if (intent.kind === "defend") return `Guards ${intent.value} Block`;
  if (intent.kind === "buff") return `Buffs +${intent.value} Str`;
  return `Inflicts ${intent.value} ${intent.status === "weak" ? "Weak" : "Vulnerable"}`;
}

function intentColor(kind: Intent["kind"]): string {
  if (kind === "attack") return "h-5 w-5 text-rose-300";
  if (kind === "defend") return "h-5 w-5 text-sky-300";
  if (kind === "buff") return "h-5 w-5 text-amber-300";
  return "h-5 w-5 text-fuchsia-300";
}

function EnemyPanel({ enemy, intent }: { enemy: CombatSnapshot["enemy"]; intent: Intent | null }) {
  const tierStyle = TIER_STYLE[enemy.tier];
  return (
    <div className="flex flex-col items-center gap-3">
      {intent && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-400/50 bg-stone-950/80 px-3 py-1.5 shadow-lg shadow-black/40">
          <IntentIcon kind={intent.kind} className={intentColor(intent.kind)} />
          <span className="text-sm font-semibold text-amber-100">{intentLabel(intent)}</span>
        </div>
      )}
      <div className="flex h-32 w-32 items-center justify-center rounded-2xl border-2 border-lime-500/40 bg-gradient-to-b from-lime-800/70 to-lime-950/80 shadow-xl shadow-lime-950/50">
        <div className="h-20 w-24 rounded-[45%] bg-gradient-to-b from-lime-400/80 to-lime-600/70 blur-[1px]" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className={["rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", tierStyle.accent].join(" ")}>
          {tierStyle.label}
        </div>
        <span className="text-lg font-bold tracking-wide text-stone-100">{enemy.name}</span>
        <HealthBar hp={enemy.hp} maxHp={enemy.maxHp} block={enemy.block} />
        <div className="flex flex-wrap items-center justify-center gap-1">
          <StrengthPip strength={enemy.strength} />
          <StatusPip kind="weak" value={enemy.weak} />
          <StatusPip kind="vulnerable" value={enemy.vulnerable} />
        </div>
      </div>
    </div>
  );
}

function PlayerPanel({ hero }: { hero: CombatSnapshot["hero"] }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-stone-700/60 bg-stone-950/55 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-400/50 bg-amber-800/60">
          <CardArtIcon art="sword" className="h-5 w-5 text-amber-200" />
        </div>
        <span className="text-base font-bold text-stone-100">Ironclad</span>
      </div>
      <HealthBar hp={hero.hp} maxHp={hero.maxHp} block={hero.block} />
      <div className="flex flex-wrap items-center gap-1">
        <StrengthPip strength={hero.strength} />
        <StatusPip kind="weak" value={hero.weak} />
        <StatusPip kind="vulnerable" value={hero.vulnerable} />
      </div>
    </div>
  );
}

function EnergyOrb({ energy }: { energy: CombatSnapshot["energy"] }) {
  return (
    <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-amber-300/70 bg-gradient-to-b from-amber-400 to-orange-600 shadow-lg shadow-orange-950/60">
      <span className="text-xl font-black text-stone-950 drop-shadow">
        {energy.current}
        <span className="text-sm font-bold text-stone-900/70">/{energy.max}</span>
      </span>
    </div>
  );
}

function PileCount({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex w-14 flex-col items-center rounded-lg border border-stone-700/60 bg-stone-950/60 py-1">
      <span className="text-base font-bold text-stone-100">{count}</span>
      <span className="text-[10px] uppercase tracking-wider text-stone-400">{label}</span>
    </div>
  );
}

function CardFace({
  entry,
  playable,
  onPlay,
}: {
  entry: HandCard;
  playable: boolean;
  onPlay: (cardId: string) => void;
}) {
  const card: CardData = entry.card;
  const accent = KIND_ACCENT[card.kind];
  return (
    <button
      type="button"
      disabled={!playable}
      onClick={() => onPlay(entry.id)}
      className={[
        "group relative flex h-44 w-32 flex-col items-center rounded-xl border border-stone-950/70 bg-gradient-to-b from-stone-800 to-stone-900 p-2 text-left ring-2 shadow-lg transition-all",
        accent.ring,
        accent.glow,
        playable
          ? "cursor-pointer hover:-translate-y-4 hover:shadow-xl"
          : "cursor-not-allowed opacity-45 grayscale",
      ].join(" ")}
    >
      <div className={["absolute -left-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full text-sm font-black text-stone-950 shadow", accent.gem].join(" ")}>
        {card.cost}
      </div>
      <span className="mt-1 w-full truncate text-center text-[13px] font-bold text-stone-100">{card.name}</span>
      <div className="my-2 flex h-16 w-full items-center justify-center rounded-lg border border-stone-950/50 bg-stone-950/50">
        <CardArtIcon art={card.art} className={["h-10 w-10", accent.art].join(" ")} />
      </div>
      <span className="flex-1 text-center text-[11px] leading-tight text-stone-300">{card.text}</span>
    </button>
  );
}

function Hand({
  hand,
  energy,
  phase,
  onPlay,
}: {
  hand: readonly HandCard[];
  energy: number;
  phase: Phase;
  onPlay: (cardId: string) => void;
}) {
  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 items-end gap-3">
      {hand.length === 0 && <span className="pb-6 text-sm text-stone-500">Hand empty</span>}
      {hand.map((entry) => (
        <CardFace
          key={entry.id}
          entry={entry}
          playable={phase === "player" && energy >= entry.card.cost}
          onPlay={onPlay}
        />
      ))}
    </div>
  );
}

function CombatLog({ log }: { log: readonly string[] }) {
  return (
    <div className="flex w-60 flex-col rounded-xl border border-stone-700/70 bg-stone-950/75 shadow-xl backdrop-blur-sm">
      <div className="border-b border-stone-700/60 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-stone-400">
        Combat Log
      </div>
      <div className="flex max-h-52 flex-col gap-1 overflow-hidden px-3 py-2">
        {log.slice(0, 10).map((line, index) => (
          <span
            key={`${index}-${line}`}
            className={index === 0 ? "text-[12px] text-stone-100" : "text-[12px] text-stone-400"}
          >
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}

function EncounterBadge({ index, count }: { index: number; count: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-stone-700/60 bg-stone-950/60 px-3 py-1.5">
      <span className="text-xs uppercase tracking-widest text-stone-400">Encounter</span>
      <span className="text-lg font-black text-amber-300">{index + 1}</span>
      <span className="text-xs text-stone-500">/ {count}</span>
    </div>
  );
}

function RewardCard({ card, onChoose }: { card: CardData; onChoose: (type: string) => void }) {
  const accent = KIND_ACCENT[card.kind];
  return (
    <button
      type="button"
      onClick={() => onChoose(card.type)}
      className={[
        "group relative flex h-52 w-36 flex-col items-center rounded-xl border border-stone-950/70 bg-gradient-to-b from-stone-800 to-stone-900 p-3 text-left ring-2 shadow-xl transition-transform hover:-translate-y-2",
        accent.ring,
        accent.glow,
      ].join(" ")}
    >
      <div className={["absolute -left-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full text-sm font-black text-stone-950 shadow", accent.gem].join(" ")}>
        {card.cost}
      </div>
      <span className="mt-1 w-full truncate text-center text-sm font-bold text-stone-100">{card.name}</span>
      <div className="my-2 flex h-20 w-full items-center justify-center rounded-lg border border-stone-950/50 bg-stone-950/50">
        <CardArtIcon art={card.art} className={["h-12 w-12", accent.art].join(" ")} />
      </div>
      <span className="flex-1 text-center text-xs leading-tight text-stone-300">{card.text}</span>
    </button>
  );
}

function RewardOverlay({
  phase,
  options,
  onChoose,
  onSkip,
}: {
  phase: RunPhase;
  options: readonly CardData[];
  onChoose: (type: string) => void;
  onSkip: () => void;
}) {
  if (phase !== "reward") return null;
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-black/75 backdrop-blur-sm">
      <h2 className="text-3xl font-black tracking-tight text-amber-300">Choose a Card</h2>
      <div className="flex gap-5">
        {options.map((card) => (
          <RewardCard key={card.type} card={card} onChoose={onChoose} />
        ))}
      </div>
      <button
        type="button"
        onClick={onSkip}
        className="rounded-lg border border-stone-600/60 bg-stone-800/80 px-5 py-2 text-sm font-semibold text-stone-300 transition-colors hover:bg-stone-700/80"
      >
        Skip Reward
      </button>
    </div>
  );
}

function ResultOverlay({
  phase,
  encounterIndex,
  encounterCount,
  onRestart,
}: {
  phase: RunPhase;
  encounterIndex: number;
  encounterCount: number;
  onRestart: () => void;
}) {
  if (phase !== "victory" && phase !== "defeat") return null;
  const won = phase === "victory";
  const restartKey = actionLabel(keybinds, "startNewRun");
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm">
      <h1 className={["text-6xl font-black tracking-tight", won ? "text-amber-300" : "text-rose-400"].join(" ")}>
        {won ? "Run Complete" : "Run Failed"}
      </h1>
      <p className="text-sm text-stone-300">
        {won ? `You cleared all ${encounterCount} encounters.` : `You fell at encounter ${encounterIndex + 1} of ${encounterCount}.`}
      </p>
      <button
        type="button"
        onClick={onRestart}
        className="flex items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-600/90 px-6 py-2 text-lg font-bold text-stone-950 transition-colors hover:bg-amber-500"
      >
        New Run
        <span className="rounded bg-stone-950/40 px-1.5 text-sm font-mono">{restartKey}</span>
      </button>
    </div>
  );
}

export function GameUI() {
  const runSnapshot = useRun();
  const { commands } = useGame();
  const endTurnKey = actionLabel(keybinds, "endTurn");
  const snapshot = runSnapshot.combat;

  const play = (cardId: string) => commands.run("playCard", { cardId });
  const endTurn = () => commands.run("endTurn", {});
  const restart = () => commands.run("startNewRun", {});
  const chooseReward = (cardType: string) => commands.run("chooseReward", { cardType });
  const skipReward = () => commands.run("skipReward", {});
  const inCombat = runSnapshot.phase === "combat";
  const playerTurn = inCombat && snapshot.phase === "player";
  const layout = useHudLayout({ storageKey: "spire-cards" });

  return (
    <HudCanvas layout={layout} className="select-none overflow-hidden text-stone-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,#3b3457_0%,#231f36_45%,#12101c_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/60 to-transparent" />

      <HudPanel id="turn-indicator" anchor="top-left" inset={{ x: 24, y: 20 }}>
        <div className="flex items-center gap-2 rounded-lg border border-stone-700/60 bg-stone-950/60 px-3 py-1.5">
          <span className="text-xs uppercase tracking-widest text-stone-400">Turn</span>
          <span className="text-lg font-black text-amber-300">{snapshot.round}</span>
        </div>
      </HudPanel>
      <HudPanel id="encounter-badge" anchor="top-left" inset={{ x: 24, y: 64 }}>
        <EncounterBadge index={runSnapshot.encounterIndex} count={runSnapshot.encounterCount} />
      </HudPanel>
      <HudPanel id="settings" anchor="top-right" inset={{ x: 24, y: 20 }}>
        <SettingsTrigger className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-stone-700/60 bg-stone-950/60 text-amber-300 transition-colors hover:bg-stone-800/80" />
      </HudPanel>

      <HudPanel id="enemy-panel" anchor="top" inset={{ x: 0, y: 40 }}>
        <EnemyPanel enemy={snapshot.enemy} intent={snapshot.intent} />
      </HudPanel>
      <HudPanel id="combat-log" anchor="right" inset={{ x: 24, y: 0 }}>
        <CombatLog log={snapshot.log} />
      </HudPanel>
      <HudPanel id="player-panel" anchor="bottom-left" inset={{ x: 24, y: 24 }}>
        <PlayerPanel hero={snapshot.hero} />
      </HudPanel>

      {inCombat && (
        <>
          <Hand hand={snapshot.hand} energy={snapshot.energy.current} phase={snapshot.phase} onPlay={play} />
          <HudPanel id="resource-bar" anchor="bottom-right" inset={{ x: 24, y: 24 }} style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-2">
                <PileCount label="Draw" count={snapshot.deckCount} />
                <PileCount label="Discard" count={snapshot.discardCount} />
                <PileCount label="Exhaust" count={snapshot.exhaustCount} />
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <EnergyOrb energy={snapshot.energy} />
              <button
                type="button"
                disabled={!playerTurn}
                onClick={endTurn}
                className={[
                  "flex items-center gap-2 rounded-lg border px-5 py-2 text-base font-bold transition-colors",
                  playerTurn
                    ? "cursor-pointer border-amber-300/60 bg-amber-600/90 text-stone-950 hover:bg-amber-500"
                    : "cursor-not-allowed border-stone-700/60 bg-stone-800/70 text-stone-500",
                ].join(" ")}
              >
                End Turn
                <span className="rounded bg-stone-950/40 px-1.5 text-sm font-mono">{endTurnKey}</span>
              </button>
            </div>
          </HudPanel>
        </>
      )}

      <RewardOverlay phase={runSnapshot.phase} options={runSnapshot.rewardOptions} onChoose={chooseReward} onSkip={skipReward} />
      <ResultOverlay
        phase={runSnapshot.phase}
        encounterIndex={runSnapshot.encounterIndex}
        encounterCount={runSnapshot.encounterCount}
        onRestart={restart}
      />
    </HudCanvas>
  );
}
