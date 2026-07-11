import { useId, type ReactNode } from "react";

import { colorDef, type GlyphKind } from "../../bubble/colors";

const STAR_POINTS =
  "16,9 17.7,13.65 22.66,13.84 18.76,16.9 20.11,21.66 16,18.9 11.89,21.66 13.24,16.9 9.34,13.84 14.3,13.65";

function glyph(kind: GlyphKind): ReactNode {
  const fill = "rgba(255,255,255,0.92)";
  const stroke = "rgba(8,20,18,0.34)";
  switch (kind) {
    case "triangle":
      return <polygon points="16,9.5 23,22 9,22" fill={fill} stroke={stroke} strokeWidth={1} strokeLinejoin="round" />;
    case "diamond":
      return <polygon points="16,8 23.5,16 16,24 8.5,16" fill={fill} stroke={stroke} strokeWidth={1} strokeLinejoin="round" />;
    case "circle":
      return <circle cx={16} cy={16} r={5.4} fill={fill} stroke={stroke} strokeWidth={1} />;
    case "ring":
      return <circle cx={16} cy={16} r={6} fill="none" stroke={fill} strokeWidth={3.4} />;
    case "square":
      return <rect x={10.6} y={10.6} width={10.8} height={10.8} rx={1.6} fill={fill} stroke={stroke} strokeWidth={1} strokeLinejoin="round" />;
    case "star":
      return <polygon points={STAR_POINTS} fill={fill} stroke={stroke} strokeWidth={0.8} strokeLinejoin="round" />;
  }
}

export function BubbleMark({ id, size = 30 }: { id: number; size?: number }) {
  const c = colorDef(id);
  const gid = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label={c.name} role="img">
      <defs>
        <radialGradient id={gid} cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="55%" stopColor={c.base} />
          <stop offset="100%" stopColor={c.dark} />
        </radialGradient>
      </defs>
      <circle cx={16} cy={16} r={14.5} fill={`url(#${gid})`} stroke={c.dark} strokeWidth={1.4} />
      <ellipse cx={11.5} cy={11} rx={4.6} ry={3} fill="rgba(255,255,255,0.5)" transform="rotate(-28 11.5 11)" />
      {glyph(c.glyph)}
    </svg>
  );
}
