import { afterEach, expect, spyOn, test } from "bun:test";

import type { PoseSyncRules } from "@jgengine/core/multiplayer/presenceModel";
import { DEFAULT_POSE_SYNC_RULES } from "@jgengine/core/multiplayer/presenceModel";

import { createGameServerHost, memoryPersistence } from "./host";
import { createHostRouter } from "./hostRouter";
import { decodeWsServerMessage, type WsCodecName, type WsFrame, type WsPresenceRow } from "./protocol";
import { manualTimers } from "./testFixtures";

type Player = {
  userId: string;
  frames: WsFrame[];
  send: (message: Record<string, unknown>) => void;
  close: () => void;
  /** Presence rosters received since the last {@link Player.clear}, decoded. */
  rosters: () => WsPresenceRow[][];
  clear: () => void;
};

const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
});

async function room(options: { players: number; codecs?: WsCodecName[]; poseRules?: PoseSyncRules }) {
  let clock = 1_000_000;
  const now = () => clock;
  const timers = manualTimers();
  const host = createGameServerHost({ persistence: memoryPersistence(now), slotsPerServer: options.players + 1, now });
  const router = createHostRouter({
    host,
    allowAnonymous: true,
    now,
    scheduleTimer: timers.scheduleTimer,
    ...(options.poseRules === undefined ? {} : { poseRules: options.poseRules }),
  });
  stops.push(async () => { router.close(); await host.stop(); });
  const connect = (userId: string, codec: WsCodecName): Player => {
    const frames: WsFrame[] = [];
    const connection = router.connect({ send: (frame) => frames.push(frame), close: () => {} });
    return {
      userId,
      frames,
      send: (message) => connection.handleRaw(JSON.stringify({ v: 1, ...message })),
      close: () => connection.close(),
      rosters: () => frames.flatMap((frame) => {
        const message = decodeWsServerMessage(frame);
        return message?.t === "update" && message.channel === "presence" ? [message.data as WsPresenceRow[]] : [];
      }),
      clear: () => { frames.length = 0; },
    };
  };
  const players = Array.from({ length: options.players }, (_, i) => connect(`p${i}`, options.codecs?.[i] ?? "json"));
  for (const player of players) player.send({ t: "hello", id: 1, userId: player.userId, codec: options.codecs?.[players.indexOf(player)] ?? "json" });
  await router.drain();
  const [first] = players;
  if (first === undefined) throw new Error("a room needs a player");
  first.send({ t: "join", id: 2, gameId: "presence-test" });
  await router.drain();
  const [created] = await host.browseServers({ gameId: "presence-test" });
  if (created === undefined) throw new Error("join created no server");
  const serverId = created.serverId;
  for (const player of players.slice(1)) player.send({ t: "join", id: 2, gameId: "presence-test", serverId });
  await router.drain();
  for (const player of players) player.send({ t: "subscribe", id: 3, channel: "presence", serverId });
  await router.drain();

  const pose = (player: Player, x: number, appearance?: Record<string, string>) =>
    player.send({ t: "pose", serverId, pose: { x, y: 0, z: 0, rotationY: 0, rotationPitch: 0, ...(appearance === undefined ? {} : { appearance }) } });
  const step = async (ms = 100) => {
    clock += ms;
    await router.drain();
  };
  /** Every player poses once, then the window that opened closes, so the room starts quiet. */
  const settle = async () => {
    await step();
    for (const [i, player] of players.entries()) pose(player, i);
    await router.drain();
    timers.fire();
    timers.fire();
    for (const player of players) player.clear();
  };
  return { router, timers, players, serverId, pose, step, settle, connect, host };
}

const xOf = (rows: WsPresenceRow[] | undefined, userId: string) => rows?.find((row) => row.userId === userId)?.position.x;

