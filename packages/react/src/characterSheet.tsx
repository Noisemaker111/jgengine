import { type CSSProperties, type ReactNode } from "react";

import { EquipmentSlots, type SlotItem } from "./slots";
import { HudFrame, type HudFrameVariation } from "./hudFrame";

/**
 * Character-sheet / paperdoll composition (#1033 follow-up): a drop-in `<CharacterSheet>` that
 * arranges caller-supplied equip slots as a paperdoll around a portrait and lists derived stats,
 * all inside a {@link HudFrame}. It reuses the atomic slot rendering ({@link EquipmentSlots}) and the
 * shared `--jg-slot-*` / `--jg-accent` HudTheme tokens (#1034) — the game owns which slots and which
 * stats matter (both are props), the skin, and the window that toggles it open/closed. No genre list
 * is baked in; {@link defaultEquipLayout} is a convenience arrangement the game can override wholesale.
 */

/** Which flank of the paperdoll a slot sits on — `left`/`right` columns, or the `bottom` row under the portrait. */
export type EquipSlotPosition = "left" | "right" | "bottom";

/** One named equip slot: a stable `id`, a display `label`, its worn `item` (or `null` = empty), and where it sits. */
export interface EquipSlot {
  /** Stable slot id passed to `onSlotActivate` (e.g. `head`, `mainHand`, `ring1`). */
  id: string;
  /** Human label shown under/beside the slot and used as its accessible name. */
  label: string;
  /** The worn item, or `null` for an empty slot (renders the themed placeholder). */
  item: SlotItem | null;
  /** Which flank the slot sits on. Default `left`. */
  position?: EquipSlotPosition;
}

/** An ordered set of equip slots that make up a paperdoll. Caller-supplied; see {@link defaultEquipLayout}. */
export type EquipSlotLayout = readonly EquipSlot[];

/** Slot ids used by {@link defaultEquipLayout}'s convenience arrangement. */
export type DefaultEquipSlotId =
  | "head"
  | "chest"
  | "hands"
  | "legs"
  | "feet"
  | "mainHand"
  | "offHand"
  | "ring1"
  | "ring2"
  | "trinket";

const DEFAULT_ARRANGEMENT: readonly { id: DefaultEquipSlotId; label: string; position: EquipSlotPosition }[] = [
  { id: "head", label: "Head", position: "left" },
  { id: "chest", label: "Chest", position: "left" },
  { id: "hands", label: "Hands", position: "left" },
  { id: "legs", label: "Legs", position: "left" },
  { id: "feet", label: "Feet", position: "left" },
  { id: "mainHand", label: "Main Hand", position: "right" },
  { id: "offHand", label: "Off Hand", position: "right" },
  { id: "ring1", label: "Ring", position: "right" },
  { id: "ring2", label: "Ring", position: "right" },
  { id: "trinket", label: "Trinket", position: "right" },
];

/**
 * A sensible default paperdoll arrangement — worn armor down the left flank, held gear and jewelry
 * down the right — that the game fills by passing worn items keyed by slot id. Every id is optional;
 * unfilled slots render empty. Games that need a different slot set pass their own {@link EquipSlotLayout}.
 */
export function defaultEquipLayout(items: Partial<Record<DefaultEquipSlotId, SlotItem | null>> = {}): EquipSlot[] {
  return DEFAULT_ARRANGEMENT.map((slot) => ({
    id: slot.id,
    label: slot.label,
    item: items[slot.id] ?? null,
    position: slot.position,
  }));
}

/** Props for {@link Paperdoll}. */
export interface PaperdollProps {
  /** The equip slots to arrange. Order within a flank is preserved. */
  slots: EquipSlotLayout;
  /** Center node — a portrait, 3D preview, or custom art. A silhouette placeholder is drawn when omitted. */
  portrait?: ReactNode;
  /** Slot tile size in px. Default 44. */
  slotSize?: number;
  /** Fired with the slot `id` on click / Enter / Space — wire drag or an equip picker here. */
  onSlotActivate?: (id: string) => void;
  className?: string;
  style?: CSSProperties;
}

