import type { PartIconId } from "../../parts/catalog";

const RUST = "#b7410e";
const HAZARD_YELLOW = "#f0c419";
const SCRAP_STEEL = "#8d99a6";
const WELD_WHITE = "#fef3e0";

interface PartIconProps {
  partId: PartIconId | null;
  className?: string;
}

export function PartIcon({ partId, className }: PartIconProps) {
  if (partId === null) {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="#5a5650" strokeWidth="1.4" strokeDasharray="3 3" />
      </svg>
    );
  }

  switch (partId) {
    case "salvage_v6":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="5" y="10" width="14" height="8" rx="1.2" fill={RUST} />
          <rect x="7" y="5" width="3" height="6" fill={SCRAP_STEEL} />
          <rect x="14" y="5" width="3" height="6" fill={SCRAP_STEEL} />
        </svg>
      );
    case "truck_engine":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="3" y="9" width="18" height="10" rx="1.2" fill={RUST} />
          <rect x="5" y="4" width="4" height="6" fill={SCRAP_STEEL} />
          <rect x="10" y="4" width="4" height="6" fill={SCRAP_STEEL} />
          <rect x="15" y="4" width="4" height="6" fill={SCRAP_STEEL} />
        </svg>
      );
    case "ev_conversion":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="5" y="7" width="14" height="12" rx="2" fill={WELD_WHITE} />
          <path d="M13 9 L9 14 H12 L11 17 L16 12 H13 Z" fill="#4fd1c5" />
        </svg>
      );
    case "plow_blade":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M3 18 L12 6 L21 18 Z" fill={RUST} />
          <rect x="9" y="18" width="6" height="3" fill={SCRAP_STEEL} />
        </svg>
      );
    case "hood_plate":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="3" y="9" width="18" height="6" rx="1.4" fill={SCRAP_STEEL} />
          <rect x="3" y="9" width="18" height="6" rx="1.4" fill="none" stroke="#5a5650" strokeWidth="1" />
        </svg>
      );
    case "fan_blade_vanes":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="2" fill={HAZARD_YELLOW} />
          <path d="M12 12 L20 8 L20 11 Z" fill={HAZARD_YELLOW} />
          <path d="M12 12 L6 4 L8 3 Z" fill={HAZARD_YELLOW} />
          <path d="M12 12 L5 17 L7 20 Z" fill={HAZARD_YELLOW} />
        </svg>
      );
    case "coil_springs":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle cx="12" cy="6" r="4" fill="none" stroke={SCRAP_STEEL} strokeWidth="2" />
          <circle cx="12" cy="12" r="4" fill="none" stroke={SCRAP_STEEL} strokeWidth="2" />
          <circle cx="12" cy="18" r="4" fill="none" stroke={SCRAP_STEEL} strokeWidth="2" />
        </svg>
      );
    case "steel_rims":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="8" fill="#101018" />
          <circle cx="12" cy="12" r="3.2" fill={SCRAP_STEEL} />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x="11.3" y="4" width="1.4" height="16" fill={SCRAP_STEEL} transform={`rotate(${i * 45} 12 12)`} />
          ))}
        </svg>
      );
    case "monster_treads":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="#101018" />
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x="11" y="2.5" width="2" height="4" fill={RUST} transform={`rotate(${i * 45} 12 12)`} />
          ))}
          <circle cx="12" cy="12" r="3.5" fill={SCRAP_STEEL} />
        </svg>
      );
    case "scrap_frame":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="1" fill="none" stroke={SCRAP_STEEL} strokeWidth="2" />
          <path d="M4 4 L20 20 M20 4 L4 20" stroke={SCRAP_STEEL} strokeWidth="1.2" opacity="0.6" />
        </svg>
      );
    case "roll_cage":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M4 18 V10 A8 8 0 0 1 20 10 V18" fill="none" stroke={SCRAP_STEEL} strokeWidth="2.2" />
          <path d="M4 18 H20" stroke={SCRAP_STEEL} strokeWidth="2.2" />
        </svg>
      );
    case "armor_plating":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M12 3 L20 6 V12 C20 17 16.5 20 12 21 C7.5 20 4 17 4 12 V6 Z" fill={HAZARD_YELLOW} />
          <path d="M12 3 L20 6 V12 C20 17 16.5 20 12 21 Z" fill="#c99a12" />
        </svg>
      );
    default:
      return null;
  }
}
