import { type CSSProperties, type ReactNode } from "react";

import { useEntityStat, useGameStore, localPlayerEntity } from "./hooks";

/**
 * Atomic, purpose-named vitals — one component per readout (`HealthBar`, `ShieldBar`, …), never a
 * `tone`-switched umbrella and never a bundled combo. Every bar reads the same shared CSS custom
 * properties (`--jg-health`, `--jg-shield`, `--jg-xp`, plus frame/shape tokens), so a game restyles
 * the whole HUD by setting those vars once on any ancestor — theming is global, composition stays
 * the game's. A game that wants health + shield + xp stacked composes three components into its own
 * layout; the engine ships the parts, not the panel.
 *
 * Each bar accepts either an explicit `value`/`max` (pure, provider-free — for composition, tests,
 * and preview fixtures) or binds to a live entity stat (`statId`/`entityId`, defaulting to the local
 * player). It renders nothing until it has a value.
 *
 * @capability hud-vitals atomic purpose-named health/shield/mana/stamina/xp/soul/ammo/boss bars themed from shared tokens
 */

/** The shared vitals token contract — CSS custom properties every atomic bar reads. */
export interface BarTokens {
  /** Fill color per readout. */
  health?: string;
  healthLow?: string;
  mana?: string;
  stamina?: string;
  shield?: string;
  xp?: string;
  soul?: string;
  ammo?: string;
  boss?: string;
  /** Frame + shape. */
  track?: string;
  frame?: string;
  frameWidth?: string;
  radius?: string;
  height?: string;
  text?: string;
  bevel?: string;
}

const TOKEN_VAR: Record<keyof BarTokens, string> = {
  health: "--jg-health",
  healthLow: "--jg-health-low",
  mana: "--jg-mana",
  stamina: "--jg-stamina",
  shield: "--jg-shield",
  xp: "--jg-xp",
  soul: "--jg-soul",
  ammo: "--jg-ammo",
  boss: "--jg-boss",
  track: "--jg-bar-track",
  frame: "--jg-bar-frame",
  frameWidth: "--jg-bar-frame-width",
  radius: "--jg-bar-radius",
  height: "--jg-bar-height",
  text: "--jg-bar-text",
  bevel: "--jg-bar-bevel",
};

/** Built-in default values for every vitals token — the look a bare game gets. */
export const DEFAULT_BAR_TOKENS: Required<BarTokens> = {
  health: "#e5484d",
  healthLow: "#b21e23",
  mana: "#3b82f6",
  stamina: "#84cc16",
  shield: "#22d3ee",
  xp: "#a855f7",
  soul: "#c084fc",
  ammo: "#f8b84e",
  boss: "#ef4444",
  track: "rgba(0,0,0,0.55)",
  frame: "rgba(0,0,0,0.82)",
  frameWidth: "2px",
  radius: "4px",
  height: "18px",
  text: "#f5f7fa",
  bevel: "inset 0 2px 4px rgba(0,0,0,0.55), inset 0 -1px 2px rgba(255,255,255,0.08)",
};

/**
 * A style object binding vitals tokens to CSS custom properties — spread onto any HUD ancestor to
 * restyle every atomic bar under it at once. Only the keys you pass are set; the rest fall back to
 * {@link DEFAULT_BAR_TOKENS} inside the bars. This is the single global-theming seam.
 * @capability hud-vitals bind shared vitals CSS tokens onto a HUD subtree
 */
export function barTokens(tokens: BarTokens): CSSProperties {
  const style: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens)) {
    if (value !== undefined) style[TOKEN_VAR[key as keyof BarTokens]] = value;
  }
  return style as CSSProperties;
}

function clampFraction(current: number, min: number, max: number): number {
  const range = max - min;
  if (range <= 0) return 0;
  return Math.max(0, Math.min(1, (current - min) / range));
}

function cssVar(key: keyof BarTokens): string {
  return `var(${TOKEN_VAR[key]}, ${DEFAULT_BAR_TOKENS[key]})`;
}

/** Shared shape for every atomic bar — bound (statId/entityId) or explicit (value/max/min). */
/** Trough shape language — `rect` (default), `pill` (fully round), `skew` (parallelogram, upright
 * label), or `chamfer` (cut corners). Matches a game's skin without hand-rolling a local bar. */
export type BarShape = "rect" | "pill" | "skew" | "chamfer";

