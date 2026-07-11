export const COLORS = {
  feltHi: "#22623f",
  feltLo: "#134228",
  gridLine: "rgba(4, 20, 12, 0.55)",
  brass: "#c69a43",
  brassLo: "#7c5d1f",
  brassHi: "#eccd7c",
  obsidianHi: "#454550",
  obsidianLo: "#0a0a0f",
  ivoryHi: "#fffef6",
  ivoryLo: "#d4cbb0",
  panelBg: "rgba(11, 24, 17, 0.94)",
  panelBorder: "rgba(198, 154, 67, 0.42)",
  text: "#f3eede",
  subtext: "#a9b79c",
  danger: "#e2915a",
} as const;

export const FLIP_STEP_MS = 70;
export const FLIP_MS = 460;

export function discGradient(player: 1 | 2): string {
  return player === 1
    ? `radial-gradient(circle at 34% 30%, ${COLORS.obsidianHi} 0%, #1a1a20 46%, ${COLORS.obsidianLo} 100%)`
    : `radial-gradient(circle at 34% 30%, ${COLORS.ivoryHi} 0%, #efe7d1 52%, ${COLORS.ivoryLo} 100%)`;
}
