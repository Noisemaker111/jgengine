import type { ReactNode } from "react";
import type { AbilityKit, AbilitySlotSnapshot } from "@jgengine/core/combat/abilityKit";
import type { InventorySlot } from "@jgengine/core/inventory/inventoryModel";
import type { Moodle } from "@jgengine/core/survival/moodle";
import { useAbilitySlots, useInventory } from "../hooks";
import { chamfer, hudTextShadow, HudLabel, KeybindBadge, clampFraction } from "./chrome";
import { rarityColor, useGameUiTheme, type RarityTierName } from "./theme";

export type AbilitySlotButtonState = "ready" | "cooldown" | "noResource" | "locked";

function LockGlyph({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="none" aria-hidden>
      <rect x="5" y="10" width="14" height="10" rx="0" fill={color} />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke={color} strokeWidth={2} fill="none" />
    </svg>
  );
}

function ChargePips({ charges, chargesMax, accent, edge }: { charges: number; chargesMax: number; accent: string; edge: string }) {
  return (
    <div style={{ position: "absolute", top: 3, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 3, pointerEvents: "none" }}>
      {Array.from({ length: chargesMax }, (_, index) => (
        <span
          key={index}
          style={{
            width: 5,
            height: 5,
            transform: "rotate(45deg)",
            background: index < charges ? accent : "transparent",
            border: `1px solid ${index < charges ? accent : edge}`,
          }}
        />
      ))}
    </div>
  );
}

export function AbilitySlotButton({
  icon,
  keybind,
  size = 46,
  state = "ready",
  cooldownFraction = 0,
  cooldownSeconds,
  charges,
  chargesMax,
  justCast = false,
  onActivate,
  className,
}: {
  icon?: ReactNode;
  keybind?: string;
  size?: number;
  state?: AbilitySlotButtonState;
  cooldownFraction?: number;
  cooldownSeconds?: number;
  charges?: number;
  chargesMax?: number;
  justCast?: boolean;
  onActivate?: () => void;
  className?: string;
}) {
  const theme = useGameUiTheme();
  const clamped = clampFraction(cooldownFraction);
  const showPips = chargesMax !== undefined && chargesMax > 1 && charges !== undefined;
  return (
    <button
      type="button"
      className={className}
      data-jgui="ability-slot-button"
      data-state={state}
      onClick={onActivate}
      disabled={state === "locked"}
      style={{
        position: "relative",
        width: size,
        height: size,
        padding: 0,
        border: `1px solid ${theme.edgeBright}`,
        clipPath: chamfer(6),
        color: theme.textPrimary,
        background: state === "locked" ? theme.surfaceDeep : `linear-gradient(180deg, ${theme.surface} 0%, ${theme.surfaceDeep} 100%)`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 3px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.6)",
        cursor: state === "ready" ? "pointer" : "default",
        overflow: "hidden",
      }}
    >
      {justCast && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            border: `2px solid ${theme.accent}`,
            animation: "jgui-flash 0.35s ease-out forwards",
            pointerEvents: "none",
          }}
        />
      )}
      {state === "locked" ? (
        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <LockGlyph color={theme.textDim} />
        </span>
      ) : (
        <>
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              filter:
                state === "cooldown"
                  ? "brightness(0.45) saturate(0.6)"
                  : state === "noResource"
                    ? `grayscale(1) drop-shadow(0 0 3px ${theme.danger})`
                    : "none",
            }}
          >
            {icon}
          </span>
          {state === "noResource" && (
            <span
              aria-hidden
              style={{ position: "absolute", inset: 0, background: theme.danger, opacity: 0.25, pointerEvents: "none" }}
            />
          )}
          {state === "cooldown" && (
            <>
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  background: `conic-gradient(rgba(0,0,0,0.75) ${clamped * 360}deg, transparent 0deg)`,
                  pointerEvents: "none",
                }}
              />
              {cooldownSeconds !== undefined && (
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: theme.fontNumeric,
                    fontSize: size / 2.6,
                    fontWeight: 700,
                    color: theme.textPrimary,
                    textShadow: hudTextShadow(),
                    pointerEvents: "none",
                  }}
                >
                  {Math.ceil(cooldownSeconds)}
                </span>
              )}
            </>
          )}
          {showPips && <ChargePips charges={charges!} chargesMax={chargesMax!} accent={theme.accent} edge={theme.edge} />}
        </>
      )}
      {keybind !== undefined && (
        <span style={{ position: "absolute", bottom: -3, right: -3 }}>
          <KeybindBadge label={keybind} size="sm" />
        </span>
      )}
    </button>
  );
}

