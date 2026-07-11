import type { ReactNode } from "react";

import { groupOf } from "../../mahjong/tiles";

// Every tile face is drawn as a clean inline-SVG glyph on a 100x140 canvas.
// No images, no emoji — suit-colored accents throughout.

const INK = "#26313c";
const BONE = "#f6ecd4";
const DOT_C = "#1f7a8c";
const BAM_C = "#2f8f4e";
const CHAR_C = "#b3322c";
const WIND_C = "#33506b";

const CN_NUM = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const CJK = "'Noto Sans CJK SC','Noto Sans SC','Hiragino Sans','PingFang SC','Microsoft YaHei',serif";

function Text({ ch, x, y, size, fill, weight = 700 }: {
  ch: string;
  x: number;
  y: number;
  size: number;
  fill: string;
  weight?: number;
}): ReactNode {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fill={fill}
      fontFamily={CJK}
      fontWeight={weight}
      textAnchor="middle"
      dominantBaseline="central"
    >
      {ch}
    </text>
  );
}

function Index({ n, color }: { n: number; color: string }): ReactNode {
  return (
    <>
      <circle cx={80} cy={118} r={13} fill="#fffdf6" stroke={color} strokeWidth={2} />
      <text x={80} y={119} fontSize={17} fill={color} fontFamily="'Georgia',serif" fontWeight={800} textAnchor="middle" dominantBaseline="central">
        {n}
      </text>
    </>
  );
}

function Coin({ cx, cy, r, color }: { cx: number; cy: number; r: number; color: string }): ReactNode {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={color} />
      <circle cx={cx} cy={cy} r={r * 0.58} fill={BONE} />
      <circle cx={cx} cy={cy} r={r * 0.22} fill={color} />
    </g>
  );
}

const DOT_LAYOUT: Record<number, ReadonlyArray<readonly [number, number]>> = {
  1: [[50, 70]],
  2: [[50, 42], [50, 98]],
  3: [[30, 38], [50, 70], [70, 102]],
  4: [[34, 44], [66, 44], [34, 96], [66, 96]],
  5: [[34, 44], [66, 44], [50, 70], [34, 96], [66, 96]],
  6: [[34, 40], [66, 40], [34, 70], [66, 70], [34, 100], [66, 100]],
  7: [[50, 30], [34, 62], [66, 62], [34, 88], [66, 88], [34, 114], [66, 114]],
  8: [[34, 34], [66, 34], [34, 60], [66, 60], [34, 88], [66, 88], [34, 114], [66, 114]],
  9: [[30, 38], [50, 38], [70, 38], [30, 70], [50, 70], [70, 70], [30, 102], [50, 102], [70, 102]],
};

function Dots({ rank }: { rank: number }): ReactNode {
  const r = rank === 1 ? 26 : rank <= 3 ? 17 : 15;
  return (
    <g>
      {DOT_LAYOUT[rank].map(([cx, cy], i) => (
        <Coin key={i} cx={cx} cy={cy} r={r} color={DOT_C} />
      ))}
    </g>
  );
}

function Stick({ cx, cy, w, h }: { cx: number; cy: number; w: number; h: number }): ReactNode {
  return (
    <g>
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={w / 2} fill={BAM_C} />
      <rect x={cx - w / 2} y={cy - 2} width={w} height={4} fill="#1c5e33" />
      <circle cx={cx} cy={cy - h / 2 + w / 2} r={w * 0.34} fill="#e7f4e7" />
    </g>
  );
}

const BAM_LAYOUT: Record<number, ReadonlyArray<readonly [number, number]>> = {
  2: [[38, 70], [62, 70]],
  3: [[50, 40], [36, 102], [64, 102]],
  4: [[36, 44], [64, 44], [36, 98], [64, 98]],
  5: [[36, 44], [64, 44], [50, 70], [36, 98], [64, 98]],
  6: [[36, 42], [50, 42], [64, 42], [36, 100], [50, 100], [64, 100]],
  7: [[50, 30], [34, 70], [50, 70], [66, 70], [34, 108], [50, 108], [66, 108]],
  8: [[34, 34], [50, 34], [66, 34], [42, 70], [58, 70], [34, 106], [50, 106], [66, 106]],
  9: [[32, 36], [50, 36], [68, 36], [32, 70], [50, 70], [68, 70], [32, 104], [50, 104], [68, 104]],
};

