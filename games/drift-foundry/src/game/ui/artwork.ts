import type { PowerUpId } from "../cart/goods";
import type { MedalId } from "../events/catalog";
import type { PartIconId } from "../parts/catalog";

/* The store's shelf-tag icons as SVG artwork for native glyphs: sale red, tag yellow, chrome, foam pastels. */
const RED = "#e8303a";
const YELLOW = "#ffd21e";
const CHROME = "#c9d1d9";
const WHITE = "#fbf8f0";
const TEAL = "#5de0ce";
const PINK = "#ff4fa0";
const INK = "#1f2430";

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`;
const spokes = (count: number, step: number, part: string) => Array.from({ length: count }, (_, i) => part.replace("ROT", String(i * step))).join("");

const PARTS: Record<PartIconId, string> = {
  power_walker: svg(`<path d="M3 15 C3 11 7 11 9 9 L13 9 L14 13 L21 14 C22 14 22 18 21 18 H4 C3 18 3 16 3 15 Z" fill="${WHITE}"/><rect x="3" y="17" width="19" height="2" fill="${TEAL}"/><path d="M10 9 L12 13" stroke="${RED}" stroke-width="1.4"/>`),
  leaf_blower: svg(`<rect x="3" y="8" width="10" height="9" rx="2" fill="#ff7a1e"/><path d="M12 11 L22 9 V14 L12 14 Z" fill="#ff7a1e"/><circle cx="7" cy="12.5" r="2.4" fill="${INK}"/>`),
  e_assist: svg(`<circle cx="12" cy="12" r="9" fill="#2fa8ff"/><path d="M13 5 L8 13 H12 L11 19 L16 11 H12 Z" fill="#5dff9a"/>`),
  pallet_plow: svg(`<rect x="3" y="6" width="18" height="3" fill="#c89a62"/><rect x="3" y="11" width="18" height="3" fill="#c89a62"/><rect x="3" y="16" width="18" height="3" fill="#c89a62"/><rect x="5" y="5" width="3" height="15" fill="#a8784a"/><rect x="16" y="5" width="3" height="15" fill="#a8784a"/>`),
  noodle_bumper: svg(`<rect x="2" y="5" width="20" height="4" rx="2" fill="${PINK}"/><rect x="2" y="10" width="20" height="4" rx="2" fill="${TEAL}"/><rect x="2" y="15" width="20" height="4" rx="2" fill="${YELLOW}"/>`),
  sign_spoiler: svg(`<path d="M4 20 L8 4 H16 L20 20" fill="${YELLOW}"/><rect x="7" y="9" width="10" height="4" fill="${RED}"/>`),
  spring_casters: svg(`${[5, 9, 13].map((y) => `<ellipse cx="12" cy="${y}" rx="6" ry="2" fill="none" stroke="${PINK}" stroke-width="2"/>`).join("")}<circle cx="12" cy="19" r="3.5" fill="${INK}"/>`),
  fixed_squeak: svg(`<circle cx="10" cy="14" r="7" fill="${INK}"/>${spokes(4, 45, `<rect x="9.3" y="8" width="1.4" height="12" fill="${CHROME}" transform="rotate(ROT 10 14)"/>`)}<path d="M18 2 C18 2 21 6 21 8 A3 3 0 0 1 15 8 C15 6 18 2 18 2 Z" fill="#5dff9a"/>`),
  knobby_casters: svg(`<circle cx="12" cy="12" r="9" fill="${INK}"/>${spokes(8, 45, `<rect x="11" y="2" width="2" height="4" fill="#3a8f5a" transform="rotate(ROT 12 12)"/>`)}<circle cx="12" cy="12" r="3.5" fill="#3a8f5a"/>`),
  wire_basket: svg(`<path d="M3 7 H21 L19 19 H5 Z" fill="none" stroke="${CHROME}" stroke-width="2"/><path d="M7 7 L8 19 M12 7 V19 M17 7 L16 19 M4 11 H20 M4.6 15 H19.4" stroke="${CHROME}" stroke-width="1"/><rect x="10" y="5" width="4" height="3" fill="${YELLOW}"/>`),
  cage_basket: svg(`<path d="M4 19 V11 A8 8 0 0 1 20 11 V19" fill="none" stroke="#5a6070" stroke-width="2.2"/><path d="M8 19 V6 M12 19 V3.5 M16 19 V6 M3 19 H21" stroke="#5a6070" stroke-width="1.6"/>`),
  bin_lid_armor: svg(`<circle cx="12" cy="12" r="9" fill="#aeb6bf"/><circle cx="12" cy="12" r="6" fill="none" stroke="#7d8794" stroke-width="1.4"/><rect x="9" y="10.5" width="6" height="3" rx="1" fill="${INK}"/>`),
};
const EMPTY_SOCKET = svg(`<rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="#8a93b0" stroke-width="1.4" stroke-dasharray="3 3"/>`);

/** A mod's shelf-tag icon, or the dashed empty socket. */
export function partArtwork(id: PartIconId | null): string {
  return id === null ? EMPTY_SOCKET : PARTS[id];
}

const POWERS: Record<PowerUpId, string> = {
  extinguisher: svg(`<rect x="8" y="7" width="8" height="15" rx="3" fill="${RED}"/><rect x="10" y="3" width="4" height="4" fill="${INK}"/><path d="M14 4 H20 L21 7" stroke="${INK}" stroke-width="1.6" fill="none"/>`),
  marbles: svg(`<circle cx="8" cy="15" r="4" fill="${TEAL}"/><circle cx="15" cy="16" r="3.5" fill="${PINK}"/><circle cx="12" cy="9" r="3.5" fill="${YELLOW}"/><circle cx="18" cy="9" r="2.5" fill="#3fb6ff"/>`),
  mop: svg(`<path d="M17 2 L9 15" stroke="#7a5cff" stroke-width="2"/><path d="M4 15 H14 L16 21 H2 Z" fill="${WHITE}" stroke="#c9c2b4" stroke-width="1"/>`),
  bouncy_balls: svg(`<circle cx="12" cy="18" r="4" fill="${PINK}"/><circle cx="12" cy="10.5" r="3.4" fill="${YELLOW}"/><circle cx="12" cy="4.5" r="2.6" fill="${TEAL}"/>`),
  rotisserie_chicken: svg(`<ellipse cx="12" cy="14" rx="8" ry="6" fill="#d9902b"/><ellipse cx="5" cy="17" rx="2.4" ry="2" fill="#e0a040"/><ellipse cx="19" cy="17" rx="2.4" ry="2" fill="#e0a040"/><path d="M3 12 A9 8 0 0 1 21 12" fill="none" stroke="#fff6c9" stroke-width="1.6" opacity="0.8"/>`),
};

/** A power-up's shelf-tag icon. */
export function powerArtwork(id: PowerUpId): string {
  return POWERS[id];
}

const MEDAL_TINT: Record<MedalId, string> = { bronze: "#b8763d", silver: "#c9d0d4", gold: "#ffd21e" };
/** A round sale-sticker medal with a star; an unearned medal is an empty sticker outline. */
export function medalArtwork(medal: MedalId, earned: boolean): string {
  const face = earned ? MEDAL_TINT[medal] : "#3a4566", star = earned ? "#1b1407" : "#6c7590";
  return svg(`<circle cx="12" cy="12" r="11" fill="#0b1530"/><circle cx="12" cy="12" r="9.4" fill="${face}"/><path d="M12 6.2 L13.7 10 L17.6 10.3 L14.6 12.9 L15.6 16.8 L12 14.7 L8.4 16.8 L9.4 12.9 L6.4 10.3 L10.3 10 Z" fill="${star}"/>`);
}

/** The checkout flag at the end of the route rule. */
export const FLAG_ARTWORK = svg(`<rect x="4" y="3" width="2" height="19" fill="${YELLOW}"/><path d="M6 4 H20 V13 H6 Z" fill="${WHITE}"/><path d="M6 4 H10 V8.5 H6 Z M14 4 H18 V8.5 H14 Z M10 8.5 H14 V13 H10 Z M18 8.5 H20 V13 H18 Z" fill="${INK}"/>`);

/** The dash rail's pause tab and settings gear, in tag yellow. */
export const PAUSE_ARTWORK = svg(`<rect x="6" y="5" width="4" height="14" fill="${YELLOW}"/><rect x="14" y="5" width="4" height="14" fill="${YELLOW}"/>`);
export const GEAR_ARTWORK = svg(`${spokes(8, 45, `<rect x="10.5" y="2" width="3" height="5" fill="${YELLOW}" transform="rotate(ROT 12 12)"/>`)}<circle cx="12" cy="12" r="6.5" fill="${YELLOW}"/><circle cx="12" cy="12" r="2.6" fill="#14234a"/>`);
/** Touch pad arrows. */
export const LEFT_ARTWORK = svg(`<path d="M15 4 L7 12 L15 20" fill="none" stroke="${YELLOW}" stroke-width="3.2"/>`);
export const RIGHT_ARTWORK = svg(`<path d="M9 4 L17 12 L9 20" fill="none" stroke="${YELLOW}" stroke-width="3.2"/>`);