export interface ActionBarSlot {
  id: string;
  icon?: ReactNode;
  keybind?: string;
  state?: AbilitySlotButtonState;
  cooldownFraction?: number;
  cooldownSeconds?: number;
  charges?: number;
  chargesMax?: number;
  justCast?: boolean;
}

export function ActionBar({
  slots,
  onActivate,
  slotSize = 46,
  className,
}: {
  slots: readonly ActionBarSlot[];
  onActivate?: (slotId: string) => void;
  slotSize?: number;
  className?: string;
}) {
  return (
    <div className={className} data-jgui="action-bar" style={{ display: "flex", gap: 5 }}>
      {slots.map((slot) => (
        <AbilitySlotButton
          key={slot.id}
          icon={slot.icon}
          keybind={slot.keybind}
          size={slotSize}
          state={slot.state}
          cooldownFraction={slot.cooldownFraction}
          cooldownSeconds={slot.cooldownSeconds}
          charges={slot.charges}
          chargesMax={slot.chargesMax}
          justCast={slot.justCast}
          onActivate={onActivate === undefined ? undefined : () => onActivate(slot.id)}
        />
      ))}
    </div>
  );
}

function snapshotToButtonState(snapshot: AbilitySlotSnapshot): AbilitySlotButtonState {
  if (snapshot.charges <= 0) return "cooldown";
  if (!snapshot.ready) return "noResource";
  return "ready";
}

export function AbilityActionBar({
  kit,
  keybinds,
  resourceAvailable,
  onActivate,
  slotSize,
  className,
}: {
  kit: AbilityKit;
  keybinds?: readonly string[];
  resourceAvailable?: (cost: number) => boolean;
  onActivate?: (slotId: string) => void;
  slotSize?: number;
  className?: string;
}) {
  const snapshots = useAbilitySlots(kit, undefined);
  const slots: ActionBarSlot[] = snapshots.map((snapshot, index) => {
    const affordable = resourceAvailable === undefined ? snapshot.ready || snapshot.charges > 0 : resourceAvailable(snapshot.resourceCost);
    const state: AbilitySlotButtonState = snapshot.charges <= 0 ? "cooldown" : !affordable ? "noResource" : snapshotToButtonState(snapshot);
    return {
      id: snapshot.id,
      keybind: keybinds?.[index],
      state,
      cooldownFraction: snapshot.cooldownFraction,
      cooldownSeconds: snapshot.cooldownRemainingMs / 1000,
      charges: snapshot.charges,
      chargesMax: snapshot.chargesMax,
      justCast: snapshot.justCast,
    };
  });
  return <ActionBar slots={slots} onActivate={onActivate} slotSize={slotSize} className={className} />;
}

export interface HotbarItem {
  id: string;
  icon?: ReactNode;
  count?: number;
  label?: string;
}

