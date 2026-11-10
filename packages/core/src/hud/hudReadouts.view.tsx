/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef, type CSSProperties, type ReactNode } from "@jgengine/core/ui/jsx";

import { groundSpeed } from "@jgengine/core/scene/entityStore";

import { iconForItemId } from "@jgengine/core/ui/icons/gameIcons.view";
import { hudFrameStyle } from "./hudFrame.view";
import { IconTreatment, schoolForItem } from "@jgengine/core/ui/icons/iconTreatment.view";
import { useCurrency, useGameCalendar, useGameClock, useInventory, localPlayerEntity } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
import { LiveText, useFrameBind } from "@jgengine/core/ui/liveBind.view";
import { isLive, readLive, type Live } from "@jgengine/core/ui/liveValue";
import { hudType } from "./hudTokens";
import { memoView } from "../ui/memoView.view";

/**
 * Optional HUD building blocks bound to live game state — not a finished game face. Every game
 * owns custom presentation (see AGENTS.md); import these only as temporary scaffolding, previews,
 * or under game-owned chrome. Prefer headless hooks + game markup for shipped UI. The engine
 * mounts none of these by default. Styling is self-contained dark-glass for demos; pass
 * `style`/`className` to override. Anything reading the player defaults to the local player entity.
 *
 * @capability hud-components optional health/hotbar/speed/clock/wave/currency building blocks — games own custom chrome
 */

const PANEL: CSSProperties = hudFrameStyle("glass");

/**
 * A numbered hotbar bound to an inventory — painted iconed slots (a `GameIcon` glyph over a
 * school-keyed gradient with a count badge, #1035), an active-slot highlight, and a keycap per slot.
 * Place it and pass the `inventoryId`; `activeSlot` highlights the equipped one. Supply `itemIcon` to
 * map your item ids to your own glyphs — the default resolves a `GameIcon` from the item id.
  *
 * @capability hud-hotbar optional inventory hotbar building block — games own slot chrome
 */
export const Hotbar = memoView("Hotbar", function Hotbar({
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
                <span style={{ position: "absolute", top: 2, left: 4, fontSize: hudType("xs"), fontWeight: 700, opacity: 0.55 }}>{keycap}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

/**
 * A speedometer for an entity (defaults to the local player) — an SVG arc gauge + a digital readout.
 * `scale` converts world units/second to your display unit (3.6 → km/h, 2.237 → mph); `max` sets the
 * gauge's top of scale.
 */
export const Speedometer = memoView("Speedometer", function Speedometer({
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
  const ctx = useGameContext();
  const speed = (): number => {
    const entity = entityId === undefined ? localPlayerEntity(ctx) : ctx.scene.entity.get(entityId);
    return entity === null ? 0 : groundSpeed(entity) * scale;
  };
  const needle = useRef<SVGPathElement>(null);
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
  useFrameBind(
    needle,
    () => Math.max(0, Math.min(1, speed() / max)),
    (fraction, path) => {
      path.setAttribute("d", arc(0, fraction));
      path.setAttribute("stroke", fraction > 0.85 ? "#f87171" : "#38bdf8");
    },
  );
  return (
    <div className={className} style={{ ...PANEL, width: size, padding: 6, textAlign: "center", ...style }}>
      <svg width={size - 12} height={(size - 12) * 0.72} viewBox={`0 0 ${size} ${size * 0.72}`} style={{ display: "block", margin: "0 auto" }}>
        <path d={arc(0, 1)} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={7} strokeLinecap="round" />
        <path ref={needle} fill="none" strokeWidth={7} strokeLinecap="round" />
      </svg>
      <LiveText as="div" style={{ marginTop: -8, fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 18, lineHeight: 1 }} get={() => Math.round(speed())} />
      <div style={{ fontSize: hudType("xs"), opacity: 0.6, letterSpacing: 0.4, textTransform: "uppercase" }}>{unit}</div>
    </div>
  );
});

/**
 * A time-of-day clock reading the sim calendar — `Day N · HH:MM`, 24h or 12h. `controls` adds
 * pause + the game's speed multipliers as clickable pills (the "fast-forward" bar), off by default so
 * a game opts into letting the player scrub time.
  *
 * @capability hud-clock in-game time-of-day readout bound to the sim clock
 */
export const Clock = memoView("Clock", function Clock({
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
  const ctx = useGameContext();
  const clock = useGameClock();
  const day = useGameCalendar((calendar) => calendar.day);
  return (
    <div className={className} style={{ ...PANEL, padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: 8, fontVariantNumeric: "tabular-nums", ...style }}>
      {showDay ? <span style={{ fontSize: hudType("xs"), opacity: 0.6 }}>Day {day + 1}</span> : null}
      <LiveText style={{ fontWeight: 700, fontSize: 14 }} get={() => clockLabel(ctx.time.calendar(), format)} />
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
});

function clockLabel({ hour, minute }: { hour: number; minute: number }, format: "24h" | "12h"): string {
  const mm = minute.toString().padStart(2, "0");
  if (format === "12h") {
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${h12}:${mm} ${hour < 12 ? "AM" : "PM"}`;
  }
  return `${hour.toString().padStart(2, "0")}:${mm}`;
}

function ClockPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        pointerEvents: "auto",
        cursor: "pointer",
        fontSize: hudType("xs"),
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

/** A currency counter — an icon (emoji/char, default a coin) plus the live amount for `currencyId`.  *
 * @capability hud-coins currency counter widget bound to a currency id
 */
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
export const Crosshair = memoView("Crosshair", function Crosshair({
  size = 18,
  gap = 5,
  thickness = 2,
  color = "rgba(255,255,255,0.85)",
  style,
  className,
}: {
  /** Box size in px; `live(() => px)` when it breathes every frame. */
  size?: Live<number>;
  /** Centre gap in px; `live(() => px)` when it opens and closes with spread every frame. */
  gap?: Live<number>;
  thickness?: number;
  color?: string;
  style?: CSSProperties;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  useFrameBind(
    box,
    () => (isLive(size) || isLive(gap) ? `${readLive(size)}:${readLive(gap)}` : null),
    (key, element) => {
      if (key === null) return;
      const [boxSize = 0, centreGap = 0] = key.split(":").map(Number);
      const arm = `${boxSize / 2 - centreGap}px`;
      element.style.width = `${boxSize}px`;
      element.style.height = `${boxSize}px`;
      const [up, down, left, right] = Array.from(element.children, (child) => (child instanceof HTMLElement ? child : null));
      if (up) up.style.height = arm;
      if (down) down.style.height = arm;
      if (left) left.style.width = arm;
      if (right) right.style.width = arm;
    },
  );
  const boxSize = readLive(size), centreGap = readLive(gap);
  const tick = (extra: CSSProperties): CSSProperties => ({ position: "absolute", background: color, borderRadius: thickness, ...extra });
  return (
    <div className={className} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", ...style }}>
      <div ref={box} style={{ position: "relative", width: boxSize, height: boxSize }}>
        <div style={tick({ left: "50%", top: 0, width: thickness, height: boxSize / 2 - centreGap, transform: "translateX(-50%)" })} />
        <div style={tick({ left: "50%", bottom: 0, width: thickness, height: boxSize / 2 - centreGap, transform: "translateX(-50%)" })} />
        <div style={tick({ top: "50%", left: 0, height: thickness, width: boxSize / 2 - centreGap, transform: "translateY(-50%)" })} />
        <div style={tick({ top: "50%", right: 0, height: thickness, width: boxSize / 2 - centreGap, transform: "translateY(-50%)" })} />
      </div>
    </div>
  );
});
