import type { ReactNode } from "react";

import type { TouchButton } from "@jgengine/core/input/touchScheme";
import { GameIcon, iconForAction, isGameIconName, type GameIconName } from "@jgengine/core/ui/icons/gameIcons.view";

/** Shooter verbs the shared `GameIcon` catalog has no glyph for. Same 24-unit, `currentColor` style. */
const TOUCH_GLYPHS = {
  fire: (
    <>
      <path d="M12 1.8c2.3 1.9 3.4 4.5 3.4 7.3v5.6H8.6V9.1c0-2.8 1.1-5.4 3.4-7.3z" />
      <rect x="8.2" y="15.8" width="7.6" height="2.6" rx="0.7" />
      <rect x="8.6" y="19.4" width="6.8" height="2.8" rx="0.7" />
    </>
  ),
  aim: (
    <>
      <path
        fillRule="evenodd"
        d="M12 3.2a8.8 8.8 0 1 1 0 17.6a8.8 8.8 0 0 1 0-17.6zm0 2.1a6.7 6.7 0 1 0 0 13.4a6.7 6.7 0 0 0 0-13.4z"
      />
      <rect x="11" y="0.8" width="2" height="7" rx="1" />
      <rect x="11" y="16.2" width="2" height="7" rx="1" />
      <rect x="0.8" y="11" width="7" height="2" rx="1" />
      <rect x="16.2" y="11" width="7" height="2" rx="1" />
      <circle cx="12" cy="12" r="1.6" />
    </>
  ),
  reload: (
    <>
      <path d="M12 3.5a8.5 8.5 0 0 1 7.6 4.7l-2 1A6.3 6.3 0 1 0 18.3 12h2.2A8.5 8.5 0 1 1 12 3.5z" />
      <polygon points="21.2,3.6 21.2,10.4 14.4,10.4" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="2.4" />
      <circle cx="12" cy="12" r="2.4" />
      <circle cx="19" cy="12" r="2.4" />
    </>
  ),
} as const satisfies Record<string, ReactNode>;

/** A glyph the touch dock draws itself, beyond the shared `GameIcon` catalog. */
export type TouchGlyphName = keyof typeof TOUCH_GLYPHS;

/** What a touch button face shows: a drawn glyph, or a 1–3 character text glyph when nothing fits. */
export type TouchButtonFace = { kind: "glyph"; name: GameIconName | TouchGlyphName } | { kind: "text"; text: string };

function isTouchGlyphName(value: string): value is TouchGlyphName {
  return Object.hasOwn(TOUCH_GLYPHS, value);
}

/** Checked before the generic `iconForAction` rules, which read `useHealthVial` as "use" and `fire` as a crosshair. */
const TOUCH_ICON_RULES: readonly (readonly [readonly string[], GameIconName | TouchGlyphName])[] = [
  [["grenade", "throw", "bomb", "explosive"], "bomb"],
  [["vial", "potion", "flask", "drink"], "potionRed"],
  [["heal", "medkit", "bandage", "health"], "heart"],
  [["reload"], "reload"],
  [["aim", "scope"], "aim"],
  [["fire", "shoot", "trigger"], "fire"],
  [["melee", "knife", "stab", "slash"], "dagger"],
  [["block", "parry", "guard"], "shield"],
  [["skill", "talent", "perk", "upgrade"], "star"],
  [["quest", "journal", "mission"], "scroll"],
  [["ability", "ultimate", "special", "cast", "spell", "power"], "lightning"],
  [["prone"], "crouch"],
  [["dodge", "roll", "evade"], "sprint"],
  [["craft", "build"], "hammer"],
  [["settings", "options"], "gear"],
];

/**
 * Short initials from a label: `Relay Overclock` → `RO`, `Honk` → `HO`.
 *
 * @internal
 */
export function touchInitials(label: string): string {
  const words = label.split(/[\s._\-−+]+/).filter((word) => /[a-z0-9]/i.test(word));
  if (words.length === 0) return "?";
  if (words.length === 1) return (words[0] ?? "").slice(0, 2).toUpperCase();
  return words
    .slice(0, 3)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();
}

/**
 * The face a touch button shows: the game's `icon` (a `GameIconName`, a touch glyph, or a 1–3
 * character text glyph), else a glyph derived from the action name, else short initials. A face is
 * never a sentence; the full label stays on the button's `aria-label`.
 *
 * @internal
 */
export function touchButtonFace(button: Pick<TouchButton, "action" | "label" | "icon">): TouchButtonFace {
  const { icon } = button;
  if (icon === false) {
    return { kind: "text", text: button.label.length <= 5 ? button.label : touchInitials(button.label) };
  }
  if (typeof icon === "string") {
    if (isTouchGlyphName(icon) || isGameIconName(icon)) return { kind: "glyph", name: icon };
    if (icon.length > 0 && icon.length <= 3) return { kind: "text", text: icon };
  }
  const id = button.action.toLowerCase();
  for (const [keywords, name] of TOUCH_ICON_RULES) {
    if (keywords.some((keyword) => id.includes(keyword))) return { kind: "glyph", name };
  }
  const generic = iconForAction(button.action);
  if (generic !== null) return { kind: "glyph", name: generic };
  return { kind: "text", text: touchInitials(button.label) };
}

/**
 * Renders a touch glyph or a shared `GameIcon` at `size` px in `currentColor`.
 *
 * @internal
 */
export function TouchGlyph({ name, size }: { name: GameIconName | TouchGlyphName; size: number }) {
  if (isTouchGlyphName(name)) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} data-icon={name} style={{ display: "block" }} fill="currentColor">
        {TOUCH_GLYPHS[name]}
      </svg>
    );
  }
  return <GameIcon name={name} size={size} />;
}
