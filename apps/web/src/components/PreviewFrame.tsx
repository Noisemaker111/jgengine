import type { ReactNode } from "react";
import type { Game } from "../content/games";
import { GameArt } from "./GameArt";

type PreviewVariant = "full" | "backdrop";

function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let s = seed === 0 ? 1 : seed;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

type Mood = "field" | "drift" | "table";

const CATEGORY_MOOD: Record<string, Mood> = {
  "Action & Arcade": "field",
  "Sandbox & Simulation": "field",
  "Strategy & Tactics": "table",
  Puzzle: "drift",
  Others: "drift",
};

function Particles({ hue, rand, count, maxY }: { hue: string; rand: () => number; count: number; maxY: number }) {
  const dots: ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const x = rand() * 320;
    const y = rand() * maxY;
    const r = 0.5 + rand() * 1.3;
    const o = 0.15 + rand() * 0.5;
    dots.push(<circle key={i} cx={x} cy={y} r={r} fill={i % 3 === 0 ? "#e2e8f0" : hue} opacity={o} />);
  }
  return <>{dots}</>;
}

function FloorGrid({ hue, horizon }: { hue: string; horizon: number }) {
  const rays: ReactNode[] = [];
  for (let i = -6; i <= 6; i++) {
    rays.push(
      <line key={`r${i}`} x1={160 + i * 8} y1={horizon} x2={160 + i * 68} y2={186} stroke={hue} strokeOpacity={0.14} strokeWidth={1} />,
    );
  }
  const rows = [6, 14, 26, 42, 62];
  for (const dy of rows) {
    rays.push(
      <line key={`h${dy}`} x1={0} y1={horizon + dy} x2={320} y2={horizon + dy} stroke={hue} strokeOpacity={0.12} strokeWidth={1} />,
    );
  }
  return (
    <>
      <line x1={0} y1={horizon} x2={320} y2={horizon} stroke={hue} strokeOpacity={0.35} strokeWidth={1.2} />
      {rays}
    </>
  );
}

function DriftBlobs({ hue, rand }: { hue: string; rand: () => number }) {
  const blobs: ReactNode[] = [];
  for (let i = 0; i < 4; i++) {
    const x = 30 + rand() * 260;
    const y = 20 + rand() * 130;
    const r = 26 + rand() * 44;
    blobs.push(<circle key={i} cx={x} cy={y} r={r} fill={hue} opacity={0.05 + rand() * 0.06} />);
  }
  return <>{blobs}</>;
}

function TableSheen({ hue }: { hue: string }) {
  return (
    <>
      <path d="M-20 128 L340 96 L340 190 L-20 190 Z" fill={hue} opacity={0.07} />
      <line x1={-20} y1={128} x2={340} y2={96} stroke={hue} strokeOpacity={0.3} strokeWidth={1.2} />
    </>
  );
}

function Backdrop({ game, seedSalt }: { game: Game; seedSalt: string }) {
  const rand = rng(seedOf(game.id + seedSalt));
  const mood = CATEGORY_MOOD[game.category] ?? "drift";
  const horizon = 96 + Math.floor(rand() * 22);
  const uid = `pf-${game.id}`;
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b1120" />
          <stop offset="55%" stopColor="#070b16" />
          <stop offset="100%" stopColor="#04060c" />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="50%" cy="110%" r="90%">
          <stop offset="0%" stopColor={game.hue} stopOpacity="0.34" />
          <stop offset="60%" stopColor={game.hue} stopOpacity="0.08" />
          <stop offset="100%" stopColor={game.hue} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-halo`} cx="50%" cy="30%" r="55%">
          <stop offset="0%" stopColor={game.hue} stopOpacity="0.16" />
          <stop offset="100%" stopColor={game.hue} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#${uid}-sky)`} />
      <rect width="320" height="180" fill={`url(#${uid}-glow)`} />
      <Particles hue={game.hue} rand={rand} count={26} maxY={mood === "table" ? 90 : horizon} />
      {mood === "field" && <FloorGrid hue={game.hue} horizon={horizon} />}
      {mood === "drift" && <DriftBlobs hue={game.hue} rand={rand} />}
      {mood === "table" && <TableSheen hue={game.hue} />}
      <rect width="320" height="180" fill={`url(#${uid}-halo)`} />
    </>
  );
}

function Motif({ game, dense }: { game: Game; dense: boolean }) {
  const scale = dense ? 1.4 : 1.02;
  const x = 160 - 100 * scale;
  const y = dense ? 90 - 60 * scale + 8 : 4;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={dense ? 1 : 0.92}>
      <svg width="200" height="120" viewBox="0 0 200 120" overflow="visible">
        <GameArt id={game.id} hue={game.hue} genre={game.genre} category={game.category} />
      </svg>
    </g>
  );
}

