/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView, RuneWorldAnchor, type RuneProjection } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { useGameStore } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { BUBBLE_RULE, session, type SpeechBubble } from "../session";
import { WORKER_HEIGHT } from "../models";
import { Text } from "./look";
import { BUILDING_MARKERS } from "../../editorLayers";

/**
 * Comic speech bubbles drawn by Rune over the street: a worker's voice line in a cream bubble, a
 * gadget's ping in an electric-blue one. They are UI, so they always draw over the world and never
 * behind a mesh. Each anchors to its speaker through the camera projection the scene shares
 * (`townProjection`), pops in, holds, and fades.
 */

/** The live world→screen projection, handed over by the scene (`world/WorldOverlay.tsx`). */
export const townProjection: { current: ((position: readonly [number, number, number]) => { x: number; y: number; behind: boolean }) | null } = { current: null };

/** At most this many gadget pings show at once; the newest win. */
const MAX_PINGS = 2;
const LIFT = { voice: WORKER_HEIGHT + 0.9, ping: 4 } as const;

/** A Rune projection over the shared camera: an entity resolves to where it stands now. */
export function townRuneProjection(ctx: GameContext): RuneProjection {
  return (target) => {
    const project = townProjection.current;
    const base = target.entity !== undefined ? ctx.scene.entity.get(target.entity)?.position : target.position;
    if (project === null || base === undefined) return { x: 0, y: 0, visible: false };
    const [dx, dy, dz] = target.offset ?? [0, 0, 0];
    const point = project([base[0] + dx, base[1] + dy, base[2] + dz]);
    return point.behind ? { x: 0, y: 0, visible: false } : { x: point.x, y: point.y, visible: true };
  };
}

function shownBubbles(now: number): SpeechBubble[] {
  const live = session.bubbles.filter((bubble) => now - bubble.born <= BUBBLE_RULE.seconds);
  const pings = live.filter((bubble) => bubble.kind === "ping").slice(-MAX_PINGS).map((bubble) => bubble.id);
  return live.filter((bubble) => bubble.kind === "voice" || pings.includes(bubble.id));
}

function Bubble({ bubble }: { bubble: SpeechBubble }) {
  const ctx = useGameContext();
  const voice = bubble.kind === "voice";
  const age = () => ctx.time.now() - bubble.born;
  const opacity = bind(() => Math.max(0, Math.min(1, age() / 0.12, (BUBBLE_RULE.seconds - age()) / 0.4)));
  return <RuneWorldAnchor entity={bubble.at} offset={[0, LIFT[bubble.kind], 0]}>
    <RuneView x={-24} y={-34} opacity={opacity} padding={voice ? [5, 10, 6, 10] : [3, 8, 4, 8]} radius={12} maxWidth={voice ? 230 : 180}
      fill={voice ? "#fff8ea" : "#3a8aff"} border={{ width: 2, color: voice ? "#2a2a34" : "#0f2a5a" }} shadow={{ y: 2, blur: 4, color: "#00000060" }}>
      <Text size={voice ? 14 : 12} weight={800} color={voice ? "#2a2a34" : "#ffffff"}>{bubble.text}</Text>
    </RuneView>
  </RuneWorldAnchor>;
}

/** Every bubble up right now, re-listed when one is said or expires. */
export function SpeechBubbles() {
  const ids = useGameStore((c) => shownBubbles(c.time.now()).map((bubble) => bubble.id).join(","));
  const ctx = useGameContext();
  if (ids === "") return null;
  return <>{shownBubbles(ctx.time.now()).map((bubble) => <Bubble key={bubble.id} bubble={bubble} />)}</>;
}

/** The town's landmarks named on painted signs over their roofs: the diner, the school, the library. */
export function LandmarkSigns() {
  return <>{BUILDING_MARKERS.filter((building) => building.sign !== null).map((building) =>
    <RuneWorldAnchor key={building.id} position={[building.xz[0], 0, building.xz[1]]} offset={[0, 7.2, 0]}>
      <RuneView x={-40} y={-14} padding={[2, 10, 3, 10]} radius={6} fill="#1f5c5a" border={{ width: 2, color: "#f6e7c1" }}>
        <Text family="Lilita One" size={13} color="#fff6e6" tracking={1}>{building.sign!}</Text>
      </RuneView>
    </RuneWorldAnchor>)}</>;
}
