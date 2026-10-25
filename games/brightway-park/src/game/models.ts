import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { assets } from "./assets";
import { BUILDABLES, BUILD_IDS } from "./objects/catalog";
import { GUEST_KINDS } from "./entities/guests/catalog";

// Original geometry uses world units and a deliberately authored ground origin.
const original = (id: string): ModelConfig => ({
  url: new URL(`../../public/art/models/${id}.glb`, import.meta.url).href,
  scale: 1,
  anchor: "origin",
});

/** A model from the engine's asset library, grounded and scaled to the height the catalog asks for. */
function library(id: string, height: number | undefined): ModelConfig {
  const ref = assets.resolve(id);
  if (ref === null) throw new Error(`brightway-park: the asset library has no "${id}"`);
  return { url: ref.url, ...(ref.dims === undefined ? {} : { dims: ref.dims }), anchor: "center", ...(height === undefined ? {} : { targetHeight: height }) };
}

/** Kinds that share another kind's authored mesh. */
const AUTHORED_AS: Record<string, string> = { staff_mechanic: "staff_janitor", staff_entertainer: "staff_janitor", staff_security: "staff_janitor" };

function objectModel(id: string): ModelConfig {
  const def = BUILDABLES[id]!;
  if (def.libraryModel !== undefined) return library(def.libraryModel.id, def.libraryModel.height);
  const shared = AUTHORED_AS[id];
  if (shared !== undefined) return { ...original(shared), material: { color: def.color } };
  return original(id);
}

export const objectModels = Object.fromEntries(BUILD_IDS.map((id) => [id, objectModel(id)]));
// Guests never animate, so a batch reproduces them exactly at any distance: every visitor draws from
// one instance buffer per guest kind instead of one model each. The engine's default capacity (128 a
// kind, against a guest cap of 34-90) keeps the rest on their own models rather than dropping them.
const guest = (id: string): ModelConfig => ({
  ...original(id),
  lod: { crowdDistance: 0 },
});
export const entityModels = {
  ...Object.fromEntries(GUEST_KINDS.map(id => [id, guest(id)])),
  // Hired staff walk in their own uniforms.
  crew_handyman: original("staff_handyman"),
  crew_mechanic: original("staff_mechanic"),
  crew_entertainer: original("staff_entertainer"),
  crew_security: original("staff_security"),
};
