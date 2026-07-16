import { useMemo, type CSSProperties, type DragEventHandler, type ReactNode } from "react";

import type { AbilityKit } from "@jgengine/core/combat/abilityKit";
import { groundSpeed } from "@jgengine/core/scene/entityStore";

import { useAbilitySlot, useCurrency, useEntityStat, useGameClock, useGameStore, useInventory, localPlayerEntity } from "./hooks";
import { Keycap } from "./keyHint";

/**
 * Drop-in HUD components — good-looking with zero styling, and fully opt-in: a game imports only the
 * pieces it wants (`StatBar`, `Hotbar`, `Speedometer`, `Clock`, `WaveBanner`, `Coins`, `Crosshair`)
 * and places them itself. The engine imposes none of these; there is no forced HUD. Styling is
 * self-contained inline CSS (no Tailwind `@source` needed) with a shared dark-glass look; pass
 * `style`/`className` to override. Anything reading the player defaults to the local player entity.
 *
 * @capability hud-components opt-in drop-in health/hotbar/speed/clock/wave/currency HUD widgets
 */

const PANEL: CSSProperties = {
  background: "rgba(10,12,16,0.62)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 10,
  color: "#f4f6fb",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
  boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
};

/** Named color ramps for {@link StatBar} tones. `fn` maps fill fraction (0..1) → gradient stops. */
const TONES: Record<string, (t: number) => [string, string]> = {
  health: (t) => (t > 0.5 ? ["#22c55e", "#4ade80"] : t > 0.25 ? ["#f59e0b", "#fbbf24"] : ["#dc2626", "#f87171"]),
  mana: () => ["#2563eb", "#60a5fa"],
  stamina: () => ["#65a30d", "#a3e635"],
  shield: () => ["#0891b2", "#22d3ee"],
  xp: () => ["#7c3aed", "#a78bfa"],
  neutral: () => ["#475569", "#94a3b8"],
};

/** A stat tone — picks the bar's color ramp. */
export type StatTone = keyof typeof TONES;

function useLocalPlayerId(entityId: string | undefined): string | null {
  return useGameStore((ctx) => entityId ?? localPlayerEntity(ctx)?.id ?? null);
}

/** Where {@link StatBar} draws its label/readout relative to the rail. */
export type StatLabelPlacement = "above" | "inside" | "below" | "none";

/** A dimmer fill drawn behind {@link StatBar}'s main fill — the rested-XP / ghost-health underlay. */
export interface StatUnderlay {
  /** Underlay fill fraction 0..1. */
  fraction: number;
  /** CSS color/background for the underlay. */
  color: string;
}

/**
 * A polished stat bar (health/mana/stamina/shield/xp) — a rounded, glassy meter with a tone-colored
 * fill and an optional value readout. Two ways to feed it: bind to an entity stat (`statId` off
 * `entityId`, defaulting to the local player), or pass raw `value`/`max` numbers directly for a pool
 * the engine doesn't own (a boss's hp, a sub-entity's shield). `value` wins when both are given;
 * `max` defaults to 100. The entity-bound form renders nothing until its stat exists.
 *
 * Skinnable enough to host a game's own art: `fill` overrides the tone ramp with any CSS color/gradient
 * (a constant color no longer drains toward red); `capped` + `fillCapped` swap the fill once a pool tops
 * out (rested-XP → gold); `underlay` draws a second fill behind the main one; `labelPlacement` moves the
 * readout above/inside/below the rail (or hides it); `railHeight`/`railRadius`/`railClassName`/`railStyle`
 * restyle the track (1.5px hairlines to fat cast bars, a game's own rail CSS); `chromeless` drops the
 * engine glass so the bar sits inside the game's own panel; `gloss` adds a top-half sheen; and `width`
 * takes a string (`"100%"`, or `flex:1` via `style`) for flexing bars.
 *
 * @capability stat-bar tone-colored health/mana/pool meter, entity-bound or raw value/max, fully skinnable
 */
