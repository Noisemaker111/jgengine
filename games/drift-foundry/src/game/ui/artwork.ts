import type { MedalId } from "../events/catalog";
import type { PartIconId } from "../parts/catalog";

/* The yard's stamped icons as SVG artwork for native glyphs: rust, hazard yellow, scrap steel, weld white. */
const RUST = "#b7410e";
const HAZARD = "#f0c419";
const STEEL = "#8d99a6";
const WELD = "#fef3e0";

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`;
const spokes = (count: number, step: number, part: string) => Array.from({ length: count }, (_, i) => part.replace("ROT", String(i * step))).join("");

const PARTS: Record<PartIconId, string> = {
  salvage_v6: svg(`<rect x="5" y="10" width="14" height="8" rx="1.2" fill="${RUST}"/><rect x="7" y="5" width="3" height="6" fill="${STEEL}"/><rect x="14" y="5" width="3" height="6" fill="${STEEL}"/>`),
  truck_engine: svg(`<rect x="3" y="9" width="18" height="10" rx="1.2" fill="${RUST}"/><rect x="5" y="4" width="4" height="6" fill="${STEEL}"/><rect x="10" y="4" width="4" height="6" fill="${STEEL}"/><rect x="15" y="4" width="4" height="6" fill="${STEEL}"/>`),
  ev_conversion: svg(`<rect x="5" y="7" width="14" height="12" rx="2" fill="${WELD}"/><path d="M13 9 L9 14 H12 L11 17 L16 12 H13 Z" fill="#4fd1c5"/>`),
  plow_blade: svg(`<path d="M3 18 L12 6 L21 18 Z" fill="${RUST}"/><rect x="9" y="18" width="6" height="3" fill="${STEEL}"/>`),
  hood_plate: svg(`<rect x="3" y="9" width="18" height="6" rx="1.4" fill="${STEEL}" stroke="#5a5650" stroke-width="1"/>`),
  fan_blade_vanes: svg(`<circle cx="12" cy="12" r="2" fill="${HAZARD}"/><path d="M12 12 L20 8 L20 11 Z" fill="${HAZARD}"/><path d="M12 12 L6 4 L8 3 Z" fill="${HAZARD}"/><path d="M12 12 L5 17 L7 20 Z" fill="${HAZARD}"/>`),
  coil_springs: svg(`<circle cx="12" cy="6" r="4" fill="none" stroke="${STEEL}" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="${STEEL}" stroke-width="2"/><circle cx="12" cy="18" r="4" fill="none" stroke="${STEEL}" stroke-width="2"/>`),
  steel_rims: svg(`<circle cx="12" cy="12" r="8" fill="#101018"/>${spokes(4, 45, `<rect x="11.3" y="4" width="1.4" height="16" fill="${STEEL}" transform="rotate(ROT 12 12)"/>`)}<circle cx="12" cy="12" r="3.2" fill="${STEEL}"/>`),
  monster_treads: svg(`<circle cx="12" cy="12" r="9" fill="#101018"/>${spokes(8, 45, `<rect x="11" y="2.5" width="2" height="4" fill="${RUST}" transform="rotate(ROT 12 12)"/>`)}<circle cx="12" cy="12" r="3.5" fill="${STEEL}"/>`),
  scrap_frame: svg(`<rect x="4" y="4" width="16" height="16" rx="1" fill="none" stroke="${STEEL}" stroke-width="2"/><path d="M4 4 L20 20 M20 4 L4 20" stroke="${STEEL}" stroke-width="1.2" opacity="0.6"/>`),
  roll_cage: svg(`<path d="M4 18 V10 A8 8 0 0 1 20 10 V18" fill="none" stroke="${STEEL}" stroke-width="2.2"/><path d="M4 18 H20" stroke="${STEEL}" stroke-width="2.2"/>`),
  armor_plating: svg(`<path d="M12 3 L20 6 V12 C20 17 16.5 20 12 21 C7.5 20 4 17 4 12 V6 Z" fill="${HAZARD}"/><path d="M12 3 L20 6 V12 C20 17 16.5 20 12 21 Z" fill="#c99a12"/>`),
};
const EMPTY_SOCKET = svg(`<rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="#5a5650" stroke-width="1.4" stroke-dasharray="3 3"/>`);

/** A part's stamped icon, or the dashed empty socket. */
export function partArtwork(id: PartIconId | null): string {
  return id === null ? EMPTY_SOCKET : PARTS[id];
}

const MEDAL_TINT: Record<MedalId, string> = { bronze: "#b8763d", silver: "#c9d0d4", gold: "#f2c230" };
/** A hex-cut medal with a stamped star; an unearned medal is an empty steel socket. */
export function medalArtwork(medal: MedalId, earned: boolean): string {
  const face = earned ? MEDAL_TINT[medal] : "#3a3f42", star = earned ? "#1b1407" : "#6c7175";
  return svg(`<path d="M12 1 L21.5 6.5 V17.5 L12 23 L2.5 17.5 V6.5 Z" fill="#0c0e0f"/><path d="M12 2.6 L20.1 7.3 V16.7 L12 21.4 L3.9 16.7 V7.3 Z" fill="${face}"/><path d="M12 6.2 L13.7 10 L17.6 10.3 L14.6 12.9 L15.6 16.8 L12 14.7 L8.4 16.8 L9.4 12.9 L6.4 10.3 L10.3 10 Z" fill="${star}"/>`);
}

/** The finish flag at the end of the route rule. */
export const FLAG_ARTWORK = svg(`<rect x="4" y="3" width="2" height="19" fill="#f2c230"/><path d="M6 4 H20 L17 8.5 L20 13 H6 Z" fill="#f2c230"/>`);

/** The dash rail's pause tab and settings gear, in hazard yellow. */
export const PAUSE_ARTWORK = svg(`<rect x="6" y="5" width="4" height="14" fill="#f2c230"/><rect x="14" y="5" width="4" height="14" fill="#f2c230"/>`);
export const GEAR_ARTWORK = svg(`${spokes(8, 45, `<rect x="10.5" y="2" width="3" height="5" fill="#f2c230" transform="rotate(ROT 12 12)"/>`)}<circle cx="12" cy="12" r="6.5" fill="#f2c230"/><circle cx="12" cy="12" r="2.6" fill="#1c2022"/>`);
/** Touch pad arrows. */
export const LEFT_ARTWORK = svg(`<path d="M15 4 L7 12 L15 20" fill="none" stroke="#f2c230" stroke-width="3.2"/>`);
export const RIGHT_ARTWORK = svg(`<path d="M9 4 L17 12 L9 20" fill="none" stroke="#f2c230" stroke-width="3.2"/>`);