export function HotbarSelector({
  slots,
  selectedIndex,
  onSelect,
  slotSize = 48,
  className,
}: {
  slots: readonly HotbarItem[];
  selectedIndex: number;
  onSelect?: (index: number) => void;
  slotSize?: number;
  className?: string;
}) {
  const theme = useGameUiTheme();
  return (
    <div className={className} data-jgui="hotbar-selector" style={{ display: "flex", gap: 4 }}>
      {slots.map((slot, index) => {
        const selected = index === selectedIndex;
        return (
          <button
            key={slot.id}
            type="button"
            title={slot.label}
            onClick={onSelect === undefined ? undefined : () => onSelect(index)}
            style={{
              position: "relative",
              width: slotSize,
              height: slotSize,
              padding: 0,
              border: `1px solid ${selected ? theme.accent : theme.edgeBright}`,
              clipPath: chamfer(6),
              color: theme.textPrimary,
              background: `linear-gradient(180deg, ${theme.surface} 0%, ${theme.surfaceDeep} 100%)`,
              boxShadow: selected
                ? `inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 3px rgba(0,0,0,0.55), 0 0 10px ${theme.accentGlow}`
                : "inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 3px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.6)",
              transform: selected ? "scale(1.12)" : "none",
              transition: "transform 0.12s ease-out",
              cursor: "pointer",
            }}
          >
            {selected && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: -9,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 0,
                  height: 0,
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderTop: `6px solid ${theme.accent}`,
                }}
              />
            )}
            <span
              style={{
                position: "absolute",
                top: 2,
                left: 3,
                fontFamily: theme.fontNumeric,
                fontSize: 8,
                color: theme.textDim,
              }}
            >
              {index + 1}
            </span>
            <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {slot.icon}
            </span>
            {slot.count !== undefined && (
              <span
                style={{
                  position: "absolute",
                  bottom: 2,
                  right: 3,
                  fontFamily: theme.fontNumeric,
                  fontSize: 10,
                  fontWeight: 700,
                  color: theme.textPrimary,
                  textShadow: hudTextShadow(),
                }}
              >
                {slot.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface ItemGridSlot {
  itemId: string | null;
  count?: number;
  icon?: ReactNode;
  rarity?: RarityTierName;
}

export function ItemGrid({
  slots,
  columns = 5,
  slotSize = 44,
  onSlotClick,
  className,
}: {
  slots: readonly ItemGridSlot[];
  columns?: number;
  slotSize?: number;
  onSlotClick?: (index: number, itemId: string | null) => void;
  className?: string;
}) {
  const theme = useGameUiTheme();
  return (
    <div
      className={className}
      data-jgui="item-grid"
      style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, ${slotSize}px)`, gap: 4 }}
    >
      {slots.map((slot, index) => {
        const occupied = slot.itemId !== null;
        const color = occupied ? rarityColor(theme, slot.rarity) : theme.edge;
        return (
          <button
            key={index}
            type="button"
            onClick={onSlotClick === undefined ? undefined : () => onSlotClick(index, slot.itemId)}
            style={{
              position: "relative",
              width: slotSize,
              height: slotSize,
              padding: 0,
              clipPath: chamfer(5),
              color: theme.textPrimary,
              border: occupied ? `1px solid ${color}` : `1px dashed ${theme.edge}`,
              borderColor: occupied ? color : `${theme.edge}66`,
              background: occupied
                ? `linear-gradient(180deg, ${theme.surface} 0%, ${theme.surfaceDeep} 100%)`
                : theme.surfaceDeep,
              boxShadow: occupied
                ? `inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 3px rgba(0,0,0,0.55), inset 0 0 8px ${color}33`
                : "inset 0 2px 4px rgba(0,0,0,0.6)",
              cursor: onSlotClick === undefined ? "default" : "pointer",
            }}
          >
            <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {slot.icon}
            </span>
            {occupied && slot.count !== undefined && slot.count > 1 && (
              <span
                style={{
                  position: "absolute",
                  bottom: 2,
                  right: 3,
                  fontFamily: theme.fontNumeric,
                  fontSize: 10,
                  fontWeight: 700,
                  color: theme.textPrimary,
                  textShadow: hudTextShadow(),
                }}
              >
                {slot.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function InventorySlotGrid({
  inventoryId,
  columns,
  slotSize,
  resolveIcon,
  resolveRarity,
  onSlotClick,
  className,
}: {
  inventoryId: string;
  columns?: number;
  slotSize?: number;
  resolveIcon?: (itemId: string) => ReactNode;
  resolveRarity?: (itemId: string) => RarityTierName | undefined;
  onSlotClick?: (index: number, itemId: string | null) => void;
  className?: string;
}) {
  const slots: readonly InventorySlot[] = useInventory(inventoryId);
  const gridSlots: ItemGridSlot[] = slots.map((slot) =>
    slot === null
      ? { itemId: null }
      : {
          itemId: slot.itemId,
          count: slot.count,
          icon: resolveIcon?.(slot.itemId),
          rarity: resolveRarity?.(slot.itemId),
        },
  );
  return (
    <ItemGrid slots={gridSlots} columns={columns} slotSize={slotSize} onSlotClick={onSlotClick} className={className} />
  );
}

export interface EquipmentSlotSpec {
  id: string;
  label: string;
  icon?: ReactNode;
  rarity?: RarityTierName;
  side: "left" | "right" | "bottom";
}

function EquipmentSlotWell({
  slot,
  onSlotClick,
}: {
  slot: EquipmentSlotSpec;
  onSlotClick?: (id: string) => void;
}) {
  const theme = useGameUiTheme();
  const color = slot.icon === undefined ? theme.edge : rarityColor(theme, slot.rarity);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <button
        type="button"
        onClick={onSlotClick === undefined ? undefined : () => onSlotClick(slot.id)}
        style={{
          position: "relative",
          width: 46,
          height: 46,
          padding: 0,
          clipPath: chamfer(6),
          color: theme.textPrimary,
          border: `1px solid ${color}`,
          background: `linear-gradient(180deg, ${theme.surface} 0%, ${theme.surfaceDeep} 100%)`,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 3px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.6)",
          cursor: onSlotClick === undefined ? "default" : "pointer",
        }}
      >
        <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {slot.icon}
        </span>
      </button>
      <HudLabel>{slot.label}</HudLabel>
    </div>
  );
}

function DefaultFigure({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 200" width="100%" height="100%" fill={color} aria-hidden style={{ opacity: 0.25 }}>
      <circle cx="50" cy="26" r="15" />
      <path d="M50 44 C36 44 27 52 24 64 L18 96 L26 100 L31 76 L30 118 L26 186 L42 186 L46 128 L54 128 L58 186 L74 186 L70 118 L69 76 L74 100 L82 96 L76 64 C73 52 64 44 50 44 Z" />
    </svg>
  );
}

export function EquipmentDoll({
  slots,
  figure,
  width = 300,
  height = 340,
  onSlotClick,
  className,
}: {
  slots: readonly EquipmentSlotSpec[];
  figure?: ReactNode;
  width?: number;
  height?: number;
  onSlotClick?: (id: string) => void;
  className?: string;
}) {
  const theme = useGameUiTheme();
  const left = slots.filter((slot) => slot.side === "left");
  const right = slots.filter((slot) => slot.side === "right");
  const bottom = slots.filter((slot) => slot.side === "bottom");
  return (
    <div className={className} data-jgui="equipment-doll" style={{ width, height, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ flex: 1, display: "flex", alignItems: "stretch", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", gap: 8 }}>
          {left.map((slot) => (
            <EquipmentSlotWell key={slot.id} slot={slot} onSlotClick={onSlotClick} />
          ))}
        </div>
        <div style={{ flex: 1, position: "relative" }}>{figure ?? <DefaultFigure color={theme.textDim} />}</div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", gap: 8 }}>
          {right.map((slot) => (
            <EquipmentSlotWell key={slot.id} slot={slot} onSlotClick={onSlotClick} />
          ))}
        </div>
      </div>
      {bottom.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
          {bottom.map((slot) => (
            <EquipmentSlotWell key={slot.id} slot={slot} onSlotClick={onSlotClick} />
          ))}
        </div>
      )}
    </div>
  );
}

export interface BuffChip {
  id: string;
  icon?: ReactNode;
  label?: string;
  stacks?: number;
  remainingFraction?: number;
  kind?: "buff" | "debuff";
}

export function BuffTray({
  buffs,
  size = 30,
  className,
}: {
  buffs: readonly BuffChip[];
  size?: number;
  className?: string;
}) {
  const theme = useGameUiTheme();
  return (
    <div className={className} data-jgui="buff-tray" style={{ display: "flex", gap: 3 }}>
      {buffs.map((buff) => {
        const kind = buff.kind ?? "buff";
        const edgeColor = kind === "debuff" ? theme.danger : theme.success;
        return (
          <div
            key={buff.id}
            title={buff.label}
            style={{
              position: "relative",
              width: size,
              height: size,
              clipPath: chamfer(4),
              color: theme.textPrimary,
              borderTop: `1px solid ${edgeColor}`,
              borderLeft: `1px solid ${theme.edgeBright}`,
              borderRight: `1px solid ${theme.edgeBright}`,
              borderBottom: `1px solid ${theme.edgeBright}`,
              background: `linear-gradient(180deg, ${theme.surface} 0%, ${theme.surfaceDeep} 100%)`,
              overflow: "hidden",
            }}
          >
            <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {buff.icon}
            </span>
            {buff.remainingFraction !== undefined && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  height: 2,
                  width: `${clampFraction(buff.remainingFraction) * 100}%`,
                  background: edgeColor,
                }}
              />
            )}
            {buff.stacks !== undefined && buff.stacks > 1 && (
              <span
                style={{
                  position: "absolute",
                  bottom: 2,
                  right: 2,
                  fontFamily: theme.fontNumeric,
                  fontSize: 9,
                  fontWeight: 700,
                  color: theme.textPrimary,
                  textShadow: hudTextShadow(),
                }}
              >
                {buff.stacks}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MoodleTray({
  moodles,
  size,
  className,
}: {
  moodles: readonly Moodle[];
  size?: number;
  className?: string;
}) {
  const chips: BuffChip[] = moodles.map((moodle) => ({
    id: moodle.id,
    label: moodle.note === undefined ? moodle.label : `${moodle.label} — ${moodle.note}`,
    stacks: moodle.stacks,
    remainingFraction: moodle.fraction,
    kind: moodle.severity === "warning" || moodle.severity === "critical" ? "debuff" : "buff",
  }));
  return <BuffTray buffs={chips} size={size} className={className} />;
}

export function LootCard({
  name,
  rarity,
  typeLine,
  icon,
  stats,
  affixes,
  flavor,
  width = 240,
  className,
}: {
  name: string;
  rarity?: RarityTierName;
  typeLine?: string;
  icon?: ReactNode;
  stats?: readonly string[];
  affixes?: readonly string[];
  flavor?: string;
  width?: number;
  className?: string;
}) {
  const theme = useGameUiTheme();
  const color = rarityColor(theme, rarity);
  return (
    <div
      className={className}
      data-jgui="loot-card"
      style={{
        width,
        clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px))",
        background: `repeating-linear-gradient(135deg, rgba(255,255,255,0.016) 0px, rgba(255,255,255,0.016) 1px, transparent 1px, transparent 7px), linear-gradient(180deg, ${theme.surface} 0%, ${theme.surfaceDeep} 100%)`,
        border: `1px solid ${color}`,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 36,
            height: 36,
            flexShrink: 0,
            clipPath: chamfer(5),
            color: theme.textPrimary,
            border: `1px solid ${color}`,
            background: `linear-gradient(180deg, ${theme.surface} 0%, ${theme.surfaceDeep} 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span
            style={{
              fontFamily: theme.fontDisplay,
              fontSize: 14,
              fontWeight: 700,
              color,
              textShadow: hudTextShadow(),
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </span>
          {typeLine !== undefined && (
            <span style={{ fontFamily: theme.fontBody, fontSize: 10, color: theme.textDim }}>{typeLine}</span>
          )}
        </div>
      </div>
      <span
        style={{
          display: "block",
          height: 1,
          background: `linear-gradient(90deg, transparent 0%, ${color} 18%, ${color} 82%, transparent 100%)`,
        }}
      />
      {stats !== undefined && stats.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {stats.map((line, index) => (
            <span key={index} style={{ fontFamily: theme.fontBody, fontSize: 11, color: theme.textPrimary }}>
              {line}
            </span>
          ))}
        </div>
      )}
      {affixes !== undefined && affixes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {affixes.map((line, index) => (
            <span key={index} style={{ fontFamily: theme.fontBody, fontSize: 11, fontStyle: "italic", color }}>
              {line}
            </span>
          ))}
        </div>
      )}
      {flavor !== undefined && (
        <span style={{ fontFamily: theme.fontBody, fontSize: 10, fontStyle: "italic", color: theme.textDim }}>
          {flavor}
        </span>
      )}
    </div>
  );
}