function Bird(): ReactNode {
  return (
    <g>
      <ellipse cx={52} cy={80} rx={20} ry={26} fill={BAM_C} />
      <circle cx={44} cy={48} r={13} fill={BAM_C} />
      <path d="M32 46 L18 42 L33 54 Z" fill={CHAR_C} />
      <circle cx={41} cy={46} r={2.6} fill="#0e3a1e" />
      <path d="M66 70 Q92 74 96 108 Q74 96 64 92 Z" fill="#2a7d44" />
      <path d="M52 104 L46 124 M60 104 L62 124" stroke="#b8862f" strokeWidth={4} strokeLinecap="round" />
    </g>
  );
}

function Bamboo({ rank }: { rank: number }): ReactNode {
  if (rank === 1) return <Bird />;
  const cols = new Set(BAM_LAYOUT[rank].map(([cx]) => cx)).size;
  const w = cols >= 3 ? 11 : 13;
  return (
    <g>
      {BAM_LAYOUT[rank].map(([cx, cy], i) => (
        <Stick key={i} cx={cx} cy={cy} w={w} h={30} />
      ))}
    </g>
  );
}

function Characters({ rank }: { rank: number }): ReactNode {
  return (
    <g>
      <Text ch={CN_NUM[rank]} x={50} y={44} size={46} fill={INK} />
      <Text ch="萬" x={50} y={98} size={46} fill={CHAR_C} />
    </g>
  );
}

const WIND_CH: Record<string, string> = { e: "東", s: "南", w: "西", n: "北" };

function Wind({ dir }: { dir: string }): ReactNode {
  return (
    <g>
      <Text ch={WIND_CH[dir] ?? "東"} x={50} y={64} size={62} fill={WIND_C} />
      <rect x={30} y={104} width={40} height={5} rx={2.5} fill="#7fa9b8" />
    </g>
  );
}

function Dragon({ kind }: { kind: string }): ReactNode {
  if (kind === "red") return <Text ch="中" x={50} y={70} size={70} fill={CHAR_C} />;
  if (kind === "green") return <Text ch="發" x={50} y={70} size={60} fill="#2e8b57" />;
  return (
    <g fill="none" stroke="#2f5d8a" strokeWidth={5}>
      <rect x={26} y={30} width={48} height={80} rx={6} />
      <rect x={36} y={44} width={28} height={52} rx={4} strokeWidth={3} />
    </g>
  );
}

function Flower({ kind }: { kind: string }): ReactNode {
  if (kind === "plum") {
    const petals = [0, 1, 2, 3, 4].map((i) => {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      return <circle key={i} cx={50 + Math.cos(a) * 20} cy={62 + Math.sin(a) * 20} r={14} fill="#d9557f" />;
    });
    return (
      <g>
        {petals}
        <circle cx={50} cy={62} r={9} fill="#f4d04a" />
        <Index n={1} color="#c53f6a" />
      </g>
    );
  }
  if (kind === "orchid") {
    return (
      <g>
        <path d="M50 96 Q40 60 26 40 Q46 52 50 74 Q54 52 74 40 Q60 60 50 96 Z" fill="#8e6fc4" />
        <path d="M50 92 Q50 66 50 44" stroke="#5f8f4c" strokeWidth={4} fill="none" />
        <ellipse cx={50} cy={70} rx={7} ry={12} fill="#b79be0" />
        <Index n={2} color="#7357b0" />
      </g>
    );
  }
  if (kind === "mum") {
    const rays = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return (
        <ellipse
          key={i}
          cx={50 + Math.cos(a) * 20}
          cy={62 + Math.sin(a) * 20}
          rx={5}
          ry={13}
          fill="#d9a441"
          transform={`rotate(${(a * 180) / Math.PI + 90} ${50 + Math.cos(a) * 20} ${62 + Math.sin(a) * 20})`}
        />
      );
    });
    return (
      <g>
        {rays}
        <circle cx={50} cy={62} r={12} fill="#b9791f" />
        <Index n={3} color="#a9711d" />
      </g>
    );
  }
  return (
    <g>
      <rect x={46} y={28} width={9} height={78} rx={4} fill="#3c9d5b" />
      <rect x={45} y={50} width={11} height={5} fill="#25703c" />
      <rect x={45} y={78} width={11} height={5} fill="#25703c" />
      <path d="M50 44 Q74 36 82 20 Q62 30 50 44 Z" fill="#57b877" />
      <path d="M50 72 Q26 64 18 48 Q38 58 50 72 Z" fill="#57b877" />
      <Index n={4} color="#2f804a" />
    </g>
  );
}