function SlotLabel({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 9,
        letterSpacing: 0.6,
        fontVariant: "small-caps",
        textTransform: "lowercase",
        color: "var(--jg-bar-text, #f4f6fb)",
        opacity: 0.62,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function EquipSlotCell({
  slot,
  slotSize,
  align,
  onSlotActivate,
}: {
  slot: EquipSlot;
  slotSize: number;
  align: "left" | "right" | "center";
  onSlotActivate?: (id: string) => void;
}) {
  const interactive = onSlotActivate !== undefined;
  const activate = interactive ? () => onSlotActivate!(slot.id) : undefined;
  return (
    <div
      data-equip-slot={slot.id}
      role="group"
      aria-label={slot.label}
      tabIndex={interactive ? 0 : undefined}
      {...(activate === undefined ? {} : { onClick: activate })}
      {...(activate === undefined
        ? {}
        : {
            onKeyDown: (event: { key: string; preventDefault: () => void }) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                activate();
              }
            },
          })}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
        gap: 3,
        cursor: interactive ? "pointer" : undefined,
      }}
    >
      <EquipmentSlots items={[slot.item]} size={slotSize} />
      <SlotLabel>{slot.label}</SlotLabel>
    </div>
  );
}

function Silhouette({ size }: { size: number }) {
  return (
    <div
      data-paperdoll-silhouette=""
      aria-hidden
      style={{
        width: size,
        height: Math.round(size * 2.6),
        borderRadius: "var(--jg-slot-radius, 9px)",
        background: "var(--jg-slot-bg, rgba(12,14,20,0.5))",
        border: "var(--jg-slot-border, 1px solid rgba(255,255,255,0.1))",
        boxShadow: "inset 0 2px 10px rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--jg-bar-text, #f4f6fb)",
        opacity: 0.28,
        fontSize: Math.round(size * 0.9),
        boxSizing: "border-box",
      }}
    >
      {/* generic humanoid glyph, purely decorative */}
      <span aria-hidden>♟</span>
    </div>
  );
}

/**
 * Arranges caller-supplied equip slots as a paperdoll — worn gear in two flanking columns around a
 * center `portrait` (or a silhouette placeholder), with any `bottom` slots in a row beneath it. Each
 * slot reuses the atomic {@link EquipmentSlots} tile (filled icon or themed empty placeholder), carries
 * a label, and is a focusable `role="group"` with an `aria-label`; `onSlotActivate` fires on
 * click/Enter/Space so games can wire drag or an equip picker. Composition and skin stay the game's.
 *
 * @capability character-paperdoll equip-slot paperdoll — flanking columns around a portrait, activatable slots
 */
