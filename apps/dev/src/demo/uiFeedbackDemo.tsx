import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { useGame, useGameStoreValue } from "@jgengine/react/hooks";
import { useUiCue } from "@jgengine/react/uiCues";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const SCOUT = "scout";
const GOLD = "gold";
const POST_COST = 50;

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "ui-feedback" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#2f4f1e", "#8fbf4a"], seed: "ui-feedback" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [SCOUT]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "ui-feedback",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: {
    moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"],
    build: ["Digit1"], mine: ["Digit2"], wave: ["Digit3"],
  },
});

const gold = (ctx: GameContext): number => (ctx.game.store.get(GOLD) as number | undefined) ?? 0;

function onInit(ctx: GameContext): void {
  ctx.game.store.set(GOLD, 20);
  // Commands only write `validate`; the shell shows `message` with the deny cue and stacks repeats.
  ctx.game.commands.define("build", {
    validate: (state) => {
      const short = POST_COST - gold(state);
      return short > 0 ? { reason: "insufficient-gold", message: `Archer post needs ${short} more gold` } : null;
    },
    apply: (state) => {
      state.game.store.set(GOLD, gold(state) - POST_COST);
      state.game.notices.push({ text: "Archer post built", tone: "success" });
    },
  });
  ctx.game.commands.define("mine", {
    apply: (state) => {
      state.game.store.set(GOLD, gold(state) + 15);
      state.game.notices.push({ text: "+15 gold", tone: "info", key: "mined" });
    },
  });
  ctx.game.commands.define("wave", {
    validate: () => ({ reason: "wave-not-ready", message: "Place a tower before releasing the wave" }),
    apply: () => undefined,
  });
}

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(SCOUT, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

function DemoButton({ label, onClick }: { label: string; onClick: () => void }) {
  const cue = useUiCue();
  return (
    <button
      type="button"
      onPointerEnter={() => cue("hover")}
      onClick={() => {
        cue("click");
        onClick();
      }}
      className="rounded-lg border border-white/15 bg-neutral-900/85 px-3 py-2 text-[13px] font-semibold text-white/85 hover:border-white/35 hover:text-white"
    >
      {label}
    </button>
  );
}

function FeedbackUI() {
  const { commands } = useGame();
  const coins = useGameStoreValue<number>(GOLD, 0);
  const cue = useUiCue();
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="pointer-events-auto absolute bottom-4 left-4 flex flex-col gap-2 rounded-xl border border-white/10 bg-neutral-950/80 p-3">
        <div className="text-[13px] font-semibold text-amber-200">Gold {coins}</div>
        <div className="flex flex-wrap gap-2">
          <DemoButton label={`Build post (1) · ${POST_COST}g`} onClick={() => void commands.run("build", {})} />
          <DemoButton label="Mine (2)" onClick={() => void commands.run("mine", {})} />
          <DemoButton label="Release wave (3)" onClick={() => void commands.run("wave", {})} />
          <DemoButton label="Open panel" onClick={() => cue("open")} />
        </div>
      </div>
    </div>
  );
}

/** Probe for engine UI feedback: refusal messages, the shared notice feed, and UI cues. */
export const uiFeedbackDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: FeedbackUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
