import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { roadSource, WET_ROAD } from "./cityLayout";

/** Hours (game clock) the city's lamps are lit and its asphalt shines: dusk to just before dawn. */
const LAMPS_ON = 19;
const LAMPS_OFF = 5.5;

/** Whether the game clock is in the night the art direction lights with sodium and neon. */
export function isNightHour(hour: number): boolean {
  return hour >= LAMPS_ON || hour < LAMPS_OFF;
}

interface NightState {
  lamps: (readonly [number, number])[];
  pools: string[];
  lit: boolean;
}

const nightStore = perContext((): NightState => ({ lamps: [], pools: [], lit: false }));

function clearPools(ctx: GameContext): void {
  const night = nightStore(ctx);
  for (const id of night.pools) ctx.scene.object.remove(id);
  night.pools = [];
}

function lightPools(ctx: GameContext): void {
  const night = nightStore(ctx);
  clearPools(ctx);
  for (const [x, z] of night.lamps) {
    const id = ctx.scene.object.place("obj_lamp_pool", x, ctx.world.groundHeightAt(x, z) + 0.26, z);
    ctx.scene.object.setColliders(id, {});
    night.pools.push(id);
  }
}

/** The streetlamps the city laid, so each throws a pool of light once it is dark; a re-lay replaces them. */
export function setLampSpots(ctx: GameContext, spots: readonly (readonly [number, number])[]): void {
  const night = nightStore(ctx);
  night.lamps = [...spots];
  night.pools = [];
  if (night.lit) lightPools(ctx);
}

/** Wet the roads and light the lamp pools after dark, and put both away at dawn; one swap per change, never per frame. */
export function tickNightLook(ctx: GameContext): void {
  const night = nightStore(ctx);
  const dark = isNightHour(ctx.time.calendar().hour);
  if (dark === night.lit) return;
  night.lit = dark;
  roadSource.setSurface(dark ? WET_ROAD : undefined);
  if (dark) lightPools(ctx);
  else clearPools(ctx);
}