function Season({ kind }: { kind: string }): ReactNode {
  if (kind === "spring") {
    return (
      <g>
        <path d="M50 104 L50 52" stroke="#4a8f3f" strokeWidth={5} fill="none" />
        <path d="M50 66 Q26 58 20 34 Q46 44 50 66 Z" fill="#4fae5a" />
        <path d="M50 78 Q74 70 80 46 Q54 56 50 78 Z" fill="#63c06d" />
        <Index n={1} color="#3f8a49" />
      </g>
    );
  }
  if (kind === "summer") {
    const rays = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return (
        <line
          key={i}
          x1={50 + Math.cos(a) * 24}
          y1={62 + Math.sin(a) * 24}
          x2={50 + Math.cos(a) * 36}
          y2={62 + Math.sin(a) * 36}
          stroke="#e0a53a"
          strokeWidth={5}
          strokeLinecap="round"
        />
      );
    });
    return (
      <g>
        {rays}
        <circle cx={50} cy={62} r={20} fill="#f0b53f" />
        <Index n={2} color="#c98a26" />
      </g>
    );
  }
  if (kind === "autumn") {
    return (
      <g>
        <path
          d="M50 26 L58 46 L78 42 L64 58 L82 68 L60 70 L64 96 L50 78 L36 96 L40 70 L18 68 L36 58 L22 42 L42 46 Z"
          fill="#d0632a"
        />
        <path d="M50 70 L50 104" stroke="#8a4a1e" strokeWidth={4} />
        <Index n={3} color="#b5531f" />
      </g>
    );
  }
  const spokes = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2;
    const x2 = 50 + Math.cos(a) * 34;
    const y2 = 62 + Math.sin(a) * 34;
    return (
      <g key={i} stroke="#4a86c6" strokeWidth={4} strokeLinecap="round">
        <line x1={50} y1={62} x2={x2} y2={y2} />
        <line x1={50 + Math.cos(a) * 22} y1={62 + Math.sin(a) * 22} x2={50 + Math.cos(a) * 22 + Math.cos(a + 1) * 9} y2={62 + Math.sin(a) * 22 + Math.sin(a + 1) * 9} />
        <line x1={50 + Math.cos(a) * 22} y1={62 + Math.sin(a) * 22} x2={50 + Math.cos(a) * 22 + Math.cos(a - 1) * 9} y2={62 + Math.sin(a) * 22 + Math.sin(a - 1) * 9} />
      </g>
    );
  });
  return (
    <g>
      {spokes}
      <circle cx={50} cy={62} r={6} fill="#4a86c6" />
      <Index n={4} color="#3a6ea8" />
    </g>
  );
}

export function FaceGlyph({ faceId }: { faceId: string }): ReactNode {
  const group = groupOf(faceId);
  const [prefix, suffix] = faceId.split("-");
  let inner: ReactNode;
  if (group === "suit") {
    const rank = Number(suffix);
    if (prefix === "dots") inner = <Dots rank={rank} />;
    else if (prefix === "bamboo") inner = <Bamboo rank={rank} />;
    else inner = <Characters rank={rank} />;
  } else if (group === "wind") {
    inner = <Wind dir={suffix} />;
  } else if (group === "dragon") {
    inner = <Dragon kind={suffix} />;
  } else if (group === "flower") {
    inner = <Flower kind={suffix} />;
  } else {
    inner = <Season kind={suffix} />;
  }
  return (
    <svg viewBox="0 0 100 140" width="100%" height="100%" style={{ display: "block" }} aria-hidden>
      {inner}
    </svg>
  );
}
