const cell = 18;

function BlockStacker({ hue }: { hue: string }) {
  const at = (col: number, row: number, opacity: number) => (
    <rect
      key={`${col}-${row}`}
      x={46 + col * cell}
      y={104 - row * cell}
      width={cell - 2}
      height={cell - 2}
      rx={3}
      fill={hue}
      opacity={opacity}
    />
  );
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      {at(2, 4, 0.95)}
      {at(1, 3, 0.95)}
      {at(2, 3, 0.95)}
      {at(3, 3, 0.95)}
      {at(0, 0, 0.4)}
      {at(1, 0, 0.4)}
      {at(2, 0, 0.4)}
      {at(4, 0, 0.4)}
      {at(5, 0, 0.4)}
      {at(0, 1, 0.28)}
      {at(1, 1, 0.28)}
      {at(4, 1, 0.28)}
      <line x1="20" y1="112" x2="180" y2="112" stroke={hue} strokeOpacity="0.35" strokeWidth="2" />
    </svg>
  );
}

function MazeMuncher({ hue }: { hue: string }) {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <path d="M56 60 L84 44 A32 32 0 1 0 84 76 Z" fill={hue} opacity="0.95" />
      {[104, 124, 144].map((x) => (
        <circle key={x} cx={x} cy={60} r={4} fill={hue} opacity="0.5" />
      ))}
      <path
        d="M160 74 v-14 a13 13 0 0 1 26 0 v14 l-5 -5 -4 5 -4 -5 -4 5 -4 -5 Z"
        fill={hue}
        opacity="0.35"
      />
      <circle cx="168" cy="58" r="2.6" fill="#05070d" />
      <circle cx="178" cy="58" r="2.6" fill="#05070d" />
    </svg>
  );
}

function PlatformHopper({ hue }: { hue: string }) {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <rect x="18" y="92" width="52" height="8" rx="4" fill={hue} opacity="0.4" />
      <rect x="86" y="68" width="46" height="8" rx="4" fill={hue} opacity="0.6" />
      <rect x="148" y="46" width="38" height="8" rx="4" fill={hue} opacity="0.85" />
      <circle cx="96" cy="42" r="9" fill={hue} />
      <path d="M92 52 q4 6 8 0" stroke={hue} strokeWidth="2.5" fill="none" opacity="0.7" />
      <line x1="172" y1="46" x2="172" y2="22" stroke={hue} strokeWidth="2.5" opacity="0.9" />
      <path d="M172 22 l14 5 -14 5 Z" fill={hue} />
    </svg>
  );
}

function SpireCards({ hue }: { hue: string }) {
  const card = (rotate: number, opacity: number) => (
    <g transform={`rotate(${rotate} 100 108)`}>
      <rect x="78" y="28" width="44" height="62" rx="7" fill="#05070d" stroke={hue} strokeOpacity={opacity} strokeWidth="2" />
      <circle cx="100" cy="52" r="9" fill={hue} opacity={opacity * 0.8} />
      <rect x="88" y="68" width="24" height="3.5" rx="1.75" fill={hue} opacity={opacity * 0.5} />
      <rect x="88" y="76" width="17" height="3.5" rx="1.75" fill={hue} opacity={opacity * 0.35} />
    </g>
  );
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      {card(-16, 0.45)}
      {card(16, 0.45)}
      {card(0, 1)}
    </svg>
  );
}

function VoxelMine({ hue }: { hue: string }) {
  const cube = (x: number, y: number, s: number, opacity: number) => (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={opacity}>
      <path d="M0 12 L20 0 L40 12 L20 24 Z" fill={hue} />
      <path d="M0 12 L20 24 L20 48 L0 36 Z" fill={hue} opacity="0.55" />
      <path d="M40 12 L20 24 L20 48 L40 36 Z" fill={hue} opacity="0.3" />
    </g>
  );
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      {cube(58, 46, 1.2, 1)}
      {cube(110, 62, 0.9, 0.6)}
      {cube(36, 74, 0.7, 0.4)}
    </svg>
  );
}

