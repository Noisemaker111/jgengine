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

const ART: Record<string, (props: { hue: string }) => ReturnType<typeof BlockStacker>> = {
  "block-stacker": BlockStacker,
  "maze-muncher": MazeMuncher,
  "platform-hopper": PlatformHopper,
  "spire-cards": SpireCards,
  "voxel-mine": VoxelMine,
};

export function GameArt({ id, hue }: { id: string; hue: string }) {
  const Art = ART[id] ?? VoxelMine;
  return <Art hue={hue} />;
}
