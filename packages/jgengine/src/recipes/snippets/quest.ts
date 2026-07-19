import { defineGame, defineSystem } from "@jgengine/shell/gameKit";

// The joint: installing a system with `feature: "quest"` turns on `ctx.game.quest`
// (a journal) — no separate features flag. Register quests in `create`, then gameplay
// nudges per-objective progress; the journal is the single source the HUD reads.
const quests = defineSystem({
  id: "quests",
  feature: "quest",
  create(ctx) {
    ctx.game.quest?.register([
      {
        id: "clear-cave",
        title: "Clear the Cave",
        objectives: [{ id: "goblins", kind: "kill", target: "goblin", count: 10 }],
      },
    ]);
    ctx.game.quest?.accept(ctx.player.userId, "clear-cave");
  },
});

export const game = defineGame({ name: "Quest", systems: [quests] });
// advance from gameplay: ctx.game.quest?.progress(userId, "clear-cave", "goblins", 1)
// <GameHost playable={game} />  ·  read ctx.game.quest?.list(userId) for the HUD quest log