/** Shared props for every atomic bar — bound to a stat (`statId`/`entityId`) or explicit (`value`). */
export interface AtomicBarProps {
  /** Trough shape language. Default `rect`. */
  shape?: BarShape;
  /** Explicit current value; when set the bar is pure and needs no game provider. */
  value?: number;
  /** Explicit max (default 100 when `value` is set without one). */
  max?: number;
  /** Explicit min (default 0). */
  min?: number;
  /** Stat id to bind when `value` is omitted. */
  statId?: string;
  /** Entity to read the stat off; defaults to the local player. */
  entityId?: string;
  /** Uppercase label rendered at the start of the trough. */
  label?: string;
  /** Show the centered `current / max` readout. Default true. */
  showValue?: boolean;
  /** Trough width in px (or any CSS length). Default 200. */
  width?: number | string;
  /** Divide the trough into N segments with tick dividers (hearts/ammo/evo style). */
  segments?: number;
  /** A ReactNode anchored at the start — portrait / orb / icon. Composes, never bundled. */
  endCap?: ReactNode;
  style?: CSSProperties;
  className?: string;
}

interface RenderBarConfig {
  colorKey: keyof BarTokens;
  /** Below `lowThreshold`, swap the fill to this token (health danger flash). */
  lowColorKey?: keyof BarTokens;
  lowThreshold?: number;
  dataBar: string;
}

const SKEW_DEG = 8;

/** Shape → trough clip/radius/transform, plus the counter-transform that keeps the label upright. */
function shapeStyles(shape: BarShape): { trough: CSSProperties; label: CSSProperties } {
  switch (shape) {
    case "pill":
      return { trough: { borderRadius: 9999 }, label: {} };
    case "skew":
      return { trough: { borderRadius: 2, transform: `skewX(-${SKEW_DEG}deg)` }, label: { transform: `skewX(${SKEW_DEG}deg)` } };
    case "chamfer":
      return { trough: { borderRadius: 0, clipPath: "polygon(7px 0, 100% 0, calc(100% - 7px) 100%, 0 100%)" }, label: {} };
    default:
      return { trough: { borderRadius: cssVar("radius") }, label: {} };
  }
}

