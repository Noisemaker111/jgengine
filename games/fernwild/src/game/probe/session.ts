import type { GameContext } from "@jgengine/core/runtime/gameContext";
import {
  menuPane,
} from "@jgengine/core/game/gameFlow";
import {
  gamePhase,
} from "@jgengine/core/game/gamePhase";
import {
  onboardingOf,
} from "@jgengine/core/onboarding/onboardingSystem";
import {
  authoredSpawnPosition,
} from "@jgengine/core/world/authoredSpawn";
import {
  editorLayers,
} from "../../editorLayers";
import {
  openScreen,
} from "../screens";
import type { ProbeFrame } from "./frame";
import { acrossSpawn } from "../spawn";

const SPAWN_AT = authoredSpawnPosition(editorLayers);

/** What proofs and flows read about session: its part of the capture probe. */
export function sessionProbe(ctx: GameContext, { me }: ProbeFrame) {
  const pointing = onboardingOf(ctx)?.pointing() ?? null;
  return {
    // The onboarding pointer: its bearing as a camera yaw and metres to it; 0 and -1 when it points nowhere.
    pointYaw: pointing === null || me === null ? 0 : Math.round(Math.atan2(pointing[0] - me.position[0], pointing[2] - me.position[2]) * 100) / 100,
    pointDist: pointing === null || me === null ? -1 : Math.round(Math.hypot(pointing[0] - me.position[0], pointing[2] - me.position[2]) * 10) / 10,
    // Steps of the survivor's path done, and engrams known: what the from-zero proof reads as taught and unlocked.
    taught: onboardingOf(ctx)?.run().snapshot().done.length ?? 0,
    x: Math.round((me?.position[0] ?? 0) * 10) / 10,
    z: Math.round((me?.position[2] ?? 0) * 10) / 10,
    yaw: Math.round((me?.rotationY ?? 0) * 100) / 100,
    screen: openScreen(ctx) === null ? 0 : 1,
    // The run's phase (0 title, 1 playing, 2 paused, 3 ended) and the menu's pane (0 its default, 1 controls, 2 settings, 3 credits).
    phase: ["menu", "playing", "paused", "ended"].indexOf(gamePhase(ctx)),
    menuPane: ["controls", "settings", "credits"].indexOf(menuPane(ctx) ?? "") + 1,
    // The game clock in seconds, to time a tame or a craft; the last tame's effectiveness in percent (-1 before any).
    clock: Math.round(ctx.time.now() * 10) / 10,
    // Metres the survivor stands right of where it woke, across the spawn facing.
    acrossSpawn: acrossSpawn(me?.position, SPAWN_AT),
    rain: Math.round(ctx.environment.sample(me?.position[0] ?? 0, me?.position[2] ?? 0).rain * 100),
    snow: Math.round(ctx.environment.sample(me?.position[0] ?? 0, me?.position[2] ?? 0).snow * 100),
  };
}
