import type { CSSProperties, ReactNode } from "react";

import { createWaveRunner } from "@jgengine/core/ai/waveRunner";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { ACCESSIBILITY_SETTING_IDS } from "@jgengine/core/settings/accessibilitySettings";
import { busMuteSettingId, MASTER_MUTE_SETTING_ID } from "@jgengine/shell/audio/busMix";
import { attachWaveFeedback } from "@jgengine/shell/audio/eventFeedback";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { useGame } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useSettingsStore } from "@jgengine/react/settings";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";
const DUMMY = "dummy";

// The demo declares no sounds at all: every reaction below is the engine's own default cue.
const runner = createWaveRunner({
  seed: 7,
  waves: [
    { budget: 20, duration: 12, entries: [{ id: "grunt", cost: 5 }] },
    { budget: 40, duration: 12, entries: [{ id: "grunt", cost: 5 }] },
    { budget: 60, duration: 12, entries: [{ id: "brute", cost: 10, minWave: 2 }] },
  ],
});

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "feel-audio" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#2f4f1e", "#8fbf4a"], seed: "feel-audio" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 6 }, role: "player" },
  [DUMMY]: { role: "npc" },
};

const game = defineGameDefinition({
  name: "feel-audio",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"], hit: ["Space"] },
});

function onInit(ctx: GameContext): void {
  ctx.game.commands.define("build", {
    validate: () => ({ reason: "no-gold", message: "Needs 40 more gold" }),
    apply: () => undefined,
  });
  // The runner's own boundary notification becomes the engine's wave cue - no game sound authored.
  attachWaveFeedback(runner, ctx.game.feedback);
}

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
  if (ctx.scene.entity.get(DUMMY) === null) ctx.scene.entity.spawn(DUMMY, { position: [2.4, 0, -1.2] });
}

let tick = 0;
function onTick(ctx: GameContext): void {
  runner.update(1 / 60, { alive: ctx.scene.entity.list().length });
  // A steady sparring beat so a captured frame has a real announced hit, not a mock.
  tick += 1;
  if (tick % 150 === 0) {
    ctx.game.events.emit("combat.damage", {
      target: DUMMY,
      source: ctx.player.userId,
      type: "kinetic",
      amount: 12,
      absorbed: 0,
      remaining: 88,
      lethal: false,
    });
  }
}

function damage(ctx: GameContext, target: string, amount: number): void {
  ctx.game.events.emit("combat.damage", {
    target,
    source: ctx.player.userId,
    type: "kinetic",
    amount,
    absorbed: 0,
    remaining: Math.max(0, 100 - amount),
    lethal: false,
  });
}

const hudButton: CSSProperties = {
  pointerEvents: "auto",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.3)",
  background: "rgba(17,22,30,0.85)",
  color: "#e2e8f0",
  fontSize: 13,
  fontWeight: 600,
  padding: "9px 12px",
  cursor: "pointer",
};

function FeelAudioUI(): ReactNode {
  const ctx = useGameContext();
  const { events, commands } = useGame();
  const store = useSettingsStore();
  const captionsOn = Boolean(store.get(ACCESSIBILITY_SETTING_IDS.captions, false));
  const sfxMuted = Boolean(store.get(busMuteSettingId("sfx"), false));

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="pointer-events-auto absolute bottom-4 left-4 flex max-w-[640px] flex-wrap gap-2 rounded-xl border border-white/10 bg-neutral-950/80 p-3">
        <button type="button" style={hudButton} onClick={() => damage(ctx, DUMMY, 18)}>
          Hit dummy
        </button>
        <button type="button" style={hudButton} onClick={() => damage(ctx, ctx.player.userId, 24)}>
          Hurt me
        </button>
        <button
          type="button"
          style={hudButton}
          onClick={() =>
            events.emit("entity.died", {
              instanceId: DUMMY,
              catalogId: "raider",
              displayName: "Raider",
              reason: { kind: "player_kill", killerUserId: ctx.player.userId },
              position: [2.4, 0, -1.2],
            })
          }
        >
          Kill dummy
        </button>
        <button
          type="button"
          style={hudButton}
          onClick={() => events.emit("worldItem.picked_up", { instanceId: "drop", userId: ctx.player.userId, itemId: "iron", rarity: "common", count: 2 })}
        >
          Pick up iron
        </button>
        <button type="button" style={hudButton} onClick={() => events.emit("quest.completed", { userId: ctx.player.userId, questId: "intro" })}>
          Complete objective
        </button>
        <button type="button" style={hudButton} onClick={() => void commands.run("build", {})}>
          Refused build
        </button>
        <button type="button" style={hudButton} onClick={() => runner.forceNextWave()}>
          Next wave
        </button>
        <button
          type="button"
          style={hudButton}
          onClick={() => store.set(ACCESSIBILITY_SETTING_IDS.captions, !captionsOn)}
        >
          Captions {captionsOn ? "on" : "off"}
        </button>
        <button type="button" style={hudButton} onClick={() => store.set(busMuteSettingId("sfx"), !sfxMuted)}>
          SFX {sfxMuted ? "muted" : "on"}
        </button>
        <button
          type="button"
          style={hudButton}
          onClick={() => store.set(MASTER_MUTE_SETTING_ID, !Boolean(store.get(MASTER_MUTE_SETTING_ID, false)))}
        >
          Mute all
        </button>
      </div>
    </div>
  );
}

/** Probe for the engine feel layer: default reactions to announced events, captions, buses and mute. */
export const feelAudioDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit, onNewPlayer, onTick, onReset: () => undefined, onDispose: () => undefined },
  GameUI: FeelAudioUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 22, initialHeight: 16, minDistance: 10, maxDistance: 48, targetHeight: 0, maxPolarAngle: 1.3 },
};
