import { afterAll, expect, setSystemTime, test } from "bun:test";
import { convexTest } from "convex-test";

import { MIN_SCRAPED_DATA_TOKENS, REQUIRED_TUTORIAL_GPU_COUNT, TUTORIAL_SCRAPE_MODEL_ID, TUTORIAL_TRAIN_BASE_MODEL_ID } from "@llmville/game/tutorial/tutorialProgress";

import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

// The deployment settings a local Convex dev deployment carries (the game README's Develop section).
process.env["CONVEX_SITE_URL"] ??= "http://127.0.0.1:3211";
process.env["SITE_URL"] ??= "http://localhost:3001";
process.env["BETTER_AUTH_SECRET"] ??= "0".repeat(64);

// Every backend module as convex-test loads them: the real functions, on an in-memory database.
const modules = Object.fromEntries(
  [...new Bun.Glob("**/*.{ts,js}").scanSync({ cwd: `${import.meta.dir}/../convex` })]
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => !path.endsWith(".test.ts") && !path.endsWith(".d.ts"))
    .map((path) => [`../convex/${path}`, () => import(`../convex/${path}`)]),
);

afterAll(() => setSystemTime());

/**
 * A new player's first loop, end to end on the backend's own functions: the calls the tablet's buttons
 * make, in the tutorial's order, with the server tick and presence sync a running client keeps going.
 * It ends with a served model earning money, the tutorial's last step.
 */
test("a new player plays from zero to a served model that earns", async () => {
  let now = Date.UTC(2026, 10, 19, 12);
  setSystemTime(new Date(now));
  const t = convexTest(schema, modules);
  const player = "first-loop-player";
  const as = t.withIdentity({ subject: player, name: "Ada" });

  // The world advances on the cron heartbeat; each system it schedules then schedules its player batches.
  const play = async (seconds: number) => {
    for (let second = 0; second < seconds; second += 1) {
      now += 1000;
      setSystemTime(new Date(now));
      // A client syncs its pose every few seconds; that is what keeps a player online for the tick.
      if (second % 4 === 0) await as.mutation(api.presence.sync, { serverId, externalId: player });
      await t.mutation(internal.tick.runServerTick, {});
      for (let round = 0; round < 3; round += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        await t.finishInProgressScheduledFunctions();
      }
    }
  };

  await as.mutation(api.user.createOrUpdate, { displayName: "Ada" });
  const { gameId } = await as.mutation(api.world.bootstrapWorld, { displayName: "Ada", avatarId: "default" });
  const { serverId } = (await as.mutation(api.runtime.joinServer, { gameId: "llmville", externalId: player })) as { serverId: never };
  await as.mutation(api.multiplayer.worldPresence.ensureHumanPresence, { gameId });
  const game = async () => (await as.query(api.world.state, { gameId }))!.game;
  const scene = async () => (await as.query(api.world.scene, { gameId }))!;

  // Place your rack: bought from the store, placed on a free cell.
  expect(await as.mutation(api.store.buy, { gameId, itemId: "starter_rack" })).toMatchObject({ ok: true });
  expect(await as.mutation(api.build.place, { gameId, itemId: "starter_rack", x: 63.8, y: 0, z: 10.5, direction: 0 })).toEqual({ placed: true });
  const rackId = (await scene()).racks[0]!.id;

  // Buy and install the GPUs.
  expect(await as.mutation(api.store.buy, { gameId, itemId: "gpu_1", quantity: REQUIRED_TUTORIAL_GPU_COUNT })).toMatchObject({ ok: true });
  for (let slot = 0; slot < REQUIRED_TUTORIAL_GPU_COUNT; slot += 1) {
    expect(await as.mutation(api.rack.moveHardware, { gameId, rackId, from: { kind: "stock", hardwareId: "gpu_1" }, to: { kind: "slot", slot } })).toEqual({ moved: true });
  }

  // License a scraper, put a card on scraping (the tier needs a scraping card first) and scrape enough to train.
  expect(await as.mutation(api.store.unlock, { gameId, itemId: TUTORIAL_SCRAPE_MODEL_ID })).toMatchObject({ unlocked: true });
  expect(await as.mutation(api.inference.assignCard, { gameId, rackId, slotIndex: 0, lane: "scraping" })).toEqual({ ok: true });
  expect(await as.mutation(api.inference.setScrapeTier, { gameId, tier: "books" })).toEqual({ ok: true });
  await play(Math.ceil(MIN_SCRAPED_DATA_TOKENS / 125) * 10 + 10);
  expect((await game()).dataTokens).toBeGreaterThanOrEqual(MIN_SCRAPED_DATA_TOKENS);

  // Fine-tune on the second card until the run finishes.
  expect(await as.mutation(api.inference.assignCard, { gameId, rackId, slotIndex: 1, lane: "training" })).toEqual({ ok: true });
  expect(await as.mutation(api.models.train, { gameId, baseModelId: TUTORIAL_TRAIN_BASE_MODEL_ID })).toEqual({ started: true });
  for (let wait = 0; wait < 60 && (await scene()).activeTrainingSessions.length > 0; wait += 1) await play(10);
  const model = (await scene()).models.find((row) => row.baseModelId === TUTORIAL_TRAIN_BASE_MODEL_ID);
  expect(model).toBeDefined();

  // Reveal it, serve it on the second card, and it earns.
  expect(await as.mutation(api.models.reveal, { modelId: model!._id })).toEqual({ revealed: true });
  expect(await as.mutation(api.serving.serve, { modelId: model!._id })).toEqual({ served: true });
  expect(await as.mutation(api.inference.assignCard, { gameId, rackId, slotIndex: 1, lane: "serving", targetModelId: model!._id })).toEqual({ ok: true });
  const before = (await game()).money;
  await play(60);
  const earnedPerHour = ((await game()).money - before) * 60;
  // The design checklist: the first model earns about $200 an hour.
  expect(earnedPerHour).toBeGreaterThan(100);
  expect(earnedPerHour).toBeLessThan(400);
}, 120_000);