export function StatBar({
  statId = "health",
  entityId,
  value,
  max,
  min = 0,
  tone = "health",
  fill,
  fillCapped,
  capped = false,
  underlay,
  label,
  showValue = true,
  labelPlacement = "above",
  labelStyle,
  labelClassName,
  width = 200,
  railHeight = 8,
  railRadius = 999,
  railClassName,
  railStyle,
  gloss = false,
  chromeless = false,
  icon,
  style,
  className,
}: {
  statId?: string;
  entityId?: string;
  /** Raw current value — drives the bar directly instead of an entity stat (with `max`/`min`). */
  value?: number;
  /** Raw pool maximum, paired with `value`; defaults to 100. */
  max?: number;
  /** Raw pool minimum, paired with `value`; defaults to 0. */
  min?: number;
  tone?: StatTone;
  /** Constant CSS color/gradient for the fill — overrides `tone` (opts out of the health amber→red drain). */
  fill?: string;
  /** Fill used when `capped` — the "pool topped out" swap (e.g. rested XP going gold at max level). */
  fillCapped?: string;
  /** Force a full bar and use `fillCapped` — the game decides when the pool is capped. */
  capped?: boolean;
  /** A dimmer fill drawn behind the main fill (rested XP, ghost health). */
  underlay?: StatUnderlay;
  label?: string;
  showValue?: boolean;
  /** Where the label/readout sits relative to the rail; defaults to `"above"` (the glassy header). */
  labelPlacement?: StatLabelPlacement;
  /** Style for the inside/below label text (font, color, shadow). */
  labelStyle?: CSSProperties;
  /** Class for the inside/below label text (e.g. a game's display-font class). */
  labelClassName?: string;
  /** Bar width — a number (px) or CSS string (`"100%"`); pair `style={{ flex: 1 }}` for a flexing bar. */
  width?: number | string;
  /** Rail (track) height in px; defaults to 8. */
  railHeight?: number;
  /** Rail/fill corner radius in px; defaults to 999 (pill). */
  railRadius?: number;
  /** Class applied to the rail track — supply the game's own rail CSS (its background wins over the default). */
  railClassName?: string;
  /** Extra style merged onto the rail track. */
  railStyle?: CSSProperties;
  /** Draw a top-half white sheen inside the fill. */
  gloss?: boolean;
  /** Drop the engine glass panel + padding so the bar sits bare inside the game's own chrome. */
  chromeless?: boolean;
  icon?: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  const id = useLocalPlayerId(entityId);
  const stat = useEntityStat(id ?? "", statId);
  const pool =
    value !== undefined
      ? { current: value, min, max: max ?? 100 }
      : id === null || stat === null
        ? null
        : stat;
  if (pool === null) return null;
  const range = pool.max - pool.min;
  const rawFraction = range <= 0 ? 0 : Math.max(0, Math.min(1, (pool.current - pool.min) / range));
  const fraction = capped ? 1 : rawFraction;
  const [from, to] = (TONES[tone] ?? TONES.neutral!)(fraction);
  const resolvedFill =
    capped && fillCapped !== undefined ? fillCapped : fill ?? `linear-gradient(90deg, ${from}, ${to})`;
  const readout = `${Math.round(pool.current)} / ${Math.round(pool.max)}`;
  const insideContent = label ?? (showValue ? readout : undefined);
  const captionNode =
    labelPlacement === "inside" || labelPlacement === "below" ? (
      <span
        className={labelClassName}
        style={
          labelPlacement === "inside"
            ? { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.9)", ...labelStyle }
            : { display: "block", marginTop: 2, textAlign: "center", fontSize: 10, opacity: 0.8, ...labelStyle }
        }
      >
        {insideContent}
      </span>
    ) : null;
  const needsRelative = underlay !== undefined || labelPlacement === "inside";
  const rail = (
    <div className={railClassName} style={{ position: needsRelative ? "relative" : undefined, height: railHeight, borderRadius: railRadius, background: railClassName !== undefined ? undefined : "rgba(255,255,255,0.10)", overflow: "hidden", ...railStyle }}>
      {underlay !== undefined ? (
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${Math.max(0, Math.min(1, underlay.fraction)) * 100}%`, background: underlay.color }} />
      ) : null}
      <div style={{ ...(underlay !== undefined ? { position: "absolute", top: 0, bottom: 0, left: 0 } : { height: "100%" }), width: `${fraction * 100}%`, borderRadius: railRadius, background: resolvedFill, transition: "width 160ms ease" }}>
        {gloss ? <div style={{ height: "50%", width: "100%", background: "rgba(255,255,255,0.15)" }} /> : null}
      </div>
      {labelPlacement === "inside" ? captionNode : null}
    </div>
  );
  const outerStyle: CSSProperties = chromeless ? { width, ...style } : { ...PANEL, padding: "6px 8px", width, ...style };
  return (
    <div className={className} style={outerStyle} data-stat={statId}>
      {labelPlacement === "above" && (label !== undefined || icon !== undefined || showValue) && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 11, fontWeight: 600, letterSpacing: 0.3 }}>
          {icon}
          <span style={{ textTransform: "uppercase", opacity: 0.75 }}>{label ?? statId}</span>
          {showValue ? (
            <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", opacity: 0.9 }}>
              {Math.round(pool.current)}
              <span style={{ opacity: 0.5 }}> / {Math.round(pool.max)}</span>
            </span>
          ) : null}
        </div>
      )}
      {rail}
      {labelPlacement === "below" ? captionNode : null}
    </div>
  );
}

/**
 * A numbered hotbar bound to an inventory — glassy slots, an active-slot highlight, item id + count,
 * and a keycap per slot. Place it and pass the `inventoryId`; `activeSlot` highlights the equipped one.
 */
export function Hotbar({
  inventoryId,
  activeSlot,
  keys,
  slotSize = 46,
  style,
  className,
}: {
  inventoryId: string;
  activeSlot?: number;
  keys?: readonly string[];
  slotSize?: number;
  style?: CSSProperties;
  className?: string;
}) {
  const slots = useInventory(inventoryId);
  return (
    <div className={className} style={{ display: "flex", gap: 6, ...style }} data-inventory={inventoryId}>
      {slots.map((slot, index) => {
        const active = index === activeSlot;
        return (
          <div
            key={index}
            data-slot={index}
            style={{
              ...PANEL,
              width: slotSize,
              height: slotSize,
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderColor: active ? "rgba(56,189,248,0.9)" : "rgba(255,255,255,0.10)",
              boxShadow: active ? "0 0 0 1px rgba(56,189,248,0.7), 0 4px 16px rgba(0,0,0,0.35)" : PANEL.boxShadow,
            }}
          >
            <span style={{ position: "absolute", top: 2, left: 4, fontSize: 9, fontWeight: 700, opacity: 0.55 }}>{keys?.[index] ?? index + 1}</span>
            {slot !== null ? (
              <span style={{ fontSize: 10, textAlign: "center", lineHeight: 1.1, padding: "0 2px", wordBreak: "break-word" }}>
                {slot.itemId}
                {slot.count > 1 ? <span style={{ display: "block", opacity: 0.6 }}>×{slot.count}</span> : null}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** How an {@link AbilityButton} draws its remaining cooldown — a clockwise radial wedge or a bottom-up bar. */
export type AbilitySweep = "radial" | "vertical";

function cooldownLabel(remainingMs: number): string {
  const seconds = remainingMs / 1000;
  return seconds >= 10 ? `${Math.ceil(seconds)}` : `${Math.max(0, seconds).toFixed(1)}`;
}

/**
 * A cooldown-aware ability button bound to an `AbilityKit` slot — the drop-in skin over
 * {@link useAbilitySlot}. It reads the slot each heartbeat and renders every readiness cue for free:
 * a radial or vertical cooldown sweep, remaining-seconds text, a global-cooldown dim, an
 * insufficient-resource tint, a just-cast flash, and a level-lock state. Pass `keyHint` for a keycap,
 * `children` (or `icon`/`label`) to skin the face, and `onActivate` to fire the cast — the button
 * calls it only when the slot is castable and unlocked. The engine imposes no ability bar; place these
 * yourself.
 *
 * Every imposed visual is overridable so a game can host its own art on this behavior: `chromeless`
 * drops the engine glass so a game skin (its own `className`) shows through; `cooldownText` reformats
 * the remaining-time label (e.g. whole `Math.ceil` seconds); `noResourceStyle`/`flashStyle`/`dimStyle`
 * replace the built-in blue tint / white flash / gcd dim with the game's own (a red text tint, a gold
 * glow); `sweepColor` recolors the cooldown wipe; `dimmed`/`gcdRemainingMs` dim the button from an
 * external global cooldown the kit doesn't own; `wrapKeyHint`/`wrapLock` let the game render the keycap
 * and lock marker raw instead of the default `<Keycap>`/centered form; and `draggable`/`onDragStart`/
 * `onDragOver`/`onDrop` (+ `keepEnabled`) make the button a drag-assign source/target even mid-cooldown.
 *
 * @capability ability-button cooldown/GCD/resource-aware ability button over an AbilityKit slot, fully skinnable
 */
export function AbilityButton({
  kit,
  slotId,
  resourceAvailable,
  onActivate,
  keyHint,
  wrapKeyHint = true,
  locked = false,
  lockLabel,
  wrapLock = true,
  sweep = "radial",
  sweepColor = "rgba(6,8,12,0.62)",
  size = 52,
  icon,
  label,
  children,
  showCooldownText = true,
  cooldownText,
  cooldownTextStyle,
  cooldownTextClassName,
  noResourceStyle,
  flashStyle,
  dimStyle,
  dimmed = false,
  gcdRemainingMs,
  chromeless = false,
  keepEnabled = false,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  title,
  intervalMs,
  style,
  className,
}: {
  kit: AbilityKit;
  slotId: string;
  /** Spendable resource for affordability (overrides the kit's bound pool for this readout). */
  resourceAvailable?: number;
  /** Fired on click when the slot is ready and unlocked — wire the cast here (the button never casts itself). */
  onActivate?: (slotId: string) => void;
  /** Keycap/binding hint rendered in the corner (e.g. a `<Keycap>` or a plain string). */
  keyHint?: ReactNode;
  /** Wrap `keyHint` in the default `<Keycap>` + corner position; set false to render the node raw (game positions it). */
  wrapKeyHint?: boolean;
  /** Level/unlock gate: greys the button out, blocks activation, and shows `lockLabel`. */
  locked?: boolean;
  lockLabel?: ReactNode;
  /** Wrap `lockLabel` in the default centered overlay; set false to render it raw (game positions it). */
  wrapLock?: boolean;
  /** Cooldown sweep shape; defaults to `"radial"`. */
  sweep?: AbilitySweep;
  /** Color of the cooldown sweep wipe; defaults to the dark engine dim. */
  sweepColor?: string;
  size?: number;
  /** Face content — `children` wins, else `icon` over `label`. */
  icon?: ReactNode;
  label?: ReactNode;
  children?: ReactNode;
  showCooldownText?: boolean;
  /** Format the remaining-cooldown label; defaults to decimals under 10s, whole seconds above. */
  cooldownText?: (remainingMs: number) => ReactNode;
  /** Style for the cooldown-text overlay. */
  cooldownTextStyle?: CSSProperties;
  /** Class for the cooldown-text overlay (e.g. a game's display-font class). */
  cooldownTextClassName?: string;
  /** Replaces the default blue no-resource overlay — merged onto the button root (e.g. a red text tint). */
  noResourceStyle?: CSSProperties;
  /** Replaces the default white just-cast flash overlay — merged onto the button root (e.g. a gold glow). */
  flashStyle?: CSSProperties;
  /** Overlay style for the gcd dim; when set, replaces the default opacity dim with this overlay. */
  dimStyle?: CSSProperties;
  /** Dim the button from an external global cooldown the kit doesn't track. */
  dimmed?: boolean;
  /** Remaining ms on an external global cooldown; >0 dims the button (independent of the kit's groups). */
  gcdRemainingMs?: number;
  /** Drop the engine glass panel so the game's own `className` skin shows through. */
  chromeless?: boolean;
  /** Keep the button enabled (not `disabled`) when not castable — needed so drag events still fire mid-cooldown. */
  keepEnabled?: boolean;
  /** Drag props passed straight to the button so it can be a drag-assign source/target. */
  draggable?: boolean;
  onDragStart?: DragEventHandler<HTMLButtonElement>;
  onDragOver?: DragEventHandler<HTMLButtonElement>;
  onDrop?: DragEventHandler<HTMLButtonElement>;
  /** Native hover tooltip on the button. */
  title?: string;
  intervalMs?: number;
  style?: CSSProperties;
  className?: string;
}) {
  const slot = useAbilitySlot(kit, slotId, resourceAvailable, intervalMs === undefined ? undefined : { intervalMs });
  const fraction = slot === null ? 0 : Math.max(0, Math.min(1, slot.cooldownFraction));
  const remainingMs = slot?.cooldownRemainingMs ?? 0;
  const noResource = slot?.state === "no-resource";
  const flashing = slot?.justCast === true;
  const internalGcdOnly = slot !== null && slot.groupRemainingMs > 0 && slot.cooldownRemainingMs === slot.groupRemainingMs;
  const dimActive = !locked && (internalGcdOnly || dimmed || (gcdRemainingMs ?? 0) > 0);
  const castable = !locked && slot !== null && slot.ready;
  const overlay: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" };
  const renderLabel = cooldownText ?? cooldownLabel;
  return (
    <button
      type="button"
      disabled={keepEnabled ? undefined : !castable}
      onClick={() => {
        if (castable) onActivate?.(slotId);
      }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      title={title}
      className={className}
      data-ability={slotId}
      data-locked={locked || undefined}
      style={{
        ...(chromeless ? {} : PANEL),
        position: "relative",
        width: size,
        height: size,
        padding: 0,
        overflow: "hidden",
        cursor: castable ? "pointer" : "default",
        opacity: locked ? 0.5 : dimActive && dimStyle === undefined ? 0.82 : 1,
        ...(!chromeless ? { borderColor: flashing && flashStyle === undefined ? "rgba(250,250,255,0.95)" : (PANEL.borderColor as string) } : {}),
        ...(flashing ? flashStyle : undefined),
        ...(noResource ? noResourceStyle : undefined),
        ...style,
      }}
    >
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 2, fontSize: 11, fontWeight: 600, filter: locked ? "grayscale(1)" : undefined }}>
        {children ?? (
          <>
            {icon}
            {label !== undefined ? <span style={{ opacity: 0.85 }}>{label}</span> : null}
          </>
        )}
      </span>
      {fraction > 0 ? (
        sweep === "radial" ? (
          <span style={{ ...overlay, background: `conic-gradient(${sweepColor} ${fraction * 360}deg, transparent 0)` }} />
        ) : (
          <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${fraction * 100}%`, background: sweepColor, pointerEvents: "none" }} />
        )
      ) : null}
      {noResource && noResourceStyle === undefined ? <span style={{ ...overlay, background: "rgba(37,99,235,0.28)" }} /> : null}
      {flashing && flashStyle === undefined ? <span style={{ ...overlay, background: "rgba(255,255,255,0.35)" }} /> : null}
      {dimActive && dimStyle !== undefined && fraction === 0 ? <span style={{ ...overlay, ...dimStyle }} /> : null}
      {showCooldownText && remainingMs > 0 && !locked ? (
        <span className={cooldownTextClassName} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "#f8fafc", textShadow: "0 1px 3px rgba(0,0,0,0.7)", fontVariantNumeric: "tabular-nums", pointerEvents: "none", ...cooldownTextStyle }}>
          {renderLabel(remainingMs)}
        </span>
      ) : null}
      {locked ? (
        wrapLock ? (
          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#e2e8f0", pointerEvents: "none" }}>
            {lockLabel ?? "🔒"}
          </span>
        ) : (
          lockLabel
        )
      ) : null}
      {keyHint !== undefined ? (
        wrapKeyHint ? (
          <span style={{ position: "absolute", top: 2, right: 3, fontSize: 9, fontWeight: 700, opacity: 0.7, pointerEvents: "none" }}>
            <Keycap>{keyHint}</Keycap>
          </span>
        ) : (
          keyHint
        )
      ) : null}
    </button>
  );
}

