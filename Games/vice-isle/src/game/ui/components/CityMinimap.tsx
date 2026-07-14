import { useGameStore, usePlayer } from "@jgengine/react/hooks";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import {
  clampToMinimapEdge,
  headingToBearing,
  projectToMinimap,
  type MinimapView,
} from "@jgengine/core/world/minimap";
import {
  BRIEFCASE_POS,
  DOCK_FIGHT_CENTER,
  GARAGE_POS,
  KINGPIN_POS,
  MARCO_POS,
  RACE_CHECKPOINTS,
  ROADS,
  districtAt,
} from "../../world/districts";
import { raceStore, wantedStore } from "../../handroll";

const SIZE = 176;
const RADIUS = 130;

interface MapSnapshot {
  player: readonly [number, number, number];
  heading: number;
  cops: readonly (readonly [number, number])[];
  activeQuest: string | null;
  stars: number;
  raceCheckpoint: number | null;
}

function readMap(ctx: GameContext): MapSnapshot | null {
  const player = ctx.scene.entity.get(ctx.player.userId);
  if (player === null) return null;
  const cops = ctx.scene.entity
    .list()
    .filter((e) => e.name.startsWith("cop_"))
    .map((e) => [e.position[0], e.position[2]] as const);
  const quests = ctx.game.quest!.list(ctx.player.userId);
  const active = quests.find((q) => q.status === "active");
  const wanted = wantedStore.read(ctx);
  const race = raceStore.read(ctx);
  return {
    player: player.position,
    heading: player.rotationY,
    cops,
    activeQuest: active?.questId ?? null,
    stars: wanted?.stars ?? 0,
    raceCheckpoint: race !== undefined && race.active ? race.checkpoint : null,
  };
}

const QUEST_TARGETS: Record<string, readonly [number, number]> = {
  m1_welcome: [MARCO_POS[0], MARCO_POS[2]],
  m2_dock_sweep: [DOCK_FIGHT_CENTER[0], DOCK_FIGHT_CENTER[2]],
  m3_the_ledger: [BRIEFCASE_POS[0], BRIEFCASE_POS[2]],
  m5_ocean_loop: [GARAGE_POS[0], GARAGE_POS[2]],
  m6_hot_wheels: [74, -236],
  m7_carmine_convoy: [DOCK_FIGHT_CENTER[0], DOCK_FIGHT_CENTER[2]],
  m8_kingpin: [KINGPIN_POS[0], KINGPIN_POS[2]],
};

export function CityMinimap() {
  usePlayer();
  const snapshot = useGameStore(readMap);
  if (snapshot === null) return null;
  const view: MinimapView = {
    center: [snapshot.player[0], snapshot.player[2]],
    worldRadius: RADIUS,
    size: SIZE,
    rotate: headingToBearing(snapshot.heading),
  };
  const target =
    snapshot.raceCheckpoint !== null
      ? RACE_CHECKPOINTS[Math.min(snapshot.raceCheckpoint, RACE_CHECKPOINTS.length - 1)]
      : snapshot.activeQuest !== null
        ? QUEST_TARGETS[snapshot.activeQuest]
        : undefined;
  const district = districtAt(snapshot.player[0], snapshot.player[2]);

  return (
    <div className="flex flex-col items-start gap-1">
      <div
        className="relative overflow-hidden rounded-sm border-2 border-black bg-[#0e2431] shadow-[4px_4px_0_#000]"
        style={{ width: SIZE, height: SIZE }}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <rect width={SIZE} height={SIZE} fill="#123244" />
          {ROADS.map((seg, i) => {
            const a = projectToMinimap(seg.from, view);
            const b = projectToMinimap(seg.to, view);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#dfe6ee" strokeWidth={4} strokeOpacity={0.75} strokeLinecap="round" />;
          })}
          {snapshot.cops.map((cop, i) => {
            const proj = clampToMinimapEdge(projectToMinimap(cop, view), SIZE);
            return <circle key={`cop-${i}`} cx={proj.x} cy={proj.y} r={4} fill="#4f7de8" stroke="#000" strokeWidth={1} />;
          })}
          {target !== undefined ? (
            (() => {
              const proj = clampToMinimapEdge(projectToMinimap(target, view), SIZE);
              return <circle cx={proj.x} cy={proj.y} r={5.5} fill="#ffb020" stroke="#000" strokeWidth={1.5} />;
            })()
          ) : null}
          <polygon
            points={`${SIZE / 2},${SIZE / 2 - 9} ${SIZE / 2 - 6},${SIZE / 2 + 6} ${SIZE / 2},${SIZE / 2 + 3} ${SIZE / 2 + 6},${SIZE / 2 + 6}`}
            fill="#f2599b"
            stroke="#000"
            strokeWidth={1.5}
          />
        </svg>
        <div className="absolute right-1 top-0.5 text-[10px] font-black text-white/70">N</div>
      </div>
      <div className="-skew-x-6 border-2 border-black bg-[#f2599b] px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-black">
        {district?.label ?? "Vice Isle"}
      </div>
    </div>
  );
}
