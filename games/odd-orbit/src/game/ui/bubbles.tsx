/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useState, useSyncExternalStore } from "@jgengine/core/ui/jsx";
import { RuneView, RuneWorldAnchor, type RuneProjection } from "@jgengine/core/ui/rune/primitives.view";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { BUBBLE_MS, bubbles, type Bubble } from "../boarding/feeds";
import { Text, RIM, INK } from "./kit";

/**
 * Speech bubbles over the tenants: whatever a tenant just said in the feed also floats above their
 * head for a few seconds, cream when content and coral when grumbling. They are Rune UI anchored
 * through the camera projection the world scene hands over, so they never hide behind a module.
 */

/** The live world→screen projection, handed over by the world overlay each mount. */
export const houseProjection: { current: ((position: readonly [number, number, number]) => { x: number; y: number; behind: boolean }) | null } = { current: null };

/** A Rune projection over the shared camera: an entity resolves to where it stands now. */
export function houseRuneProjection(ctx: GameContext): RuneProjection {
  return (target) => {
    const project = houseProjection.current;
    const base = target.entity !== undefined ? ctx.scene.entity.get(target.entity)?.position : target.position;
    if (project === null || base === undefined) return { x: 0, y: 0, visible: false };
    const [dx, dy, dz] = target.offset ?? [0, 0, 0];
    const point = project([base[0] + dx, base[1] + dy, base[2] + dz]);
    return point.behind ? { x: 0, y: 0, visible: false } : { x: point.x, y: point.y, visible: true };
  };
}

function BubbleCard({ bubble }: { bubble: Bubble }) {
  return <RuneWorldAnchor entity={bubble.tenantId} offset={[0, 2.6, 0]}>
    <RuneView pin={[0, 0, null, null]} x={-110} y={-58} width={220} fill={bubble.tone === "happy" ? "#fff6e4" : "#ffd6cf"} radius={14}
      border={{ width: 2, color: RIM }} padding={[6, 10, 6, 10]} shadow={{ y: 3, blur: 8, color: "#170d2855" }} label="Speech bubble">
      <Text size={12} color={INK}>{bubble.text}</Text>
    </RuneView>
  </RuneWorldAnchor>;
}

/** The live bubbles, pruned on a timer so an expired line leaves without waiting for a new one. */
export function SpeechBubbles() {
  const live = useSyncExternalStore(bubbles.subscribe, bubbles.read, bubbles.read);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (live.length === 0) return;
    const next = Math.min(...live.map((bubble) => bubble.born + BUBBLE_MS));
    const timer = setTimeout(() => setNow(Date.now()), Math.max(50, next - Date.now()));
    return () => clearTimeout(timer);
  }, [live, now]);
  return <>{live.filter((bubble) => Date.now() - bubble.born < BUBBLE_MS).map((bubble) => <BubbleCard key={bubble.id} bubble={bubble} />)}</>;
}