/**
 * A speedometer for an entity (defaults to the local player) — an SVG arc gauge + a digital readout.
 * `scale` converts world units/second to your display unit (3.6 → km/h, 2.237 → mph); `max` sets the
 * gauge's top of scale.
 */
export function Speedometer({
  entityId,
  scale = 3.6,
  unit = "km/h",
  max = 60,
  size = 96,
  style,
  className,
}: {
  entityId?: string;
  scale?: number;
  unit?: string;
  max?: number;
  size?: number;
  style?: CSSProperties;
  className?: string;
}) {
  const speed = useGameStore((ctx) => {
    const entity = entityId === undefined ? localPlayerEntity(ctx) : ctx.scene.entity.get(entityId);
    return entity === null ? 0 : groundSpeed(entity) * scale;
  });
  const fraction = Math.max(0, Math.min(1, speed / max));
  // 240° sweep from -210° to +30°.
  const startDeg = -210;
  const sweep = 240;
  const radius = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  const arc = (fromFrac: number, toFrac: number) => {
    const a0 = ((startDeg + sweep * fromFrac) * Math.PI) / 180;
    const a1 = ((startDeg + sweep * toFrac) * Math.PI) / 180;
    const large = sweep * (toFrac - fromFrac) > 180 ? 1 : 0;
    return `M ${cx + radius * Math.cos(a0)} ${cy + radius * Math.sin(a0)} A ${radius} ${radius} 0 ${large} 1 ${cx + radius * Math.cos(a1)} ${cy + radius * Math.sin(a1)}`;
  };
  return (
    <div className={className} style={{ ...PANEL, width: size, padding: 6, textAlign: "center", ...style }}>
      <svg width={size - 12} height={(size - 12) * 0.72} viewBox={`0 0 ${size} ${size * 0.72}`} style={{ display: "block", margin: "0 auto" }}>
        <path d={arc(0, 1)} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={7} strokeLinecap="round" />
        <path d={arc(0, fraction)} fill="none" stroke={fraction > 0.85 ? "#f87171" : "#38bdf8"} strokeWidth={7} strokeLinecap="round" />
      </svg>
      <div style={{ marginTop: -8, fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 18, lineHeight: 1 }}>{Math.round(speed)}</div>
      <div style={{ fontSize: 9, opacity: 0.6, letterSpacing: 0.4, textTransform: "uppercase" }}>{unit}</div>
    </div>
  );
}

