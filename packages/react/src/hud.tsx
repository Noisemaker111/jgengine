import { useMemo, type CSSProperties, type ReactNode } from "react";

import { groundSpeed } from "@jgengine/core/scene/entityStore";

import { iconForItemId } from "./gameIcons";
import { hudFrameStyle } from "./hudFrame";
import { IconTreatment, schoolForItem } from "./iconTreatment";
import { useCurrency, useEntityStat, useGameClock, useGameStore, useInventory, localPlayerEntity } from "./hooks";

/**
 * Drop-in HUD components — good-looking with zero styling, and fully opt-in: a game imports only the
 * pieces it wants (`StatBar`, `Hotbar`, `Speedometer`, `Clock`, `WaveBanner`, `Coins`, `Crosshair`)
 * and places them itself. The engine imposes none of these; there is no forced HUD. Styling is
 * self-contained inline CSS (no Tailwind `@source` needed) with a shared dark-glass look; pass
 * `style`/`className` to override. Anything reading the player defaults to the local player entity.
 *
 * @capability hud-components opt-in drop-in health/hotbar/speed/clock/wave/currency HUD widgets
 */

const PANEL: CSSProperties = hudFrameStyle("glass");

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
 * fill and an optional value readout. Reads `statId` off `entityId` (defaults to the local player).
 * Renders nothing until the stat exists.
 *
 * @deprecated The `tone`-switched umbrella is being retired (#1033). Use the atomic, purpose-named,
 * token-themed bars from `@jgengine/react/bars` instead — `HealthBar`, `ShieldBar`, `ManaBar`,
 * `StaminaBar`, `ExperienceBar`, `SoulBar`, `BossBar`, `AmmoCounter` — each does one readout and is
 * restyled globally via the shared `--jg-*` tokens (`barTokens`). Kept as a thin shim during migration.
 */
export function StatBar({
  statId = "health",
  entityId,
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
  if (id === null || stat === null) return null;
  const range = stat.max - stat.min;
  const fraction = range <= 0 ? 0 : Math.max(0, Math.min(1, (stat.current - stat.min) / range));
  const [from, to] = (TONES[tone] ?? TONES.neutral!)(fraction);
  return (
    <div className={className} style={{ ...PANEL, padding: "6px 8px", width, ...style }} data-stat={statId}>
      {(label !== undefined || icon !== undefined || showValue) && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 11, fontWeight: 600, letterSpacing: 0.3 }}>
          {icon}
          <span style={{ textTransform: "uppercase", opacity: 0.75 }}>{label ?? statId}</span>
          {showValue ? (
            <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", opacity: 0.9 }}>
              {Math.round(stat.current)}
              <span style={{ opacity: 0.5 }}> / {Math.round(stat.max)}</span>
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
 * A numbered hotbar bound to an inventory — painted iconed slots (a `GameIcon` glyph over a
 * school-keyed gradient with a count badge, #1035), an active-slot highlight, and a keycap per slot.
 * Place it and pass the `inventoryId`; `activeSlot` highlights the equipped one. Supply `itemIcon` to
 * map your item ids to your own glyphs — the default resolves a `GameIcon` from the item id.
 */
export function Hotbar({
  inventoryId,
  activeSlot,
  keys,
  slotSize = 46,
  itemIcon,
  style,
  className,
}: {
  inventoryId: string;
  activeSlot?: number;
  keys?: readonly string[];
  slotSize?: number;
  /** Caller-supplied item id → icon registry; return null/undefined to fall back to the default glyph. */
  itemIcon?: (itemId: string) => ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  const slots = useInventory(inventoryId);
  return (
    <div className={className} style={{ display: "flex", gap: 6, ...style }} data-inventory={inventoryId}>
      {slots.map((slot, index) => {
        const active = index === activeSlot;
        const keycap = keys?.[index] ?? String(index + 1);
        const custom = slot !== null ? itemIcon?.(slot.itemId) : undefined;
        return (
          <div
            key={index}
            data-slot={index}
            style={{
              width: slotSize,
              height: slotSize,
              position: "relative",
            }}
          >
            {slot !== null ? (
              custom !== undefined && custom !== null ? (
                <IconTreatment glyph={custom} size={slotSize} count={slot.count} keycap={keycap} active={active} />
              ) : (
                <IconTreatment
                  {...(iconForItemId(slot.itemId) === null ? {} : { icon: iconForItemId(slot.itemId)! })}
                  school={schoolForItem(slot.itemId)}
                  size={slotSize}
                  count={slot.count}
                  keycap={keycap}
                  active={active}
                />
              )
            ) : (
              <div
                style={{
                  ...PANEL,
                  width: slotSize,
                  height: slotSize,
                  position: "relative",
                  borderColor: active ? "rgba(56,189,248,0.9)" : "rgba(255,255,255,0.10)",
                }}
              >
                <span style={{ position: "absolute", top: 2, left: 4, fontSize: 9, fontWeight: 700, opacity: 0.55 }}>{keycap}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
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