function Annals({ hue }: { hue: string }) {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <path d="M100 34 q-26 -10 -46 -2 v54 q20 -8 46 2 Z" fill={hue} opacity="0.28" />
      <path d="M100 34 q26 -10 46 -2 v54 q-20 -8 -46 2 Z" fill={hue} opacity="0.5" />
      <line x1="100" y1="34" x2="100" y2="88" stroke={hue} strokeOpacity="0.7" strokeWidth="2" />
      {[46, 56, 66].map((y) => (
        <line key={y} x1="64" y1={y} x2="90" y2={y - 3} stroke={hue} strokeOpacity="0.55" strokeWidth="2.4" strokeLinecap="round" />
      ))}
      <path d="M150 24 l10 -12 3 4 -9 12 Z" fill={hue} opacity="0.9" />
      <line x1="150" y1="24" x2="144" y2="32" stroke={hue} strokeWidth="2" opacity="0.6" />
    </svg>
  );
}

function CommitCanopy({ hue }: { hue: string }) {
  const bars = [22, 40, 12, 52, 30, 64, 24, 46, 18, 56];
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      {bars.map((h, i) => (
        <rect
          key={i}
          x={34 + i * 14}
          y={96 - h}
          width={10}
          height={h}
          rx={2.5}
          fill={hue}
          opacity={0.3 + (h / 64) * 0.65}
        />
      ))}
      <line x1="24" y1="100" x2="176" y2="100" stroke={hue} strokeOpacity="0.35" strokeWidth="2" />
    </svg>
  );
}

function GridTactics({ hue }: { hue: string }) {
  const tile = (col: number, row: number, opacity: number) => (
    <rect key={`${col}-${row}`} x={52 + col * 24} y={32 + row * 24} width={21} height={21} rx={4} stroke={hue} strokeOpacity={opacity} strokeWidth="1.6" fill="none" />
  );
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      {[0, 1, 2, 3].flatMap((col) => [0, 1, 2].map((row) => tile(col, row, 0.28)))}
      <rect x={54} y={58} width={17} height={17} rx={4} fill={hue} opacity="0.95" />
      <rect x={126} y={34} width={17} height={17} rx={4} fill={hue} opacity="0.4" />
      <path d="M76 64 h34 v-18 h6" stroke={hue} strokeWidth="2.2" strokeDasharray="4 4" fill="none" opacity="0.75" />
      <path d="M116 40 l6 6 -6 6" stroke={hue} strokeWidth="2.2" fill="none" opacity="0.75" />
    </svg>
  );
}

function LootShooter({ hue }: { hue: string }) {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <circle cx="100" cy="58" r="30" stroke={hue} strokeOpacity="0.8" strokeWidth="2.4" fill="none" />
      <circle cx="100" cy="58" r="4" fill={hue} />
      {[
        [100, 20, 100, 34],
        [100, 82, 100, 96],
        [62, 58, 76, 58],
        [124, 58, 138, 58],
      ].map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={hue} strokeWidth="2.4" opacity="0.8" strokeLinecap="round" />
      ))}
      <path d="M150 76 l8 -6 8 6 v10 l-8 6 -8 -6 Z" fill={hue} opacity="0.45" />
      <path d="M38 30 h16 M46 22 v16" stroke={hue} strokeWidth="2" opacity="0.35" strokeLinecap="round" />
    </svg>
  );
}

function MineDrop({ hue }: { hue: string }) {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      {[
        [52, 0.25],
        [92, 0.9],
        [132, 0.25],
      ].map(([x, opacity]) => (
        <rect key={x} x={x} y={56} width={34} height={34} rx={6} fill={hue} opacity={opacity as number} />
      ))}
      <line x1="109" y1="50" x2="109" y2="22" stroke={hue} strokeWidth="2.4" opacity="0.9" />
      <path d="M109 22 l16 6 -16 6 Z" fill={hue} />
      <circle cx="69" cy="73" r="4" fill={hue} opacity="0.6" />
      <circle cx="149" cy="73" r="4" fill={hue} opacity="0.6" />
    </svg>
  );
}

