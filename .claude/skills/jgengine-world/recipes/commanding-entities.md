# Recipe — commanding entities (select → order → tick → resolve)

**What this wires:** direct command over a group of entities — pick some, issue
intent, watch them carry it out and interact on arrival. This is a *composition*,
not a genre. The exact same wiring is the command layer of a base-defense wave, a
squad-tactics turn, a creature-herding puzzle, or the topdown-survival phase of a
game that was a card game a minute ago. You swap content, camera, and
win-condition — never this architecture.

It composes four primitives across three seams. The engine never touches your
entity store directly; you supply narrow adapters, so the same command loop runs
over any movement/combat model.

## The seams

- **Pick → ids.** `createSelectionSet` is an ordered, de-duplicated set of entity
  ids. What *fills* it is up to you — a pointer marquee, a card that names a lane,
  an ability that grabs everything in a radius, an AI planner. Selection is just
  ids; it does not know or care how they were chosen.
- **Intent → per-entity queue.** Build one shared `createOrderRegistry` and give
  each commandable entity its own `createOrderQueue`. Register verbs as *data*
  (`defineMoveOrder`, `defineAttackMoveOrder`, `defineTargetedOrder`, or your
  own). Every verb composes over two adapters **you** implement against your
  entity store: `OrderMover` (`position` / `moveToward` / `halt`) and
  `OrderTargeting` (`acquire` / `positionOf`). This adapter boundary is what makes
  the loop genre-free.
- **Resolve → your effect.** In `onTick`, advance each queue. Engagement verbs
  write `{ engaging, inRange }` into `order.state`; you read that flag and resolve
  the actual interaction your way — damage, harvest, repair, heal, dialogue —
  through the combat seam `ctx.scene.entity.effect(...)`. Orders decide *when*;
  the game decides *what*.

## Connected wiring

```ts
import { createSelectionSet } from "@jgengine/core/scene/selection";
import {
  createOrderRegistry,
  createOrderQueue,
  defineMoveOrder,
  defineAttackMoveOrder,
  defineTargetedOrder,
} from "@jgengine/core/world";

// --- once, at setup -------------------------------------------------------

// Adapters bind orders to YOUR entity store — the only game-specific glue.
const mover = {
  position: (id) => entities.get(id).pos,
  moveToward: (id, to, dt) => stepToward(entities.get(id), to, dt), // your movement
  halt: (id) => (entities.get(id).vel = [0, 0, 0]),
};
const targeting = {
  positionOf: (id) => entities.get(id)?.pos,
  acquire: (id) => nearestEnemyOf(id), // your target pick (kd-tree, grid, faction…)
};

const registry = createOrderRegistry();
registry.register(defineMoveOrder({ kind: "move", mover }));
registry.register(defineAttackMoveOrder({ kind: "attack-move", mover, targeting }));
registry.register(defineTargetedOrder({ kind: "attack", mover, targeting }));

const queues = new Map(); // entityId -> OrderQueue
const queueOf = (id) => {
  let q = queues.get(id);
  if (!q) queues.set(id, (q = createOrderQueue(registry)));
  return q;
};

const selection = createSelectionSet();

// --- on a command (pointer marquee, a card play, an ability, an AI plan) --

function commandSelection(kind, payload) {
  for (const id of selection) {
    queueOf(id).issue({ kind, payload, policy: "replace" }); // shift-queue => "append"
  }
}
// e.g. commandSelection("attack-move", { point: worldHit });

// --- every frame ----------------------------------------------------------

function onTick(ctx, dt) {
  for (const [id, q] of queues) {
    q.tick(ctx, dt); // activates/advances/completes orders, drives the mover
    const active = q.active;
    if (active?.state?.inRange) {
      // Engagement verb says a target is in range — resolve it the game's way.
      ctx.scene.entity.effect({ from: id, to: active.state.target, effect: "damage" });
    }
  }
}
```

That is the whole command loop. Everything genre-specific lives in the three
functions you supplied (`stepToward`, `nearestEnemyOf`, and the `"damage"` effect)
— never in the order/selection primitives.

## Composing it into different games (and hybrids)

The wiring above is fixed; four independent knobs turn it into different play:

- **Who fills the selection.** Pointer marquee for an RTS; a targeting card for a
  card-driven skirmish; an AoE ability for a spell; an AI director for autobattle.
  Same `selection`, different caller.
- **Which camera renders it.** `topDown`, `rts`, `shoulder`, or `first` — camera is
  presentation and reads none of this. Swapping the rig never touches the loop.
- **What the effect does.** `"damage"` for combat; register a `defineTargetedOrder`
  with a `"harvest"` / `"repair"` / `"talk"` effect for non-combat command. The
  engagement seam is generic; combat is one instance.
- **When intent arrives.** A **mutating** game reuses one set of queues across
  phases: the card-game phase calls `issue()` from card plays; when it turns into
  a topdown-survival phase, the *same* queues now take `move` / `attack-move` from
  pointer input. You changed who calls `issue()`, not the architecture.

## Where to go next

- Marquee/box-select and right-click-to-command come from the shell pointer seam
  (`PlayableGame.pointer`: `select`, `selectFilter`, `orderCommand`) — that is the
  pointer *picker* that fills `selection` and calls `commandSelection`; see
  `jgengine-ui` for the pointer wiring.
- Pathing for `moveToward` can use `findPath` (`@jgengine/core/nav/navGrid`) over a
  walkable grid; the mover adapter is where it plugs in.
- Formations, order preemption policies, save/replication of in-flight orders, and
  the full order-kind contract are in [../reference.md](../reference.md) under
  *Entity orders (command queue)*.
- Damage numbers, death, and rewards are `jgengine-combat`; the effect call above
  is the seam into it.
