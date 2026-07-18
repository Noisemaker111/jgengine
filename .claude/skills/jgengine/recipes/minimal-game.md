# Recipe — minimal game (scaffold → authored scene → win)

**What this wires:** the default end-to-end path from nothing to a complete, genre-free
walk/interact/win game: a scaffold, one `defineGame` config off the happy-path kit, an
authored scene edited in the browser, one system, one store slot, an empty-canvas HUD,
and a win condition. Every new game starts here; add combat, multiplayer, or deeper
world features only after this loop plays.

## 1. Scaffold

`npx jgengine create <name>` (inside the engine monorepo: `bun run new:game "<id-or-title>"`).
The file set is thin and already runs:

- `src/main.tsx` — mounts `GameHost` with `editor={() => import("@jgengine/editor")}`; the
  host owns the F2+E / `?mode=editor` editor summon and the dev save endpoint.
- `src/game.config.ts` — the whole game definition (below).
- `src/editor.scene.json` + `src/editorLayers.ts` — the authored scene document, normalized
  with `normalizeEditorLayers`. All placement lives here, never as coordinates in code.
- `src/loop.ts` and `src/game/ui/GameUI.tsx` — systems and HUD.

## 2. Define the game — one import surface

```ts
// game.config.ts — everything below comes from the kit; deeper paths are for outgrowing it.
import { defineGame } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";
import { GameUI } from "./game/ui/GameUI";
import { onNewPlayer, systems } from "./loop";

export const game = defineGame({
  name: "my-game",
  // Binding movement actions makes the shell drive the walk controller — the game walks day one.
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"], interact: ["KeyE"] },
  systems,
  loop: { onNewPlayer },
  GameUI,
  editorLayers, // the authored scene auto-mounts; the player spawns at its player_spawn marker
});
// Solo game: omit `multiplayer` entirely — offline is the shell default.
```

```ts
// loop.ts — one store slot for run state, one system for the rules tick.
import { defineStore, defineSystem, authoredSpawnPosition, type GameContext } from "@jgengine/shell/gameKit";

import { editorLayers } from "./editorLayers";

export const run = defineStore("run", { collected: 0, won: false });

export const systems = [
  defineSystem({
    id: "rules",
    tick: { type: "fixed" },
    update(ctx: GameContext) {
      // System-check win alternative: read/update `run` here (e.g. win at collected >= 3).
      if (run.read(ctx).collected >= 3) run.update(ctx, (s) => ({ ...s, won: true }));
    },
  }),
];

export function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn("player", { id: ctx.player.userId, position: authoredSpawnPosition(editorLayers) ?? [0, 0, 0] });
}
```

`GameUI` stays an empty `HudCanvas` (`useHudLayout` + `HudCanvas` from the kit); drop
self-styled widgets (`StatBar`, `Hotbar`, `Coins`) into `HudPanel` slots as the game needs them.

## 3. Author, play, win

1. `bun dev`, then F2+E opens the editor on `editor.scene.json` — move the spawn, place
   props and trigger markers, Ctrl+S saves back to the document.
2. The starter scene ships a goal marker with `{ on: "enter", action: "win" }` — walking
   into it wins with zero game code. Author more rules the same way (triggers in the
   editor), or read volumes yourself via the kit's `collectAuthoredTriggers(editorLayers)`.
3. Prove it: `bun test` asserts the document (spawn, goal), and `jgengine-verify` covers
   screenshot and gameplay evidence before any "it works" claim.