test("presence: poses inside one pose interval reach subscribers as one roster when the window closes", async () => {
  const { players, timers, pose, step, settle } = await room({ players: 3 });
  await settle();
  const [a, b, c] = players as [Player, Player, Player];

  await step();
  pose(a, 0.5);
  await step(10);
  pose(b, 1.5);
  pose(c, 2.5);
  await step(10);

  // The quiet room sends the first move at once; the next two wait for the window.
  expect(c.rosters()).toHaveLength(1);
  expect(xOf(c.rosters()[0], "p0")).toBeCloseTo(0.5);
  expect(xOf(c.rosters()[0], "p1")).toBeCloseTo(1);
  expect(timers.pending()).toEqual([DEFAULT_POSE_SYNC_RULES.minIntervalMs ?? 100]);

  timers.fire();
  const rosters = c.rosters();
  expect(rosters).toHaveLength(2);
  expect(xOf(rosters[1], "p1")).toBeCloseTo(1.5);
  expect(xOf(rosters[1], "p2")).toBeCloseTo(2.5);

  // Nothing moved inside the new window, so it closes without sending.
  timers.fire();
  expect(c.rosters()).toHaveLength(2);
  expect(timers.pending()).toEqual([]);
});

test("presence: the window lasts one configured pose interval", async () => {
  const { pose, players, timers, settle, step } = await room({ players: 2, poseRules: { ...DEFAULT_POSE_SYNC_RULES, minIntervalMs: 40 } });
  await settle();
  await step(40);
  pose(players[0] as Player, 0.2);
  await step(0);
  expect(timers.pending()).toEqual([40]);
});

test("presence: a joining player and a leaving one reach subscribers without waiting for the window", async () => {
  const { players, timers, pose, step, settle, serverId, connect, router } = await room({ players: 3 });
  await settle();
  const [a, b, c] = players as [Player, Player, Player];

  await step();
  pose(a, 0.5);
  await step(0);
  expect(timers.pending()).toHaveLength(1);
  c.clear();

  const late = connect("late", "json");
  late.send({ t: "hello", id: 1, userId: "late" });
  late.send({ t: "join", id: 2, gameId: "presence-test", serverId });
  await router.drain();
  pose(late, 4);
  await step(0);
  expect(c.rosters().at(-1)?.map((row) => row.userId).sort()).toEqual(["late", "p0", "p1", "p2"]);

  b.send({ t: "leave", id: 9, serverId });
  await step(0);
  expect(c.rosters().at(-1)?.map((row) => row.userId).sort()).toEqual(["late", "p0", "p2"]);

  a.close();
  await step(0);
  expect(c.rosters().at(-1)?.map((row) => row.userId).sort()).toEqual(["late", "p2"]);
});

test("presence: an appearance change inside the window goes out when it closes", async () => {
  const { players, timers, pose, step, settle } = await room({ players: 2 });
  await settle();
  const [a, b] = players as [Player, Player];

  await step();
  pose(a, 0.5);
  await step(0);
  await step();
  pose(a, 0.5, { skin: "gold" });
  await step(0);
  expect(b.rosters().map((rows) => rows[0]?.appearance)).toEqual([undefined]);

  timers.fire();
  expect(b.rosters().at(-1)?.find((row) => row.userId === "p0")?.appearance).toEqual({ skin: "gold" });
});

test("presence: a broadcast encodes once per codec and every subscriber decodes the same roster", async () => {
  const { players, timers, pose, step, settle } = await room({ players: 4, codecs: ["json", "json", "binary", "binary"] });
  await settle();
  const [a, b, c, d] = players as [Player, Player, Player, Player];

  await step();
  pose(a, 0.5);
  await step(0);
  await step(10);
  pose(b, 1.5);
  await step(0);
  for (const player of players) player.clear();

  const stringify = spyOn(JSON, "stringify");
  try {
    timers.fire();
    expect(stringify).toHaveBeenCalledTimes(1);
  } finally {
    stringify.mockRestore();
  }
  const [cFrame] = c.frames;
  const [dFrame] = d.frames;
  expect(cFrame).toBeInstanceOf(Uint8Array);
  expect(dFrame).toBe(cFrame as WsFrame);
  expect(typeof a.frames[0]).toBe("string");
  expect(b.frames[0]).toBe(a.frames[0] as WsFrame);
  const expected = a.rosters()[0];
  expect(xOf(expected, "p1")).toBeCloseTo(1.5);
  for (const player of [b, c, d]) expect(player.rosters()).toEqual([expected as WsPresenceRow[]]);
});

test("presence: router close cancels an open presence window", async () => {
  const { players, timers, pose, step, settle, router } = await room({ players: 2 });
  await settle();
  await step();
  pose(players[0] as Player, 0.5);
  await step(0);
  expect(timers.pending()).toHaveLength(1);
  router.close();
  expect(timers.pending()).toEqual([]);
});
