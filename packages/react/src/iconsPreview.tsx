import { IconTreatment, type IconSchool } from "./iconTreatment";
import type { GameIconName } from "./gameIcons";

/**
 * A deterministic showcase of the painted {@link IconTreatment} (#1035): a school row (one gradient
 * each) and a mock hotbar of treated item icons with count badges and an active slot. Static, so it
 * screenshots identically every time. This is the before/after evidence vs. raw `itemId` text slots.
 */

const SCHOOLS: [IconSchool, GameIconName][] = [
  ["fire", "bomb"],
  ["frost", "wand"],
  ["arcane", "staff"],
  ["nature", "bow"],
  ["holy", "shield"],
  ["tech", "gun"],
  ["shadow", "dagger"],
  ["steel", "sword"],
];

const HOTBAR: { icon: GameIconName; school: IconSchool; count?: number }[] = [
  { icon: "sword", school: "steel" },
  { icon: "bow", school: "nature" },
  { icon: "bomb", school: "fire", count: 12 },
  { icon: "shield", school: "holy" },
  { icon: "staff", school: "arcane" },
  { icon: "wand", school: "frost", count: 3 },
];

/** Renders the school-gradient row and a treated-icon hotbar — the deterministic #1035 fixture. */
export function IconsPreview({ className }: { className?: string }) {
  return (
    <div
      data-icons-preview
      className={className}
      style={{ display: "flex", flexDirection: "column", gap: 22, padding: 26, background: "#0e1216", fontFamily: "system-ui, sans-serif", color: "#e8edf2" }}
    >
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", opacity: 0.6, marginBottom: 8 }}>
          school gradients
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {SCHOOLS.map(([school, icon]) => (
            <IconTreatment key={school} icon={icon} school={school} size={52} />
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", opacity: 0.6, marginBottom: 8 }}>
          hotbar — treated icons + count badges (slot 1 active)
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {HOTBAR.map((entry, index) => (
            <IconTreatment
              key={index}
              icon={entry.icon}
              school={entry.school}
              size={50}
              keycap={String(index + 1)}
              active={index === 0}
              {...(entry.count === undefined ? {} : { count: entry.count })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