/**
 * A time-of-day clock reading the sim calendar — `Day N · HH:MM`, 24h or 12h. `controls` adds
 * pause + the game's speed multipliers as clickable pills (the "fast-forward" bar), off by default so
 * a game opts into letting the player scrub time.
 */
export function Clock({
  format = "24h",
  showDay = true,
  controls = false,
  style,
  className,
}: {
  format?: "24h" | "12h";
  showDay?: boolean;
  controls?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  const clock = useGameClock();
  const { hour, minute, day } = clock.calendar;
  const label = useMemo(() => {
    const mm = minute.toString().padStart(2, "0");
    if (format === "12h") {
      const h12 = hour % 12 === 0 ? 12 : hour % 12;
      return `${h12}:${mm} ${hour < 12 ? "AM" : "PM"}`;
    }
    return `${hour.toString().padStart(2, "0")}:${mm}`;
  }, [hour, minute, format]);
  return (
    <div className={className} style={{ ...PANEL, padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: 8, fontVariantNumeric: "tabular-nums", ...style }}>
      {showDay ? <span style={{ fontSize: 11, opacity: 0.6 }}>Day {day + 1}</span> : null}
      <span style={{ fontWeight: 700, fontSize: 14 }}>{label}</span>
      {controls ? (
        <span style={{ display: "inline-flex", gap: 3, marginLeft: 4 }}>
          <ClockPill label={clock.paused ? "▶" : "❚❚"} active={false} onClick={() => (clock.paused ? clock.controls.play() : clock.controls.pause())} />
          {clock.speeds.map((s) => (
            <ClockPill key={s} label={`${s}×`} active={!clock.paused && clock.speed === s} onClick={() => clock.controls.setSpeed(s)} />
          ))}
        </span>
      ) : null}
    </div>
  );
}

function ClockPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        pointerEvents: "auto",
        cursor: "pointer",
        fontSize: 10,
        fontWeight: 600,
        padding: "1px 6px",
        borderRadius: 6,
        border: "none",
        color: active ? "#0a0c10" : "#cbd5e1",
        background: active ? "#38bdf8" : "rgba(255,255,255,0.08)",
      }}
    >
      {label}
    </button>
  );
}

