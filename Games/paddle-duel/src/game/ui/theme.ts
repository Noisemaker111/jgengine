export const FONT = '"IBM Plex Mono", "SFMono-Regular", ui-monospace, Menlo, monospace';
export const PHOSPHOR = "#c7ffd2";
export const PHOSPHOR_BRIGHT = "#effff2";
export const COURT_BG = "#04070a";

export function glow(alpha: number): string {
  return `rgba(88, 255, 150, ${alpha})`;
}

export function textGlow(strength = 1): string {
  return `0 0 ${6 * strength}px rgba(88,255,150,0.55), 0 0 ${14 * strength}px rgba(88,255,150,0.22)`;
}
