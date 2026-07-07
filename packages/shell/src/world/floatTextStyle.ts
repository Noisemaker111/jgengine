export interface FloatTextInfo {
  kind: string;
  hitType?: string;
  element?: string;
  crit?: boolean;
  scale?: number;
}

export interface FloatTextStyle {
  color: string;
  fontSizePx: number;
  fontWeight: number;
  glow: string;
}

const BASE_SIZE = 18;

const ELEMENT_COLORS: Record<string, string> = {
  fire: "#fb923c",
  frost: "#7dd3fc",
  ice: "#7dd3fc",
  lightning: "#fde047",
  shock: "#fde047",
  poison: "#a3e635",
  rot: "#a3e635",
  bleed: "#f87171",
  arcane: "#c084fc",
  holy: "#fef08a",
  void: "#c084fc",
};

export function resolveFloatTextStyle(info: FloatTextInfo): FloatTextStyle {
  const crit = info.crit === true || info.hitType === "crit";
  let color: string;
  if (info.kind === "heal") {
    color = "#6ee7b7";
  } else if (info.element !== undefined && ELEMENT_COLORS[info.element] !== undefined) {
    color = ELEMENT_COLORS[info.element];
  } else if (crit) {
    color = "#fbbf24";
  } else {
    color = "#fde68a";
  }

  const critScale = crit ? 1.55 : 1;
  const scale = info.scale ?? 1;
  const fontSizePx = Math.round(BASE_SIZE * critScale * scale);
  return {
    color,
    fontSizePx,
    fontWeight: crit ? 900 : 800,
    glow: crit ? `0 0 10px ${color}` : "0 1px 3px rgba(0,0,0,0.95)",
  };
}
