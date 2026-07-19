import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createFloatingTextField, type FloatingTextView } from "@jgengine/core/ui/floatingText";
import { environment, grass, terrain } from "@jgengine/core/world/features";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";
import { WorldFloatingText } from "@jgengine/shell/vfx/WorldFloatingText";

const SCOUT = "scout";

const field = createFloatingTextField({ seed: "damage", defaultLifetime: 2.2, defaultRise: 2.4 });

// Per-kind art direction — a game colors/skins damage numbers however it likes.
const KIND_STYLE: Record<string, { color: string; scale?: number }> = {
  damage: { color: "#ffd27a" },
  crit: { color: "#ff5a3c", scale: 1.7 },
  heal: { color: "#7dffa8" },
  xp: { color: "#8ed2ff" },
  gold: { color: "#ffe066" },
  miss: { color: "#9aa0a6" },
};

function styleFor(view: FloatingTextView) {
  const style = KIND_STYLE[view.kind] ?? { color: "#ffffff" };
  return { color: style.color, fontStyle: view.kind === "miss" ? "italic" : "normal" };
}

let seeded = false;
function seed(): void {
  if (seeded) return;
  seeded = true;
  const POPS: readonly { at: number; kind: string; text: string; x: number; z: number }[] = [
    { at: 0.0, kind: "damage", text: "24", x: -2, z: 0 },
    { at: 0.25, kind: "damage", text: "31", x: 1.5, z: -1 },
    { at: 0.5, kind: "crit", text: "88!", x: 0, z: 1 },
    { at: 0.9, kind: "heal", text: "+40", x: 2.5, z: 0.5 },
    { at: 1.2, kind: "miss", text: "miss", x: -1.5, z: -1.5 },
    { at: 1.6, kind: "xp", text: "+120 XP", x: 0.5, z: 2 },
    { at: 2.0, kind: "gold", text: "+15g", x: -2.5, z: 1.5 },
  ];
  let elapsed = 0;
  const spawn = (i: number): void => {
    const pop = POPS[i];
    if (pop === undefined) {
      // Loop: refill so the demo always shows lively numbers.
      seeded = false;
      seed();
      return;
    }
    const delay = pop.at - elapsed;
    elapsed = pop.at;
    setTimeout(() => {
      field.emit({ position: [pop.x, 2.2, pop.z], text: pop.text, kind: pop.kind, size: KIND_STYLE[pop.kind]?.scale ?? 1 });
      spawn(i + 1);
    }, Math.max(0, delay * 1000) + 300);
  };
  spawn(0);
}

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 50, d: 50 }, height: 1.5, frequency: 0.03, seed: "floating" }),
  vegetation: grass({ area: { w: 44, d: 44 }, density: 3, colors: ["#2f4f1e", "#8fbf4a"], seed: "floating" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [SCOUT]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "floating-text",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(SCOUT, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
  seed();
}

function FloatingTextHud() {
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-white/15 bg-neutral-900/80 px-3 py-2 text-[11px] text-white/70">
        Floating combat text — world-anchored damage / crit / heal / XP / gold pops that rise, drift, and fade. One
        genre-agnostic field; the game skins each `kind`.
      </div>
    </div>
  );
}

export const floatingTextDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: FloatingTextHud,
  environment: () => (
    <>
      <EnvironmentScene feature={terrainFeature} />
      <WorldFloatingText field={field} styleFor={styleFor} fontSizePx={22} offsetY={-8} />
    </>
  ),
  camera: { initialDistance: 12, initialHeight: 6, minDistance: 6, maxDistance: 30, targetHeight: 2, maxPolarAngle: 1.4 },
};