/**
 * A wave / round banner — a bold centered pill for "WAVE 3" style callouts, with an optional subtitle
 * (enemies remaining, timer). Pure display: pass the current `wave` and whatever subtitle you track.
 */
export function WaveBanner({
  wave,
  label = "Wave",
  subtitle,
  style,
  className,
}: {
  wave: number | string;
  label?: string;
  subtitle?: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div className={className} style={{ ...PANEL, padding: "6px 16px", textAlign: "center", display: "inline-block", ...style }}>
      <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", opacity: 0.65 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}>{wave}</div>
      {subtitle !== undefined ? <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{subtitle}</div> : null}
    </div>
  );
}

/** A currency counter — an icon (emoji/char, default a coin) plus the live amount for `currencyId`. */
export function Coins({
  currencyId,
  icon = "🪙",
  style,
  className,
}: {
  currencyId: string;
  icon?: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  const amount = useCurrency(currencyId);
  return (
    <span className={className} style={{ ...PANEL, padding: "3px 10px", display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, fontVariantNumeric: "tabular-nums", ...style }} data-currency={currencyId}>
      <span aria-hidden>{icon}</span>
      {amount}
    </span>
  );
}

/** A minimal center crosshair reticle — four ticks around a gap. Purely presentational. */
export function Crosshair({
  size = 18,
  gap = 5,
  thickness = 2,
  color = "rgba(255,255,255,0.85)",
  style,
  className,
}: {
  size?: number;
  gap?: number;
  thickness?: number;
  color?: string;
  style?: CSSProperties;
  className?: string;
}) {
  const tick = (extra: CSSProperties): CSSProperties => ({ position: "absolute", background: color, borderRadius: thickness, ...extra });
  return (
    <div className={className} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", ...style }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <div style={tick({ left: "50%", top: 0, width: thickness, height: size / 2 - gap, transform: "translateX(-50%)" })} />
        <div style={tick({ left: "50%", bottom: 0, width: thickness, height: size / 2 - gap, transform: "translateX(-50%)" })} />
        <div style={tick({ top: "50%", left: 0, height: thickness, width: size / 2 - gap, transform: "translateY(-50%)" })} />
        <div style={tick({ top: "50%", right: 0, height: thickness, width: size / 2 - gap, transform: "translateY(-50%)" })} />
      </div>
    </div>
  );
}
