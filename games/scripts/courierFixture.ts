/**
 * A small courier game for the from-zero and depth tests: E does a job, and content arrives on a
 * schedule its shape sets. `DEEP` is the fixed case (one parcel at second 0, something new about every
 * minute, hundreds of things); `DEMO` is today's demo shape (everything owned at boot, nothing taught,
 * nothing left to find). Its probe reports the readings `briefExample.ts` names.
 */
import { defineFlow, type Flow } from "../../packages/core/src/play/flow";
import type { ProbeReadings } from "../../packages/core/src/game/playableGame";
import { environment, terrain } from "../../packages/core/src/world/features";
import { defineGame } from "../../packages/shell/src/defineGame";

/** How the fixture hands out its content as the player works. */
export interface CourierShape {
  /** What a new game starts with. */
  start: { itemsSeen: number; areasSeen: number; verbsSeen: number; unlocks: number; vehicles: number };
  totals: { items: number; areas: number; verbs: number };
  /** Every this many jobs: a new item, a new area, an unlock (and a new verb with it). 0 never. */
  every: { item: number; area: number; unlock: number };
  /** The first job teaches the drop-off. */
  teachesFirstJob: boolean;
}

export const DEEP: CourierShape = {
  start: { itemsSeen: 1, areasSeen: 1, verbsSeen: 2, unlocks: 0, vehicles: 0 },
  totals: { items: 300, areas: 12, verbs: 30 },
  every: { item: 12, area: 40, unlock: 15 },
  teachesFirstJob: true,
};

export const DEMO: CourierShape = {
  start: { itemsSeen: 12, areasSeen: 3, verbsSeen: 8, unlocks: 5, vehicles: 2 },
  totals: { items: 12, areas: 3, verbs: 8 },
  every: { item: 0, area: 0, unlock: 0 },
  teachesFirstJob: false,
};

type Store = { game: { store: { get(key: string): unknown; set(key: string, value: number): void } } };

const n = (ctx: Store, key: string): number => Number(ctx.game.store.get(key) ?? 0);

export function courierGame(shape: CourierShape) {
  return defineGame({
    name: "Courier Fixture",
    world: environment({ terrain: terrain() }),
    input: { work: ["KeyE"], moveForward: ["KeyW"] },
    content: { entityById: (id) => (id === "courier" ? { role: "player", movement: { walkSpeed: 4 } } : null) },
    loop: {
      onInit(ctx) {
        const set = (key: string, value: number) => ctx.game.store.set(key, value);
        set("jobs", 0);
        set("taught", 0);
        set("itemsSeen", shape.start.itemsSeen);
        set("areasSeen", shape.start.areasSeen);
        set("verbsSeen", shape.start.verbsSeen);
        set("unlocks", shape.start.unlocks);
        set("vehicles", shape.start.vehicles);
        set("races", 0);
        ctx.game.commands.define("work", {
          apply: (state) => {
            const get = (key: string) => n(state, key);
            const put = (key: string, value: number) => state.game.store.set(key, value);
            const jobs = get("jobs") + 1;
            put("jobs", jobs);
            if (jobs === 1 && shape.teachesFirstJob) put("taught", get("taught") + 1);
            const due = (every: number) => every > 0 && jobs % every === 0;
            if (due(shape.every.item)) put("itemsSeen", Math.min(shape.totals.items, get("itemsSeen") + 1));
            if (due(shape.every.area)) put("areasSeen", Math.min(shape.totals.areas, get("areasSeen") + 1));
            if (due(shape.every.unlock)) {
              put("unlocks", get("unlocks") + 1);
              put("verbsSeen", Math.min(shape.totals.verbs, get("verbsSeen") + 1));
              put("vehicles", get("vehicles") + 1);
            }
            if (jobs % 20 === 0) put("races", get("races") + 1);
          },
        });
      },
      onNewPlayer(ctx) {
        ctx.scene.entity.spawn("courier", { id: ctx.player.userId, position: [0, 0, 0] });
      },
    },
    capture: {
      probe: (ctx) => ({
        taught: n(ctx, "taught"),
        unlocks: n(ctx, "unlocks"),
        itemsSeen: n(ctx, "itemsSeen"),
        itemsTotal: shape.totals.items,
        areasSeen: n(ctx, "areasSeen"),
        areasTotal: shape.totals.areas,
        verbsSeen: n(ctx, "verbsSeen"),
        verbsTotal: shape.totals.verbs,
        delivered: n(ctx, "jobs"),
        vehiclesOwned: n(ctx, "vehicles"),
        jobsTaken: n(ctx, "jobs"),
        racesRun: n(ctx, "races"),
      }),
    },
  });
}

/** Ten minutes of a job every five seconds, with E as the only input. */
export async function tenMinutesOfJobs(f: Flow<ProbeReadings>): Promise<void> {
  for (let job = 0; job < 120; job += 1) {
    await f.press("KeyE");
    await f.wait(5000 - 150);
  }
  await f.expect((p) => (p["delivered"] ?? 0) >= 120, "a job every five seconds for ten minutes");
}

/** The from-zero proofs of the two shapes, as a game's `from-zero.flow.ts` would export them. */
export const deepFromZero = defineFlow(courierGame(DEEP), { run: tenMinutesOfJobs });
export const demoFromZero = defineFlow(courierGame(DEMO), { run: tenMinutesOfJobs });
