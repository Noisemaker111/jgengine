/**
 * Beacon's own marks as SVG artwork on a 24-unit grid, drawn by Rune in the colour the caller
 * passes. Each is one silhouette, so a glyph reads at 12 points on a phone plaque.
 */
const filled = (body: string) => `<g fill="currentColor">${body}</g>`;
const R45 = "rotate(45 12 12)";

export const GLYPHS = {
  bow: filled('<path d="M8,2 C3,7 3,17 8,22 C9,22 9.8,21 9,20 C5.5,16 5.5,8 9,4 C9.8,3 9,2 8,2 Z"/><rect x="7.6" y="2" width="0.9" height="20"/><path d="M9 12h11l-3-2.4v4.8z"/>'),
  bomb: filled('<circle cx="12" cy="14.5" r="7"/><rect x="14.2" y="3" width="1.6" height="6" rx="0.8" transform="rotate(35 15 9)"/><circle cx="17" cy="3.4" r="1.5"/>'),
  frost: filled([0, 60, 120].map((deg) => `<g transform="rotate(${deg} 12 12)"><rect x="11.2" y="2" width="1.6" height="20" rx="0.8"/><rect x="9.4" y="2.6" width="5.2" height="1.4"/><rect x="9.4" y="20" width="5.2" height="1.4"/></g>`).join("")),
  crystal: filled('<polygon points="7,22 5,10 8,3 11,10 9,22"/><polygon points="14,22 12,6 15,1 18,7 16,22"/><polygon points="3,22 2,15 4,11 6,15 5,22"/>'),
  fire: filled('<path d="M12,2 C8,7 5,11 6,15.5 C6.8,19 9.7,21.5 12.5,21.5 C16,21.5 19,18.7 18.6,14.8 C18.3,12 16.7,10.5 16.8,12.7 C16.9,14.4 15.8,15.3 14.9,14.2 C14,13 14.6,10.8 13.3,8.5 C12.5,7 11.7,5.5 12,2 Z"/>'),
  coin: filled('<path fill-rule="evenodd" d="M12,3 C16.97,3 21,7.03 21,12 C21,16.97 16.97,21 12,21 C7.03,21 3,16.97 3,12 C3,7.03 7.03,3 12,3 Z M12,5.4 C8.35,5.4 5.4,8.35 5.4,12 C5.4,15.65 8.35,18.6 12,18.6 C15.65,18.6 18.6,15.65 18.6,12 C18.6,8.35 15.65,5.4 12,5.4 Z M12,7.6 C9.57,7.6 7.6,9.57 7.6,12 C7.6,14.43 9.57,16.4 12,16.4 C14.43,16.4 16.4,14.43 16.4,12 C16.4,9.57 14.43,7.6 12,7.6 Z"/>'),
  hammer: filled(`<g transform="${R45}"><rect x="11" y="9" width="2" height="13" rx="1"/><rect x="6" y="3" width="12" height="6" rx="1.5"/></g>`),
  flag: filled('<rect x="5" y="2" width="1.8" height="20" rx="0.6"/><path d="M6.8,3 L19,6.5 L15,8.2 L19,10 L6.8,13.2 Z"/>'),
  skull: filled('<path fill-rule="evenodd" d="M6,12 C6,6 8.5,3 12,3 C15.5,3 18,6 18,12 L18,15 L15.4,15 L15.4,17 L13,17 L13,19 L11,19 L11,17 L8.6,17 L8.6,15 L6,15 Z M9.3,11 C8.36,11 7.6,11.76 7.6,12.7 C7.6,13.64 8.36,14.4 9.3,14.4 C10.24,14.4 11,13.64 11,12.7 C11,11.76 10.24,11 9.3,11 Z M14.7,11 C13.76,11 13,11.76 13,12.7 C13,13.64 13.76,14.4 14.7,14.4 C15.64,14.4 16.4,13.64 16.4,12.7 C16.4,11.76 15.64,11 14.7,11 Z"/>'),
  wing: filled('<path d="M2,20 C4,20.5 10,21 15,20 C15,20 13,19.5 11,18 C15,19 19,17 20,14 C19,15.5 17,16 15,15 C19,14 21,10 21,6 C20,9 18,11 15,10 C13,9 14,6 13,2 C9,5 10,10 8,14 C6,18 2,20 2,20 Z"/>'),
  helmet: filled('<path fill-rule="evenodd" d="M4,13.2 C4,6.3 7.5,3 12,3 C16.5,3 20,6.3 20,13.2 L20,15 L4,15 Z M7.2,10.2 L16.8,10.2 L16.8,12 L7.2,12 Z"/><rect x="3" y="14.6" width="18" height="1.8" rx="0.9"/>'),
  eye: filled('<path fill-rule="evenodd" d="M2,12 C6,5 18,5 22,12 C18,19 6,19 2,12 Z M15,12 C15,13.66 13.66,15 12,15 C10.34,15 9,13.66 9,12 C9,10.34 10.34,9 12,9 C13.66,9 15,10.34 15,12 Z"/>'),
  shield: filled('<path fill-rule="evenodd" d="M12,2 L19,5 L19,12 C19,17 15.5,20.5 12,22 C8.5,20.5 5,17 5,12 L5,5 Z M12,8 L14.3,11 L12,14 L9.7,11 Z"/>'),
  heart: filled('<path d="M12,21 C4,15 2,10.5 2,7.2 C2,4 4.5,2 7.2,2 C9.3,2 11,3.3 12,5.2 C13,3.3 14.7,2 16.8,2 C19.5,2 22,4 22,7.2 C22,10.5 20,15 12,21 Z"/>'),
  swap: filled('<polygon points="21,7.5 14.5,2 14.5,5.4 4,5.4 4,9.6 14.5,9.6 14.5,13"/><polygon points="3,16.5 9.5,11 9.5,14.4 20,14.4 20,18.6 9.5,18.6 9.5,22"/>'),
  arrowLeft: filled('<polygon points="3,12 11,4.5 11,9.6 21,9.6 21,14.4 11,14.4 11,19.5"/>'),
  hourglass: filled('<rect x="5" y="2" width="14" height="2" rx="1"/><rect x="5" y="20" width="14" height="2" rx="1"/><polygon points="6,4 18,4 12,12"/><polygon points="6,20 18,20 12,12"/>'),
  pause: filled('<rect x="6" y="4" width="4.2" height="16" rx="1.3"/><rect x="13.8" y="4" width="4.2" height="16" rx="1.3"/>'),
  star: filled('<polygon points="12,1.5 14.47,8.6 21.99,8.75 15.99,13.3 18.17,20.49 12,16.2 5.83,20.49 8.0,13.3 2.01,8.75 9.53,8.6"/>'),
  arrow: filled(`<g transform="${R45}"><rect x="11" y="6" width="2" height="14" rx="1"/><polygon points="12,1 15,6 9,6"/><polygon points="12,19.5 8.5,23 11,19"/><polygon points="12,19.5 15.5,23 13,19"/></g>`),
  lightning: filled('<polygon points="13,2 5,14 11,14 9,22 19,9 12,9 14.5,2"/>'),
  crosshair: filled('<path fill-rule="evenodd" d="M12,4 C16.42,4 20,7.58 20,12 C20,16.42 16.42,20 12,20 C7.58,20 4,16.42 4,12 C4,7.58 7.58,4 12,4 Z M12,6.6 C9.02,6.6 6.6,9.02 6.6,12 C6.6,14.98 9.02,17.4 12,17.4 C14.98,17.4 17.4,14.98 17.4,12 C17.4,9.02 14.98,6.6 12,6.6 Z"/><rect x="11.2" y="1" width="1.6" height="3.4"/><rect x="11.2" y="19.6" width="1.6" height="3.4"/><rect x="1" y="11.2" width="3.4" height="1.6"/><rect x="19.6" y="11.2" width="3.4" height="1.6"/><circle cx="12" cy="12" r="1.3"/>'),
  debuffArrow: filled('<path d="M5,6 L7.3,6 L12,10.2 L16.7,6 L19,6 L12,13.5 Z"/><path d="M5,13.5 L7.3,13.5 L12,17.7 L16.7,13.5 L19,13.5 L12,21 Z"/>'),
  arrowUp: filled('<polygon points="12,3 19.5,11 14.4,11 14.4,21 9.6,21 9.6,11 4.5,11"/>'),
  amulet: filled('<path fill-rule="evenodd" d="M12,2.5 C13.4,2.5 14.5,3.6 14.5,5 C14.5,6.4 13.4,7.5 12,7.5 C10.6,7.5 9.5,6.4 9.5,5 C9.5,3.6 10.6,2.5 12,2.5 Z M12,3.9 C11.4,3.9 10.9,4.4 10.9,5 C10.9,5.6 11.4,6.1 12,6.1 C12.6,6.1 13.1,5.6 13.1,5 C13.1,4.4 12.6,3.9 12,3.9 Z"/><polygon points="12,7 16.5,11.5 14.3,19.5 9.7,19.5 7.5,11.5"/>'),
  // The beacon brazier in three passes, so each can take its own colour and the flame its own scale.
  flameOuter: filled('<path d="M12 1 C15.4 6 18.4 9.4 17.6 13.6 C17.2 16.6 14.6 18.4 12 18.4 C9.4 18.4 6.8 16.6 6.4 13.6 C5.6 9.4 9 6.4 12 1 Z"/>'),
  flameInner: filled('<path d="M12 8.4 C13.6 10.6 14.6 12.4 14.2 14.4 C13.9 16 13 17 12 17 C11 17 10.1 16 9.8 14.4 C9.4 12.4 10.4 10.6 12 8.4 Z"/>'),
  bowl: filled('<rect x="3.4" y="16" width="17.2" height="1.8" rx="0.6"/><path d="M4.2 17.8 H19.8 L17.2 22.6 H6.8 Z"/><path d="M8 22.4 L6 24 M16 22.4 L18 24" stroke="currentColor" stroke-width="1.2"/>'),
} as const;

export type GlyphName = keyof typeof GLYPHS;
