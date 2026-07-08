import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { EntityFloatTextEvent, StatLevelUpEvent } from "@jgengine/core/game/events";
import type { FeedEntry } from "@jgengine/core/game/feed";
import { useGameContext } from "../provider";
import { useFeed } from "../hooks";
import { AccentRule, HudLabel, KeybindBadge, clampFraction, hudTextShadow, slantBar, useGameUiKeyframes } from "./chrome";
import { rarityColor, useGameUiTheme, type RarityTierName } from "./theme";

function jitterFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ((hash % 21) + 21) % 21;
}

export interface CombatFloatEntry {
  id: string;
  text: string;
  kind?: "damage" | "crit" | "heal" | "info" | "error";
  x?: number;
  y?: number;
}

function CombatFloatStyle(theme: ReturnType<typeof useGameUiTheme>, kind: NonNullable<CombatFloatEntry["kind"]>): CSSProperties {
  switch (kind) {
    case "crit":
      return {
        fontFamily: theme.fontNumeric,
        fontSize: 26,
        fontWeight: 800,
        letterSpacing: "0.04em",
        color: theme.warning,
      };
    case "heal":
      return {
        fontFamily: theme.fontNumeric,
        fontSize: 18,
        fontWeight: 800,
        color: theme.success,
      };
    case "error":
      return {
        fontFamily: theme.fontBody,
        fontSize: 13,
        fontWeight: 600,
        color: theme.danger,
      };
    case "info":
      return {
        fontFamily: theme.fontBody,
        fontSize: 13,
        fontWeight: 600,
        color: theme.textDim,
      };
    case "damage":
    default:
      return {
        fontFamily: theme.fontNumeric,
        fontSize: 18,
        fontWeight: 800,
        color: theme.textPrimary,
      };
  }
}

export function CombatFloat({
  entry,
  durationMs = 1100,
  className,
}: {
  entry: CombatFloatEntry;
  durationMs?: number;
  className?: string;
}) {
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  const kind = entry.kind ?? "damage";
  const x = entry.x ?? 50 + jitterFromId(entry.id) - 10;
  const y = entry.y ?? 50;
  const animation =
    kind === "crit"
      ? `jgui-float-up ${durationMs}ms ease-out forwards, jgui-pop 220ms ease-out forwards`
      : `jgui-float-up ${durationMs}ms ease-out forwards`;
  return (
    <span
      className={className}
      data-jgui="combat-float"
      data-kind={kind}
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%)",
        whiteSpace: "nowrap",
        textShadow: hudTextShadow(),
        animation,
        animationFillMode: "forwards",
        ...CombatFloatStyle(theme, kind),
      }}
    >
      {entry.text}
    </span>
  );
}

export function CombatFloatLayer({
  entries,
  durationMs = 1100,
  className,
}: {
  entries: readonly CombatFloatEntry[];
  durationMs?: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      data-jgui="combat-float-layer"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
    >
      {entries.map((entry) => (
        <CombatFloat key={entry.id} entry={entry} durationMs={durationMs} />
      ))}
    </div>
  );
}

function defaultMapFloatTextEvent(event: EntityFloatTextEvent): CombatFloatEntry | null {
  const kind: CombatFloatEntry["kind"] =
    event.crit === true
      ? "crit"
      : event.kind === "heal"
        ? "heal"
        : event.kind === "error" || event.kind === "miss"
          ? "error"
          : event.kind === "damage"
            ? "damage"
            : "info";
  const text = event.amount !== undefined ? String(Math.round(event.amount)) : event.text;
  return { id: `${event.instanceId ?? "world"}-${Date.now()}-${Math.random()}`, text, kind };
}

export function GameEventFloats({
  durationMs = 1100,
  className,
  mapEvent,
}: {
  durationMs?: number;
  className?: string;
  mapEvent?: (event: EntityFloatTextEvent) => CombatFloatEntry | null;
}) {
  const ctx = useGameContext();
  const [entries, setEntries] = useState<readonly CombatFloatEntry[]>([]);
  useEffect(() => {
    const unsubscribe = ctx.game.events.on("entity.floatText", (event) => {
      const entry = (mapEvent ?? defaultMapFloatTextEvent)(event);
      if (entry === null) return;
      setEntries((current) => [...current, entry]);
      setTimeout(() => {
        setEntries((current) => current.filter((item) => item.id !== entry.id));
      }, durationMs + 200);
    });
    return unsubscribe;
  }, [ctx, mapEvent, durationMs]);
  return <CombatFloatLayer entries={entries} durationMs={durationMs} className={className} />;
}