function MenuChrome({ game }: { game: Game }) {
  const title = game.title.toUpperCase();
  const subtitle = game.preview?.subtitle ?? game.tagline;
  const titleSize = Math.min(21, 288 / Math.max(1, title.length * 0.66));
  const uid = `pf-${game.id}`;
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-scrim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#04060c" stopOpacity="0" />
          <stop offset="45%" stopColor="#04060c" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#04060c" stopOpacity="0.92" />
        </linearGradient>
      </defs>
      <rect x="0" y="86" width="320" height="94" fill={`url(#${uid}-scrim)`} />
      <text
        x="160"
        y="126"
        textAnchor="middle"
        fill="#f8fafc"
        fontSize={titleSize}
        fontWeight="800"
        letterSpacing="1.5"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        style={{ paintOrder: "stroke" }}
        stroke={`${game.hue}33`}
        strokeWidth="3"
      >
        {title}
      </text>
      <line x1="118" y1="134" x2="150" y2="134" stroke={game.hue} strokeOpacity="0.6" strokeWidth="1" />
      <line x1="170" y1="134" x2="202" y2="134" stroke={game.hue} strokeOpacity="0.6" strokeWidth="1" />
      <circle cx="160" cy="134" r="1.6" fill={game.hue} opacity="0.9" />
      <text
        x="160"
        y="145"
        textAnchor="middle"
        fill="#cbd5e1"
        fontSize="7"
        letterSpacing="0.6"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        opacity="0.85"
      >
        {subtitle.length > 58 ? `${subtitle.slice(0, 55)}…` : subtitle}
      </text>
      <g>
        <rect x="124" y="153" width="72" height="17" rx="8.5" fill={game.hue} opacity="0.95" />
        <rect x="124" y="153" width="72" height="17" rx="8.5" fill="none" stroke="#ffffff" strokeOpacity="0.25" />
        <path d="M139 157.7 v7.6 L146 161.5 Z" fill="#04060c" />
        <text
          x="166"
          y="164.4"
          textAnchor="middle"
          fill="#04060c"
          fontSize="7.5"
          fontWeight="800"
          letterSpacing="2.4"
          fontFamily="ui-monospace, monospace"
        >
          PLAY
        </text>
      </g>
    </>
  );
}

function HudChrome({ game }: { game: Game }) {
  const rand = rng(seedOf(`${game.id}:hud`));
  const score = String(Math.floor(rand() * 90000) + 1200).padStart(6, "0");
  const meter = 0.45 + rand() * 0.45;
  return (
    <>
      <text
        x="12"
        y="18"
        fill={game.hue}
        fontSize="8.5"
        fontWeight="700"
        letterSpacing="1.6"
        fontFamily="ui-monospace, monospace"
        opacity="0.9"
      >
        {`SCORE ${score}`}
      </text>
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M${294 - i * 13} 12 a3 3 0 0 1 5 2.2 q0 3 -5 5.8 q-5 -2.8 -5 -5.8 a3 3 0 0 1 5 -2.2Z`}
          fill={game.hue}
          opacity={i === 2 ? 0.3 : 0.9}
        />
      ))}
      <rect x="12" y="166" width="90" height="4" rx="2" fill="#ffffff" opacity="0.12" />
      <rect x="12" y="166" width={90 * meter} height="4" rx="2" fill={game.hue} opacity="0.85" />
      <text
        x="308"
        y="171"
        textAnchor="end"
        fill="#94a3b8"
        fontSize="6.5"
        letterSpacing="1.2"
        fontFamily="ui-monospace, monospace"
        opacity="0.7"
      >
        {game.genre.toUpperCase().slice(0, 26)}
      </text>
    </>
  );
}

export function PreviewFrame({ game, variant = "full", className = "" }: { game: Game; variant?: PreviewVariant; className?: string }) {
  const kind = game.preview?.kind ?? "menu";
  const dense = kind === "first-frame" || variant === "backdrop";
  return (
    <svg
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      className={`h-full w-full ${className}`}
      role="img"
      aria-label={`${game.title} preview`}
    >
      <Backdrop game={game} seedSalt={dense ? ":frame" : ":menu"} />
      <Motif game={game} dense={dense} />
      {variant === "full" && (kind === "menu" ? <MenuChrome game={game} /> : <HudChrome game={game} />)}
    </svg>
  );
}
