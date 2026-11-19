import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { markersOfKind } from "@jgengine/core/world/authoredSpawn";

import { editorLayers } from "../editorLayers";

export const BODIES = [
  { id: "man-1", label: "Man 1", sex: "male", model: "quaternius-modular-men/Adventurer" },
  { id: "man-2", label: "Man 2", sex: "male", model: "quaternius-modular-men/Farmer" },
  { id: "woman-1", label: "Woman 1", sex: "female", model: "quaternius-modular-women/Adventurer" },
  { id: "woman-2", label: "Woman 2", sex: "female", model: "quaternius-modular-women/Hooded_Adventurer" },
] as const;

export type BodyId = (typeof BODIES)[number]["id"];

export const HEIGHT = { min: 0.9, max: 1.1 } as const;

export const NAME_LIMIT = 24;

export type RegionDifficulty = "Easy" | "Medium" | "Hard";

/** Metres from the south beach where Medium and then Hard begin. */
const MEDIUM_FROM = 1000;
const HARD_FROM = 2000;

export interface StartRegion {
  id: string;
  label: string;
  position: readonly [number, number, number];
  rotationY: number;
  difficulty: RegionDifficulty;
}

export const START_REGIONS: readonly StartRegion[] = (() => {
  const markers = markersOfKind(editorLayers, "player_spawn");
  const home = markers[0];
  return markers.map((marker, index) => {
    const metres = home === undefined ? 0 : Math.hypot(marker.position.x - home.position.x, marker.position.z - home.position.z);
    return {
      id: marker.id,
      label: marker.label ?? `Region ${index + 1}`,
      position: [marker.position.x, marker.position.y, marker.position.z] as const,
      rotationY: marker.rotationY ?? 0,
      difficulty: metres < MEDIUM_FROM ? "Easy" : metres < HARD_FROM ? "Medium" : "Hard",
    };
  });
})();

export interface SurvivorLook {
  name: string;
  body: BodyId;
  height: number;
  region: string;
}

export const DEFAULT_LOOK: SurvivorLook = { name: "Survivor", body: "man-1", height: 1, region: START_REGIONS[0]?.id ?? "player_spawn" };

const made = perContext((_ctx: GameContext): { look: SurvivorLook } => ({ look: { ...DEFAULT_LOOK } }));

export function survivorLook(ctx: GameContext): SurvivorLook {
  return made(ctx).look;
}

export function startRegion(id: string): StartRegion | undefined {
  return START_REGIONS.find((region) => region.id === id);
}

export type LookInput = Partial<Record<keyof SurvivorLook, unknown>>;

export function cleanLook(input: LookInput): SurvivorLook {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, NAME_LIMIT) : "";
  const height = typeof input.height === "number" && Number.isFinite(input.height) ? Math.min(HEIGHT.max, Math.max(HEIGHT.min, input.height)) : 1;
  return {
    name: name === "" ? DEFAULT_LOOK.name : name,
    body: BODIES.find((body) => body.id === input.body)?.id ?? DEFAULT_LOOK.body,
    height: Math.round(height * 100) / 100,
    region: START_REGIONS.find((region) => region.id === input.region)?.id ?? DEFAULT_LOOK.region,
  };
}

function showLook(ctx: GameContext, look: SurvivorLook): void {
  const id = ctx.player.userId;
  ctx.scene.entity.update(id, { look: look.body, size: look.height });
  const region = startRegion(look.region);
  if (region === undefined) return;
  const [x, , z] = region.position;
  ctx.scene.entity.setSpawnPose(id, { position: [x, ctx.world.groundHeightAt(x, z), z], rotationY: region.rotationY });
}

export function createSurvivor(ctx: GameContext, input: LookInput): SurvivorLook {
  const look = cleanLook(input);
  made(ctx).look = look;
  showLook(ctx, look);
  ctx.scene.entity.resetToSpawn(ctx.player.userId);
  const me = ctx.scene.entity.get(ctx.player.userId);
  if (me !== null) ctx.camera.turnTo(me.rotationY);
  ctx.touch();
  return look;
}

export function startArea(ctx: GameContext): { center: readonly [number, number]; radius: number; label: string } {
  const region = startRegion(survivorLook(ctx).region) ?? START_REGIONS[0];
  const [x, , z] = region?.position ?? [0, 0, 0];
  return { center: [x, z], radius: 260, label: "the beach" };
}

export function characterSave(ctx: GameContext) {
  return {
    key: "fernwild.character",
    snapshot: (): SurvivorLook => ({ ...survivorLook(ctx) }),
    hydrate: (data: LookInput) => {
      const look = cleanLook(data);
      made(ctx).look = look;
      showLook(ctx, look);
    },
  };
}

export function resetCharacter(ctx: GameContext): void {
  made(ctx).look = { ...DEFAULT_LOOK };
}