export function Paperdoll({ slots, portrait, slotSize = 44, onSlotActivate, className, style }: PaperdollProps): ReactNode {
  const left = slots.filter((s) => (s.position ?? "left") === "left");
  const right = slots.filter((s) => s.position === "right");
  const bottom = slots.filter((s) => s.position === "bottom");
  const column = (cells: EquipSlot[], align: "left" | "right") => (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: align === "right" ? "flex-end" : "flex-start" }}>
      {cells.map((slot) => (
        <EquipSlotCell key={slot.id} slot={slot} slotSize={slotSize} align={align} {...(onSlotActivate === undefined ? {} : { onSlotActivate })} />
      ))}
    </div>
  );
  return (
    <div data-paperdoll="" className={className} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, ...style }}>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", justifyContent: "center" }}>
        {column(left, "right")}
        <div data-paperdoll-portrait="" style={{ display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "stretch" }}>
          {portrait ?? <Silhouette size={slotSize * 1.4} />}
        </div>
        {column(right, "left")}
      </div>
      {bottom.length > 0 ? (
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          {bottom.map((slot) => (
            <EquipSlotCell key={slot.id} slot={slot} slotSize={slotSize} align="center" {...(onSlotActivate === undefined ? {} : { onSlotActivate })} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** One derived-stat row. `group` optionally buckets rows under a small header. */
export interface StatRow {
  /** Stable row id. */
  id: string;
  /** Small-caps row label (e.g. `Armor`, `Crit`). */
  label: string;
  /** The value to show — the game formats it (a number, `"12%"`, `"1.2/s"`). */
  value: string | number;
  /** Optional secondary hint shown dimmed after the value (e.g. a delta or source). */
  hint?: string;
  /** Optional group header this row falls under; consecutive rows sharing a group render one header. */
  group?: string;
}

/** Props for {@link StatList}. */
export interface StatListProps {
  /** Derived stat rows, in display order. The game owns which stats matter. */
  stats: readonly StatRow[];
  className?: string;
  style?: CSSProperties;
}

function StatListRow({ row }: { row: StatRow }) {
  return (
    <div
      data-stat-row={row.id}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "2px 0" }}
    >
      <span style={{ fontSize: 11, fontVariant: "small-caps", letterSpacing: 0.5, color: "var(--jg-bar-text, #f4f6fb)", opacity: 0.72 }}>
        {row.label}
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--jg-accent, #38bdf8)" }}>
        {row.value}
        {row.hint !== undefined ? (
          <span style={{ marginLeft: 5, fontWeight: 500, color: "var(--jg-bar-text, #f4f6fb)", opacity: 0.5 }}>{row.hint}</span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * Renders derived character stats as clean small-caps label→value rows, token-themed. Rows carrying a
 * `group` field are bucketed under a small uppercase header (consecutive same-group rows share one).
 * Pure and prop-driven — the game supplies the rows (from `useEntityStat`/derived values); the engine
 * ships no stat list of its own.
 *
 * @capability character-statlist derived-stat readout — grouped small-caps label→value rows, token-themed
 */
export function StatList({ stats, className, style }: StatListProps): ReactNode {
  const groups: { name: string | undefined; rows: StatRow[] }[] = [];
  for (const row of stats) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.name === row.group) last.rows.push(row);
    else groups.push({ name: row.group, rows: [row] });
  }
  return (
    <div data-stat-list="" className={className} style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
      {groups.map((group, index) => (
        <div key={index} data-stat-group={group.name ?? ""}>
          {group.name !== undefined ? (
            <div
              style={{
                fontSize: 9,
                letterSpacing: 1.4,
                textTransform: "uppercase",
                opacity: 0.55,
                margin: "6px 0 2px",
                color: "var(--jg-bar-text, #f4f6fb)",
              }}
            >
              {group.name}
            </div>
          ) : null}
          {group.rows.map((row) => (
            <StatListRow key={row.id} row={row} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Props for {@link CharacterSheet}. */
export interface CharacterSheetProps {
  /** Equip slots to arrange as the paperdoll (see {@link defaultEquipLayout}). */
  slots: EquipSlotLayout;
  /** Derived stat rows for the {@link StatList}. */
  stats: readonly StatRow[];
  /** Character name shown in the header. */
  name?: ReactNode;
  /** Secondary header line — level, class, faction, etc. */
  subtitle?: ReactNode;
  /** Portrait node passed through to the {@link Paperdoll} center. */
  portrait?: ReactNode;
  /** Replace the whole header block (name/subtitle) with custom content. */
  header?: ReactNode;
  /** Frame title label. Default `Character`. */
  title?: ReactNode;
  /** {@link HudFrame} skin. Default `themed`. */
  variation?: HudFrameVariation;
  /** Slot tile size in px, forwarded to {@link Paperdoll}. */
  slotSize?: number;
  /** Fired with the equip slot `id` on activate. */
  onSlotActivate?: (id: string) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * Drop-in character sheet: a {@link HudFrame} wrapping an optional name/subtitle/portrait header, the
 * equip-slot {@link Paperdoll}, and the derived-stat {@link StatList}. The game supplies slots, stats,
 * header content, and the activation callback, and owns the window that toggles it (this component does
 * not manage its own open/close). Pure composition over existing primitives and HudTheme tokens.
 *
 * @capability character-sheet drop-in paperdoll + derived-stat sheet in a HudFrame — game supplies slots/stats
 */
export function CharacterSheet({
  slots,
  stats,
  name,
  subtitle,
  portrait,
  header,
  title = "Character",
  variation = "themed",
  slotSize,
  onSlotActivate,
  className,
  style,
}: CharacterSheetProps): ReactNode {
  const hasHeader = header !== undefined || name !== undefined || subtitle !== undefined;
  return (
    <HudFrame
      variation={variation}
      title={title}
      interactive
      padding={14}
      {...(className === undefined ? {} : { className })}
      {...(style === undefined ? {} : { style })}
    >
      <div data-character-sheet="" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 260 }}>
        {hasHeader ? (
          <div data-character-header="" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {header ?? (
              <>
                {name !== undefined ? <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.2 }}>{name}</div> : null}
                {subtitle !== undefined ? (
                  <div style={{ fontSize: 11, opacity: 0.65, fontVariant: "small-caps", letterSpacing: 0.4 }}>{subtitle}</div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <Paperdoll
            slots={slots}
            {...(portrait === undefined ? {} : { portrait })}
            {...(slotSize === undefined ? {} : { slotSize })}
            {...(onSlotActivate === undefined ? {} : { onSlotActivate })}
          />
          <StatList stats={stats} style={{ flex: "1 1 140px", minWidth: 140 }} />
        </div>
      </div>
    </HudFrame>
  );
}