export function HitMarker({
  active,
  crit = false,
  size = 26,
  className,
}: {
  active: boolean;
  crit?: boolean;
  size?: number;
  className?: string;
}) {
  const theme = useGameUiTheme();
  const [pulse, setPulse] = useState(0);
  const wasActive = useRef(false);
  useEffect(() => {
    if (active && !wasActive.current) setPulse((count) => count + 1);
    wasActive.current = active;
  }, [active]);
  if (!active) return null;
  const color = crit ? theme.warning : theme.textPrimary;
  const half = size / 2;
  const inner = size * 0.22;
  const outer = size * 0.5;
  return (
    <svg
      key={pulse}
      className={className}
      data-jgui="hit-marker"
      data-crit={crit}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        filter: `drop-shadow(0 0 4px ${color}aa)`,
        animation: "jgui-flash 0.28s ease-out forwards",
      }}
    >
      <line x1={half - outer} y1={half - outer} x2={half - inner} y2={half - inner} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <line x1={half + inner} y1={half + inner} x2={half + outer} y2={half + outer} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <line x1={half + outer} y1={half - outer} x2={half + inner} y2={half - inner} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <line x1={half - inner} y1={half + inner} x2={half - outer} y2={half + outer} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}

export interface KillFeedEntry {
  id: string;
  left: string;
  verb?: ReactNode;
  right: string;
  highlight?: boolean;
}

function SkullGlyph({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={12} height={12} fill={color} aria-hidden>
      <path d="M12 2C7 2 3.4 5.4 3.4 10c0 2.9 1.5 5.1 3.4 6.5V19c0 .6.4 1 1 1h1.4v-1.6h1.2V20h1.2v-1.6h1.2V20h1.2v-1.6H16c.6 0 1-.4 1-1v-2.5c1.9-1.4 3.4-3.6 3.4-6.5C20.4 5.4 17 2 12 2zm-3.2 9.4a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2zm6.4 0a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2z" />
    </svg>
  );
}

export function KillFeedRow({ entry, className }: { entry: KillFeedEntry; className?: string }) {
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  return (
    <div
      className={className}
      data-jgui="kill-feed-row"
      data-highlight={entry.highlight ?? false}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px 2px 10px",
        fontFamily: theme.fontBody,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
        animation: "jgui-slide-down 0.28s ease-out",
        background:
          entry.highlight === true
            ? `linear-gradient(90deg, ${theme.accentGlow} 0%, transparent 60%)`
            : "none",
        textShadow: entry.highlight === true ? `0 0 6px ${theme.accentGlow}, ${hudTextShadow()}` : hudTextShadow(),
      }}
    >
      {entry.highlight === true && (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 1,
            bottom: 1,
            width: 2,
            background: theme.accent,
            boxShadow: `0 0 6px ${theme.accentGlow}`,
          }}
        />
      )}
      <span style={{ color: theme.friendly }}>{entry.left}</span>
      {entry.verb ?? <SkullGlyph color={theme.textDim} />}
      <span style={{ color: theme.hostile }}>{entry.right}</span>
    </div>
  );
}

