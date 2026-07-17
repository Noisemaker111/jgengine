import { type CSSProperties, type ReactNode } from "react";

import { GameIcon, iconForAction, iconForItemId, type GameIconName } from "./gameIcons";

/**
 * `IconTreatment` (#1035): a procedural painted-icon face — a glyph over a school-keyed radial
 * gradient, with a vignette inset shadow, a top gloss highlight, and optional count/keycap badges.
 * Turns the engine's flat white `GameIcon` glyphs (and game-icons.net SVGs) into painted ability /
 * item icons that read as AAA slots, not debug UI. Theme-aware: the frame reads the `--jg-slot-*`
 * and `--jg-accent` `HudTheme` tokens (#1034), so a theme change re-skins every treated icon.
 *
 * @capability hud-icons painted-icon treatment for hotbar/action slots — glyph + gradient + count badge
 */

/** Element/school palette key — drives the radial gradient behind the glyph. */
export type IconSchool =
  | "fire"
  | "frost"
  | "arcane"
  | "nature"
  | "holy"
  | "tech"
  | "shadow"
  | "steel"
  | "neutral";

const SCHOOL_GRADIENT: Record<IconSchool, readonly [string, string]> = {
  fire: ["#ff8a3d", "#661805"],
  frost: ["#8fe3ff", "#0e3357"],
  arcane: ["#c58cff", "#341552"],
  nature: ["#8fe36b", "#194013"],
  holy: ["#ffe08a", "#6b4d0f"],
  tech: ["#5fe0c8", "#0c3f3a"],
  shadow: ["#9a7bd0", "#1b0d2b"],
  steel: ["#c8d0da", "#333b45"],
  neutral: ["#9aa3ad", "#242a31"],
};

const SCHOOL_RULES: readonly [readonly string[], IconSchool][] = [
  [["fire", "flame", "burn", "lava", "ember", "molotov", "torch"], "fire"],
  [["frost", "ice", "freeze", "snow", "water", "aqua", "chill"], "frost"],
  [["arcane", "magic", "mana", "rune", "spell", "mystic", "void"], "arcane"],
  [["nature", "leaf", "poison", "vine", "earth", "herb", "wood", "beast"], "nature"],
  [["holy", "light", "heal", "divine", "bless", "sun", "cleric"], "holy"],
  [["tech", "laser", "cyber", "robot", "energy", "plasma", "gadget"], "tech"],
  [["shadow", "dark", "curse", "necro", "death", "blood", "demon"], "shadow"],
  [["sword", "axe", "hammer", "spear", "dagger", "armor", "shield", "gun", "bow", "metal", "steel"], "steel"],
];

function schoolFrom(text: string): IconSchool {
  const lower = text.toLowerCase();
  for (const [keys, school] of SCHOOL_RULES) {
    if (keys.some((key) => lower.includes(key))) return school;
  }
  return "neutral";
}

/** Infers an {@link IconSchool} from an item id (keyword match); `neutral` when nothing matches. */
export function schoolForItem(itemId: string): IconSchool {
  return schoolFrom(itemId);
}

/** Infers an {@link IconSchool} from an action id (keyword match); `neutral` when nothing matches. */
export function schoolForAction(action: string): IconSchool {
  return schoolFrom(action);
}

/** Props for {@link IconTreatment}. */
export interface IconTreatmentProps {
  /** A `GameIcon` name to render as the glyph. */
  icon?: GameIconName;
  /** Or an explicit glyph node (a game-icons.net SVG, an `<img>`, custom art). Wins over `icon`. */
  glyph?: ReactNode;
  /** School/element gradient behind the glyph. Default `neutral`. */
  school?: IconSchool;
  /** Face size in px. Default 44. */
  size?: number;
  /** Stack count — a badge is drawn when > 1. */
  count?: number;
  /** Keycap/hotkey drawn top-left. */
  keycap?: string;
  /** Active/selected ring using `--jg-accent`. */
  active?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** A painted icon face — gradient + vignette + gloss behind a glyph, with count/keycap badges. */
export function IconTreatment({
  icon,
  glyph,
  school = "neutral",
  size = 44,
  count,
  keycap,
  active = false,
  className,
  style,
}: IconTreatmentProps) {
  const [g0, g1] = SCHOOL_GRADIENT[school];
  const content = glyph ?? (icon !== undefined ? <GameIcon name={icon} size={Math.round(size * 0.58)} color="#fdfdff" /> : null);
  return (
    <div
      className={className}
      data-icon-treatment={school}
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "var(--jg-slot-radius, 9px)",
        background: `radial-gradient(circle at 38% 30%, ${g0}, ${g1})`,
        border: active ? "1px solid var(--jg-accent, #38bdf8)" : "var(--jg-slot-border, 1px solid rgba(255,255,255,0.16))",
        boxShadow: active
          ? "0 0 0 1px var(--jg-accent, #38bdf8), 0 0 10px rgba(56,189,248,0.5), inset 0 -6px 12px rgba(0,0,0,0.5)"
          : "inset 0 -7px 13px rgba(0,0,0,0.55), inset 0 2px 3px rgba(255,255,255,0.2)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        ...style,
      }}
    >
      {/* top gloss */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,0.3), rgba(255,255,255,0) 46%)", pointerEvents: "none" }} />
      {/* vignette */}
      <div style={{ position: "absolute", inset: 0, borderRadius: "inherit", boxShadow: "inset 0 0 12px rgba(0,0,0,0.55)", pointerEvents: "none" }} />
      {content}
      {keycap !== undefined ? (
        <span style={{ position: "absolute", top: 1, left: 4, fontSize: 9, fontWeight: 700, color: "#fff", opacity: 0.75, textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}>
          {keycap}
        </span>
      ) : null}
      {count !== undefined && count > 1 ? (
        <span
          data-count
          style={{
            position: "absolute",
            bottom: 1,
            right: 3,
            fontSize: 11,
            fontWeight: 800,
            color: "#fff",
            fontVariantNumeric: "tabular-nums",
            textShadow: "0 1px 2px #000, 0 0 3px #000",
          }}
        >
          {count}
        </span>
      ) : null}
    </div>
  );
}

/** Maps an item id to a treated icon — resolves a `GameIcon` glyph and an inferred school. */
export function treatedItemIcon(itemId: string, options: { size?: number; count?: number; keycap?: string } = {}): ReactNode {
  const icon = iconForItemId(itemId) ?? undefined;
  return (
    <IconTreatment
      {...(icon === undefined ? {} : { icon })}
      school={schoolForItem(itemId)}
      {...(options.size === undefined ? {} : { size: options.size })}
      {...(options.count === undefined ? {} : { count: options.count })}
      {...(options.keycap === undefined ? {} : { keycap: options.keycap })}
    />
  );
}

/** A ready-made `ActionButton` `renderIcon` that paints the action's `GameIcon` with a treatment. */
export function treatedActionIcon(action: { id?: string; label?: string; icon?: ReactNode }, size = 40): ReactNode {
  const key = action.id ?? action.label ?? "";
  const named = iconForAction(key);
  if (named === null) return action.icon ?? null;
  return <IconTreatment icon={named} school={schoolForAction(key)} size={size} />;
}