function SlingshotSiege({ hue }: { hue: string }) {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <path d="M40 96 v-22 m0 0 l-10 -14 m10 14 l10 -14" stroke={hue} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.9" />
      <path d="M42 62 q46 -46 106 4" stroke={hue} strokeWidth="2.2" strokeDasharray="1 8" strokeLinecap="round" fill="none" opacity="0.8" />
      {[
        [138, 82, 18, 14, 0.4],
        [158, 82, 18, 14, 0.4],
        [148, 66, 18, 14, 0.6],
      ].map(([x, y, w, h, opacity], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx={2.5} fill={hue} opacity={opacity as number} />
      ))}
      <circle cx="148" cy="58" r="5" fill={hue} />
    </svg>
  );
}

function SpeedCircuit({ hue }: { hue: string }) {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <path d="M48 88 q-16 -34 18 -42 q42 -10 62 8 q26 24 -12 32 q-40 8 -68 2 Z" stroke={hue} strokeWidth="10" strokeOpacity="0.22" fill="none" strokeLinejoin="round" />
      <path d="M48 88 q-16 -34 18 -42 q42 -10 62 8 q26 24 -12 32 q-40 8 -68 2 Z" stroke={hue} strokeWidth="2" strokeDasharray="7 7" strokeOpacity="0.8" fill="none" strokeLinejoin="round" />
      <circle cx="128" cy="52" r="6" fill={hue} />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={58 + i * 7} y={i % 2 === 0 ? 26 : 33} width={7} height={7} fill={hue} opacity={i % 2 === 0 ? 0.9 : 0.45} />
      ))}
    </svg>
  );
}

function SwarmSurvivor({ hue }: { hue: string }) {
  const swarm = [
    [48, 38, 3.4],
    [66, 24, 2.6],
    [96, 18, 3],
    [130, 26, 2.6],
    [152, 44, 3.4],
    [158, 72, 2.6],
    [138, 92, 3],
    [104, 100, 2.6],
    [68, 94, 3.2],
    [46, 70, 2.6],
  ];
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <circle cx="100" cy="60" r="8" fill={hue} />
      <circle cx="100" cy="60" r="17" stroke={hue} strokeOpacity="0.4" strokeWidth="2" fill="none" />
      {swarm.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={hue} opacity={0.3 + (i % 3) * 0.18} />
      ))}
    </svg>
  );
}

function TowerGuard({ hue }: { hue: string }) {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <path d="M20 92 q46 8 62 -18 q14 -24 52 -18 q28 4 46 -8" stroke={hue} strokeWidth="9" strokeOpacity="0.2" fill="none" strokeLinecap="round" />
      <path d="M20 92 q46 8 62 -18 q14 -24 52 -18 q28 4 46 -8" stroke={hue} strokeWidth="2" strokeDasharray="2 7" strokeOpacity="0.7" fill="none" strokeLinecap="round" />
      <rect x="88" y="26" width="22" height="26" rx="4" fill={hue} opacity="0.9" />
      <path d="M86 26 h26 M90 20 v6 M99 18 v8 M108 20 v6" stroke={hue} strokeWidth="2.6" strokeLinecap="round" opacity="0.9" />
      <circle cx="146" cy="52" r="4" fill={hue} opacity="0.55" />
      <circle cx="60" cy="82" r="4" fill={hue} opacity="0.55" />
    </svg>
  );
}

const ART: Record<string, (props: { hue: string }) => ReturnType<typeof BlockStacker>> = {
  annals: Annals,
  "block-stacker": BlockStacker,
  "commit-canopy": CommitCanopy,
  "grid-tactics": GridTactics,
  "loot-shooter": LootShooter,
  "maze-muncher": MazeMuncher,
  "mine-drop": MineDrop,
  "platform-hopper": PlatformHopper,
  "slingshot-siege": SlingshotSiege,
  "speed-circuit": SpeedCircuit,
  "spire-cards": SpireCards,
  "swarm-survivor": SwarmSurvivor,
  "tower-guard": TowerGuard,
  "voxel-mine": VoxelMine,
};

export function GameArt({ id, hue }: { id: string; hue: string }) {
  const Art = ART[id] ?? VoxelMine;
  return <Art hue={hue} />;
}