/** The pure, hook-free bar renderer every atomic component funnels through. */
function BarView({
  fraction,
  valueText,
  config,
  label,
  width = 200,
  segments,
  endCap,
  shape = "rect",
  style,
  className,
}: {
  fraction: number;
  valueText: string | null;
  config: RenderBarConfig;
  label?: string;
  width?: number | string;
  segments?: number;
  endCap?: ReactNode;
  shape?: BarShape;
  style?: CSSProperties;
  className?: string;
}) {
  const low =
    config.lowColorKey !== undefined && fraction <= (config.lowThreshold ?? 0.25);
  const fill = cssVar(low ? config.lowColorKey! : config.colorKey);
  const shaped = shapeStyles(shape);
  const trough = (
    <div
      data-bar={config.dataBar}
      data-bar-shape={shape}
      data-fill-fraction={fraction.toFixed(4)}
      {...(low ? { "data-low": "" } : {})}
      style={{
        position: "relative",
        flex: endCap === undefined ? undefined : "1 1 auto",
        width: endCap === undefined ? "100%" : undefined,
        height: cssVar("height"),
        border: `${cssVar("frameWidth")} solid ${cssVar("frame")}`,
        background: cssVar("track"),
        boxShadow: cssVar("bevel"),
        overflow: "hidden",
        boxSizing: "border-box",
        ...shaped.trough,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: `${fraction * 100}%`,
          background: fill,
          transition: "width 160ms ease",
        }}
      />
      {/* top gloss highlight */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: `${fraction * 100}%`,
          background: "linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0) 48%)",
          pointerEvents: "none",
        }}
      />
      {segments !== undefined && segments > 1
        ? Array.from({ length: segments - 1 }, (_, index) => (
            <div
              key={index}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${((index + 1) / segments) * 100}%`,
                width: 1,
                background: "rgba(0,0,0,0.45)",
              }}
            />
          ))
        : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: label === undefined ? "center" : "space-between",
          padding: "0 6px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.3,
          color: cssVar("text"),
          textShadow: "0 1px 2px rgba(0,0,0,0.85)",
          pointerEvents: "none",
        }}
      >
        {label !== undefined ? <span style={{ textTransform: "uppercase", opacity: 0.85, ...shaped.label }}>{label}</span> : null}
        {valueText !== null ? <span style={{ fontVariantNumeric: "tabular-nums", ...shaped.label }}>{valueText}</span> : null}
      </div>
    </div>
  );

  if (endCap === undefined) {
    return (
      <div className={className} style={{ display: "inline-block", width, ...style }}>
        {trough}
      </div>
    );
  }
  return (
    <div className={className} style={{ display: "flex", alignItems: "center", gap: 6, width, ...style }}>
      {endCap}
      {trough}
    </div>
  );
}

function valueReadout(current: number, max: number, show: boolean): string | null {
  if (!show) return null;
  return `${Math.round(current)} / ${Math.round(max)}`;
}

/** Renders an atomic bar from an explicit value — pure, no game provider needed. */
function StaticBar({ props, config }: { props: AtomicBarProps; config: RenderBarConfig }) {
  const min = props.min ?? 0;
  const max = props.max ?? 100;
  const current = props.value ?? 0;
  return (
    <BarView
      fraction={clampFraction(current, min, max)}
      valueText={valueReadout(current, max, props.showValue ?? true)}
      config={config}
      label={props.label}
      width={props.width}
      segments={props.segments}
      endCap={props.endCap}
      shape={props.shape}
      style={props.style}
      className={props.className}
    />
  );
}

/** Renders an atomic bar bound to a live entity stat. */
function BoundBar({ props, config, defaultStatId }: { props: AtomicBarProps; config: RenderBarConfig; defaultStatId: string }) {
  const id = useGameStore((ctx) => props.entityId ?? localPlayerEntity(ctx)?.id ?? null);
  const stat = useEntityStat(id ?? "", props.statId ?? defaultStatId);
  if (id === null || stat === null) return null;
  return (
    <BarView
      fraction={clampFraction(stat.current, stat.min, stat.max)}
      valueText={valueReadout(stat.current, stat.max, props.showValue ?? true)}
      config={config}
      label={props.label}
      width={props.width}
      segments={props.segments}
      endCap={props.endCap}
      shape={props.shape}
      style={props.style}
      className={props.className}
    />
  );
}

function atomicBar(defaultStatId: string, config: RenderBarConfig) {
  return function AtomicBar(props: AtomicBarProps) {
    return props.value !== undefined ? (
      <StaticBar props={props} config={config} />
    ) : (
      <BoundBar props={props} config={config} defaultStatId={defaultStatId} />
    );
  };
}

/** Player/enemy health — danger-flashes to `--jg-health-low` below a quarter full. */
export const HealthBar = atomicBar("health", { colorKey: "health", lowColorKey: "healthLow", lowThreshold: 0.25, dataBar: "health" });
/** Absorb/armor shield overlay. */
export const ShieldBar = atomicBar("shield", { colorKey: "shield", dataBar: "shield" });
/** Spell/energy resource pool. */
export const ManaBar = atomicBar("mana", { colorKey: "mana", dataBar: "mana" });
/** Sprint/action stamina pool. */
export const StaminaBar = atomicBar("stamina", { colorKey: "stamina", dataBar: "stamina" });
/** Level progress / experience. */
export const ExperienceBar = atomicBar("xp", { colorKey: "xp", dataBar: "xp" });
/** Resource-charge / soul-box meter — segmented by default. */
export const SoulBar = atomicBar("soul", { colorKey: "soul", dataBar: "soul" });

/** A wide encounter/boss health bar with the boss name at the start. */
export function BossBar(props: AtomicBarProps & { name?: string }) {
  const merged: AtomicBarProps = { width: 420, ...props, label: props.label ?? props.name };
  return props.value !== undefined ? (
    <StaticBar props={merged} config={{ colorKey: "boss", dataBar: "boss" }} />
  ) : (
    <BoundBar props={merged} config={{ colorKey: "boss", dataBar: "boss" }} defaultStatId="health" />
  );
}

/** Loaded-vs-reserve ammunition counter — a segmented magazine plus a reserve tally. */
export function AmmoCounter({
  loaded,
  reserve,
  magazine,
  width = 160,
  style,
  className,
}: {
  loaded: number;
  reserve?: number;
  /** Magazine capacity; drives the segment count and fill fraction. Default = `loaded`. */
  magazine?: number;
  width?: number | string;
  style?: CSSProperties;
  className?: string;
}) {
  const cap = magazine ?? Math.max(loaded, 1);
  return (
    <div
      className={className}
      data-bar="ammo"
      style={{ display: "flex", alignItems: "center", gap: 8, width, color: cssVar("text"), ...style }}
    >
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <BarView
          fraction={clampFraction(loaded, 0, cap)}
          valueText={`${loaded}`}
          config={{ colorKey: "ammo", dataBar: "ammo-mag" }}
          width="100%"
          segments={cap <= 20 ? cap : undefined}
          style={{ display: "block" }}
        />
      </div>
      {reserve !== undefined ? (
        <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums", opacity: 0.8, textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>
          /{reserve}
        </span>
      ) : null}
    </div>
  );
}
