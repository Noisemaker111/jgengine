import { useSyncExternalStore } from "react";

import { COLLISION_DEBUG_LAYERS, collisionDebug, type CollisionDebugLayer } from "./collisionDebug";

const LAYER_LABELS: Record<CollisionDebugLayer, string> = {
  hitboxes: "Damage hitboxes",
  bodies: "Physical bodies",
  projectiles: "Projectile paths",
  muzzles: "Muzzle / shot origins",
  aimLaser: "Aim laser (authoritative)",
};

export function ColPanel() {
  const state = useSyncExternalStore(
    collisionDebug.subscribe,
    () => collisionDebug.getState(),
    () => collisionDebug.getState(),
  );
  return (
    <div className="space-y-2">
      <div className="text-[10px] text-neutral-500">
        F2+D world collision debugger · layers stay on when panel closes · zero cost when all off
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          className="rounded-md bg-white/[0.04] px-2 py-0.5 text-neutral-300 ring-1 ring-inset ring-white/[0.08] transition-colors hover:bg-white/10"
          onClick={() => collisionDebug.setAllLayers(true)}
        >
          All on
        </button>
        <button
          type="button"
          className="rounded-md bg-white/[0.04] px-2 py-0.5 text-neutral-300 ring-1 ring-inset ring-white/[0.08] transition-colors hover:bg-white/10"
          onClick={() => collisionDebug.setAllLayers(false)}
        >
          All off
        </button>
      </div>
      <div className="space-y-1">
        {COLLISION_DEBUG_LAYERS.map((layer) => (
          <label key={layer} className="flex cursor-pointer items-center gap-2 text-neutral-200">
            <input
              type="checkbox"
              checked={state.layers[layer]}
              onChange={(event) => collisionDebug.setLayer(layer, event.target.checked)}
            />
            <span>{LAYER_LABELS[layer]}</span>
          </label>
        ))}
      </div>
      <div className="border-t border-neutral-800 pt-1.5 font-mono text-[9px] text-neutral-500">
        hitbox pink · body cyan · muzzle red · laser lime · X damage · ○ solid · · miss
      </div>
    </div>
  );
}