export function KillFeed({
  entries,
  limit = 5,
  className,
}: {
  entries: readonly KillFeedEntry[];
  limit?: number;
  className?: string;
}) {
  const shown = entries.slice(Math.max(0, entries.length - limit));
  return (
    <div
      className={className}
      data-jgui="kill-feed"
      style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}
    >
      {shown.map((entry) => (
        <KillFeedRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

export function FeedKillFeed({
  action,
  limit = 5,
  mapEntry,
  className,
}: {
  action: string;
  limit?: number;
  mapEntry: (entry: FeedEntry<unknown>, index: number) => KillFeedEntry | null;
  className?: string;
}) {
  const raw = useFeed({ action, limit });
  const entries: KillFeedEntry[] = [];
  raw.forEach((entry, index) => {
    const mapped = mapEntry(entry, index);
    if (mapped !== null) entries.push(mapped);
  });
  return <KillFeed entries={entries} limit={limit} className={className} />;
}

export type AnnouncementTone = "neutral" | "victory" | "defeat" | "warning";

export function AnnouncementBanner({
  title,
  subtitle,
  tone = "neutral",
  keybindHint,
  visible = true,
  className,
}: {
  title: string;
  subtitle?: string;
  tone?: AnnouncementTone;
  keybindHint?: { label: string; keybind: string };
  visible?: boolean;
  className?: string;
}) {
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  if (!visible) return null;
  const color =
    tone === "victory" ? theme.accent : tone === "defeat" ? theme.danger : tone === "warning" ? theme.warning : theme.textPrimary;
  return (
    <div
      className={className}
      data-jgui="announcement-banner"
      data-tone={tone}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        animation: "jgui-slide-down 0.4s ease-out",
      }}
    >
      <span
        style={{
          fontFamily: theme.fontDisplay,
          fontSize: 34,
          fontWeight: 800,
          letterSpacing: "0.34em",
          paddingLeft: "0.34em",
          textTransform: "uppercase",
          color,
          textShadow: `0 2px 8px rgba(0,0,0,0.95), 0 0 22px ${theme.accentGlow}`,
        }}
      >
        {title}
      </span>
      <AccentRule width={260} />
      {subtitle !== undefined && (
        <span
          style={{
            fontFamily: theme.fontBody,
            fontSize: 13,
            letterSpacing: "0.14em",
            color: theme.textDim,
            textShadow: hudTextShadow(),
          }}
        >
          {subtitle}
        </span>
      )}
      {keybindHint !== undefined && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
          <span
            style={{
              fontFamily: theme.fontBody,
              fontSize: 11,
              color: theme.textDim,
              textShadow: hudTextShadow(),
            }}
          >
            Press
          </span>
          <KeybindBadge label={keybindHint.keybind} size="sm" />
          <span
            style={{
              fontFamily: theme.fontBody,
              fontSize: 11,
              color: theme.textDim,
              textShadow: hudTextShadow(),
            }}
          >
            {keybindHint.label}
          </span>
        </div>
      )}
    </div>
  );
}

export function ComboCounter({
  count,
  label = "COMBO",
  decayFraction,
  className,
}: {
  count: number;
  label?: string;
  decayFraction?: number;
  className?: string;
}) {
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  return (
    <div className={className} data-jgui="combo-counter" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <span
        key={count}
        style={{
          fontFamily: theme.fontNumeric,
          fontSize: 40,
          fontWeight: 800,
          color: theme.accent,
          textShadow: `${hudTextShadow()}, 0 0 16px ${theme.accentGlow}`,
          animation: "jgui-pop 0.22s ease-out",
        }}
      >
        {count}
      </span>
      <HudLabel>{label}</HudLabel>
      {decayFraction !== undefined && (
        <div
          style={{
            width: 90,
            height: 3,
            clipPath: slantBar(3),
            background: theme.surfaceDeep,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${clampFraction(decayFraction) * 100}%`,
              height: "100%",
              background: theme.accent,
              boxShadow: `0 0 6px ${theme.accentGlow}`,
              transition: "width 0.1s linear",
            }}
          />
        </div>
      )}
    </div>
  );
}

export function StreakCallout({
  text,
  tier = 1,
  visible = true,
  className,
}: {
  text: string;
  tier?: number;
  visible?: boolean;
  className?: string;
}) {
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  if (!visible) return null;
  const color = tier >= 3 ? theme.danger : tier === 2 ? theme.warning : theme.textPrimary;
  return (
    <span
      key={text}
      className={className}
      data-jgui="streak-callout"
      data-tier={tier}
      style={{
        display: "inline-block",
        fontFamily: theme.fontDisplay,
        fontStyle: "italic",
        fontWeight: 800,
        fontSize: 22 + tier * 3,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        transform: "skewX(-8deg)",
        color,
        textShadow: `0 2px 6px rgba(0,0,0,0.95), 0 0 18px ${color}`,
        animation: tier >= 3 ? "jgui-pop 0.22s ease-out, jgui-pulse 0.6s ease-in-out infinite 0.22s" : "jgui-pop 0.22s ease-out",
      }}
    >
      {text}
    </span>
  );
}

export interface PickupEntry {
  id: string;
  icon?: ReactNode;
  label: string;
  count?: number;
  rarity?: RarityTierName;
}

export function PickupToast({
  entry,
  index = 0,
  className,
}: {
  entry: PickupEntry;
  index?: number;
  className?: string;
}) {
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  const color = rarityColor(theme, entry.rarity);
  return (
    <div
      className={className}
      data-jgui="pickup-toast"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        color,
        opacity: 1 - index * 0.18,
        animation: "jgui-slide-up 0.24s ease-out",
      }}
    >
      {entry.icon ?? (
        <span
          style={{
            width: 8,
            height: 8,
            transform: "rotate(45deg)",
            background: color,
            boxShadow: `0 0 6px ${color}`,
            flexShrink: 0,
          }}
        />
      )}
      <span
        style={{
          fontFamily: theme.fontBody,
          fontSize: 12,
          fontWeight: 600,
          color,
          textShadow: hudTextShadow(),
        }}
      >
        {entry.label}
      </span>
      {entry.count !== undefined && (
        <span
          style={{
            fontFamily: theme.fontNumeric,
            fontSize: 12,
            color: theme.textDim,
            textShadow: hudTextShadow(),
          }}
        >
          ×{entry.count}
        </span>
      )}
    </div>
  );
}

export function PickupToastStack({
  entries,
  limit = 5,
  className,
}: {
  entries: readonly PickupEntry[];
  limit?: number;
  className?: string;
}) {
  const shown = entries.slice(Math.max(0, entries.length - limit)).reverse();
  return (
    <div className={className} data-jgui="pickup-toast-stack" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {shown.map((entry, index) => (
        <PickupToast key={entry.id} entry={entry} index={index} />
      ))}
    </div>
  );
}

export function FeedPickupToasts({
  action,
  limit = 5,
  mapEntry,
  className,
}: {
  action: string;
  limit?: number;
  mapEntry: (entry: FeedEntry<unknown>, index: number) => PickupEntry | null;
  className?: string;
}) {
  const raw = useFeed({ action, limit });
  const entries: PickupEntry[] = [];
  raw.forEach((entry, index) => {
    const mapped = mapEntry(entry, index);
    if (mapped !== null) entries.push(mapped);
  });
  return <PickupToastStack entries={entries} limit={limit} className={className} />;
}

export function LevelUpSplash({
  stat,
  durationMs = 1800,
  className,
}: {
  stat?: string;
  durationMs?: number;
  className?: string;
}) {
  const theme = useGameUiTheme();
  useGameUiKeyframes();
  const ctx = useGameContext();
  const [flash, setFlash] = useState<StatLevelUpEvent | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsubscribe = ctx.game.events.on("stat.levelUp", (event) => {
      if (stat !== undefined && event.stat !== stat) return;
      setFlash(event);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setFlash(null), durationMs);
    });
    return () => {
      unsubscribe();
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [ctx, stat, durationMs]);
  if (flash === null) return null;
  return (
    <div
      className={className}
      data-jgui="level-up-splash"
      data-levelup={flash.level}
      style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 300,
          height: 300,
          transform: "translate(-50%, -50%)",
          background: `radial-gradient(circle, ${theme.accentGlow} 0%, transparent 65%)`,
          animation: `jgui-flash ${durationMs}ms ease-out forwards`,
          pointerEvents: "none",
        }}
      />
      <span
        style={{
          position: "relative",
          fontFamily: theme.fontDisplay,
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: "0.4em",
          textTransform: "uppercase",
          color: theme.accent,
          textShadow: `0 2px 8px rgba(0,0,0,0.95), 0 0 22px ${theme.accentGlow}`,
          animation: "jgui-pop 0.3s ease-out",
        }}
      >
        Level Up
      </span>
      <span
        style={{
          position: "relative",
          fontFamily: theme.fontNumeric,
          fontSize: 44,
          fontWeight: 800,
          color: theme.textPrimary,
          textShadow: hudTextShadow(),
        }}
      >
        {flash.level}
      </span>
    </div>
  );
}
