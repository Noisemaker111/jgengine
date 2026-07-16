import { useMemo, type CSSProperties, type ReactNode } from "react";

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

/**
 * A polished stat bar (health/mana/stamina/shield/xp) — a rounded, glassy meter with a tone-colored
 * fill and an optional value readout. Two ways to feed it: bind to an entity stat (`statId` off
 * `entityId`, defaulting to the local player), or pass raw `value`/`max` numbers directly for a pool
 * the engine doesn't own (a boss's hp, a sub-entity's shield). `value` wins when both are given;
 * `max` defaults to 100. The entity-bound form renders nothing until its stat exists.
 *
 * @capability stat-bar tone-colored health/mana/pool meter, entity-bound or raw value/max
 */
export function StatBar({
  statId = "health",
  entityId,
  value,
  max,
  min = 0,
  tone = "health",
  label,
  showValue = true,
  width = 200,
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
  label?: string;
  showValue?: boolean;
  width?: number;
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
  const fraction = range <= 0 ? 0 : Math.max(0, Math.min(1, (pool.current - pool.min) / range));
  const [from, to] = (TONES[tone] ?? TONES.neutral!)(fraction);
  return (
    <div className={className} style={{ ...PANEL, padding: "6px 8px", width, ...style }} data-stat={statId}>
      {(label !== undefined || icon !== undefined || showValue) && (
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
      <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.10)", overflow: "hidden" }}>
        <div style={{ width: `${fraction * 100}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${from}, ${to})`, transition: "width 160ms ease" }} />
      </div>
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
 * @capability ability-button cooldown/GCD/resource-aware ability button over an AbilityKit slot
 */
export function AbilityButton({
  kit,
  slotId,
  resourceAvailable,
  onActivate,
  keyHint,
  locked = false,
  lockLabel,
  sweep = "radial",
  size = 52,
  icon,
  label,
  children,
  showCooldownText = true,
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
  /** Level/unlock gate: greys the button out, blocks activation, and shows `lockLabel`. */
  locked?: boolean;
  lockLabel?: ReactNode;
  /** Cooldown sweep shape; defaults to `"radial"`. */
  sweep?: AbilitySweep;
  size?: number;
  /** Face content — `children` wins, else `icon` over `label`. */
  icon?: ReactNode;
  label?: ReactNode;
  children?: ReactNode;
  showCooldownText?: boolean;
  intervalMs?: number;
  style?: CSSProperties;
  className?: string;
}) {
  const slot = useAbilitySlot(kit, slotId, resourceAvailable, intervalMs === undefined ? undefined : { intervalMs });
  const fraction = slot === null ? 0 : Math.max(0, Math.min(1, slot.cooldownFraction));
  const remainingMs = slot?.cooldownRemainingMs ?? 0;
  const noResource = slot?.state === "no-resource";
  const flashing = slot?.justCast === true;
  const gcdOnly = slot !== null && slot.groupRemainingMs > 0 && slot.cooldownRemainingMs === slot.groupRemainingMs;
  const castable = !locked && slot !== null && slot.ready;
  const overlay: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" };
  return (
    <button
      type="button"
      disabled={!castable}
      onClick={castable ? () => onActivate?.(slotId) : undefined}
      className={className}
      data-ability={slotId}
      data-locked={locked || undefined}
      style={{
        ...PANEL,
        position: "relative",
        width: size,
        height: size,
        padding: 0,
        overflow: "hidden",
        cursor: castable ? "pointer" : "default",
        opacity: locked ? 0.5 : gcdOnly ? 0.82 : 1,
        borderColor: flashing ? "rgba(250,250,255,0.95)" : PANEL.borderColor as string,
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
          <span style={{ ...overlay, background: `conic-gradient(rgba(6,8,12,0.62) ${fraction * 360}deg, transparent 0)` }} />
        ) : (
          <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${fraction * 100}%`, background: "rgba(6,8,12,0.62)", pointerEvents: "none" }} />
        )
      ) : null}
      {noResource ? <span style={{ ...overlay, background: "rgba(37,99,235,0.28)" }} /> : null}
      {flashing ? <span style={{ ...overlay, background: "rgba(255,255,255,0.35)" }} /> : null}
      {showCooldownText && remainingMs > 0 && !locked ? (
        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "#f8fafc", textShadow: "0 1px 3px rgba(0,0,0,0.7)", fontVariantNumeric: "tabular-nums", pointerEvents: "none" }}>
          {cooldownLabel(remainingMs)}
        </span>
      ) : null}
      {locked ? (
        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#e2e8f0", pointerEvents: "none" }}>
          {lockLabel ?? "🔒"}
        </span>
      ) : null}
      {keyHint !== undefined ? (
        <span style={{ position: "absolute", top: 2, right: 3, fontSize: 9, fontWeight: 700, opacity: 0.7, pointerEvents: "none" }}>
          <Keycap>{keyHint}</Keycap>
        </span>
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
