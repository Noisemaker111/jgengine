/**
 * **Start here for game code.** The sole happy-path import surface for a whole simple game:
 * authoring (`defineGame`), mounting (`GameHost`), serializable state (`defineStore`), behavior
 * (`defineSystem`), authored-scene helpers, HUD building blocks, and deterministic randomness.
 * Reach for deep package paths only when a game outgrows the kit. Do not start from
 * `@jgengine/core/authoring` — that module is a core-side helper barrel, not the game entrypoint.
 *
 * @capability game-kit one-stop happy-path import surface for authoring, mounting, state, systems, authored scenes, and HUD
 */

// Authoring + mounting — the one public path from config to a running game.
export { defineGame, type GameConfig } from "./defineGame";
export { GameHost, type GameHostProps, type EditorSummonModule } from "./GameHost";
export type { PlayableGame } from "./registry";

// Serializable state + composable behavior.
export { defineStore, type StoreHandle } from "@jgengine/core/store/defineStore";
export { defineKeyedStore } from "@jgengine/core/store/defineKeyedStore";
export { defineSystem, type SystemDefinition } from "@jgengine/core/game/defineSystem";
export type { GameContext } from "@jgengine/core/runtime/gameContext";
export type { GameLoop } from "@jgengine/core/game/defineGame";

// Authored scene document — normalize `editor.scene.json`, read spawns and trigger volumes.
export { normalizeEditorLayers } from "@jgengine/core/editor/document";
export type { EditorDocument, EditorCatalogDefinition } from "@jgengine/core/editor/types";
export { authoredSpawnPosition } from "@jgengine/core/world/authoredSpawn";
export { collectAuthoredTriggers } from "@jgengine/core/scene/authoredTriggers";
export { environmentContentFromDocument } from "@jgengine/core/editor/environment";

// World + camera.
export { environment } from "@jgengine/core/world/features";
export { grounded } from "@jgengine/core/world/grounded";
export type { GameCameraConfig } from "@jgengine/core/game/playableGame";
export { DEFAULT_WALK_CODES } from "./shellMovement";

// HUD layout + drop-in building blocks — compose these, reskin with HudTheme; games own layout/terminology/art direction.
export { HudCanvas, HudPanel, useHudLayout } from "@jgengine/react/hudLayout";
export { StatBar, Hotbar, Clock, Coins } from "@jgengine/react/hud";

// Deterministic randomness (inject seeds; never Math.random in game logic).
export { seededRng } from "@jgengine/core/random/rng";

// Multiplayer story: omit `multiplayer` entirely for solo — offline is the shell default.
export { offline } from "@jgengine/core/runtime/adapter";
