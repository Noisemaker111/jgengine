import { appendFileSync } from "node:fs";

import { createGameServerHost, memoryPersistence } from "../packages/ws/src/host";
import { createHostRouter, type HostRouterConnection } from "../packages/ws/src/hostRouter";
import { isHelpAsked, renderUsage, type Usage } from "./script-help";

/**
 * Multiplayer host load: N players in one room on the real game server host and host router,
 * each sending a pose every 100 ms of fake clock, with every player subscribed to presence.
 * Prints one JSON line per room size: wall and CPU ms the host spends per game second, and the
 * bytes and messages it sends out per game second.
 *
 *   bun run perf server [--players 16,32,64,128] [--repeats 3] [--json out.jsonl] [--max-seconds 60]
 *
 * The run is single-threaded with a fake clock, so wall time from `performance.now()` is the cost.
 * CPU time is printed beside it; on Windows `process.cpuUsage()` moves in about 16 ms steps.
 * A size over 1000 wall ms per game second cannot keep up in real time; stderr says so.
 * Not a CI gate: the host is measured by hand, before and after a change, on one machine.
 */

const USAGE: Usage = {
  summary: "measure the multiplayer host with N players posing in one room; one JSON line per room size",
  usage: "bun run perf server [--players 16,32,64,128] [--repeats n] [--json path] [--max-seconds n]",
  flags: [
    { flag: "--players list", detail: `room sizes, comma-separated (default ${"16,32,64,128"}; at most ${256})` },
    { flag: "--repeats n", detail: "runs per size; the row is their median (default 3)" },
    { flag: "--json path", detail: "also append the JSON lines to a file" },
    { flag: "--max-seconds n", detail: "wall seconds one run may take, setup and warmup included, before it stops measuring (default 60; at least one step is always measured)" },
  ],
  example: "bun run perf server --players 16,32,64 --repeats 3",
};

/** The router's minimum pose interval: one pose per player per step. */
export const STEP_MS = 100;
/** Metres a player moves per step: 4 m/s, under the default 12 m/s speed cap. */
const STEP_METRES = 0.4;
const WARMUP_STEPS = 3;
/** Steps a 32-player room measures; bigger rooms measure fewer, since each step costs about N^3 bytes. */
const REFERENCE_STEPS = 100;
const REFERENCE_PLAYERS = 32;
const MIN_STEPS = 5;
/** Largest room accepted: one 512-player step sends about 16 GB of presence rows. */
export const MAX_PLAYERS = 256;
/** Wall ms per game second above which the host falls behind real time. */
export const REAL_TIME_MS = 1000;

export interface ServerBenchArgs {
  players: number[];
  repeats: number;
  json: string | null;
  maxSeconds: number;
}

export interface RunSample {
  steps: number;
  wallMs: number;
  cpuMs: number;
  bytes: number;
  messages: number;
  capped: boolean;
}

export interface ServerBenchRow {
  players: number;
  repeats: number;
  steps: number;
  gameSeconds: number;
  wallMsPerGameSecond: number;
  cpuMsPerGameSecond: number;
  mbOutPerGameSecond: number;
  messagesOutPerGameSecond: number;
  avgMessageBytes: number;
  keepsUpInRealTime: boolean;
  capped: boolean;
}

function positiveInt(flag: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${flag} needs a positive whole number, got ${raw}`);
  return value;
}

export function parseArgs(argv: readonly string[]): ServerBenchArgs {
  const args: ServerBenchArgs = { players: [16, 32, 64, 128], repeats: 3, json: null, maxSeconds: 60 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === undefined) continue;
    if (!flag.startsWith("--")) throw new Error(`unexpected argument ${flag}`);
    if (flag !== "--players" && flag !== "--repeats" && flag !== "--json" && flag !== "--max-seconds") {
      throw new Error(`unknown flag ${flag}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
    i += 1;
    if (flag === "--players") {
      args.players = value.split(",").map((part) => positiveInt("--players", part.trim()));
      const tooBig = args.players.find((players) => players > MAX_PLAYERS);
      if (tooBig !== undefined) throw new Error(`--players ${tooBig} is over the cap of ${MAX_PLAYERS}`);
    } else if (flag === "--repeats") {
      args.repeats = positiveInt(flag, value);
    } else if (flag === "--max-seconds") {
      args.maxSeconds = positiveInt(flag, value);
    } else {
      args.json = value;
    }
  }
  return args;
}

/** Measured steps for a room: 100 up to 32 players, then shrinking with N^3, never under 5. */
export function stepsFor(players: number): number {
  const scaled = Math.floor(REFERENCE_STEPS * (REFERENCE_PLAYERS / players) ** 3);
  return Math.max(MIN_STEPS, Math.min(REFERENCE_STEPS, scaled));
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  if (sorted.length % 2 === 1) return upper;
  return ((sorted[mid - 1] ?? upper) + upper) / 2;
}

const round = (value: number, places: number): number => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

/** One row per room size: the median of each rate across the repeats. */
export function summarize(players: number, samples: readonly RunSample[]): ServerBenchRow {
  const perGameSecond = (pick: (sample: RunSample) => number) =>
    median(samples.map((sample) => pick(sample) / ((sample.steps * STEP_MS) / 1000)));
  const steps = Math.min(...samples.map((sample) => sample.steps));
  const wallMsPerGameSecond = perGameSecond((sample) => sample.wallMs);
  const bytes = perGameSecond((sample) => sample.bytes);
  const messages = perGameSecond((sample) => sample.messages);
  return {
    players,
    repeats: samples.length,
    steps,
    gameSeconds: round((steps * STEP_MS) / 1000, 2),
    wallMsPerGameSecond: round(wallMsPerGameSecond, 1),
    cpuMsPerGameSecond: round(perGameSecond((sample) => sample.cpuMs), 1),
    mbOutPerGameSecond: round(bytes / 1e6, 2),
    messagesOutPerGameSecond: Math.round(messages),
    avgMessageBytes: messages === 0 ? 0 : Math.round(bytes / messages),
    keepsUpInRealTime: wallMsPerGameSecond <= REAL_TIME_MS,
    capped: samples.some((sample) => sample.capped),
  };
}

/** The stderr notes a row earns: falling behind real time, or a run stopped at the wall cap. */
export function rowNotes(row: ServerBenchRow, maxSeconds: number): string[] {
  const notes: string[] = [];
  if (!row.keepsUpInRealTime) {
    notes.push(
      `perf server: ${row.players} players cannot keep up in real time: ${row.wallMsPerGameSecond} wall ms per game second (over ${REAL_TIME_MS})`,
    );
  }
  if (row.capped) {
    notes.push(`perf server: ${row.players} players hit the ${maxSeconds} s cap and measured ${row.steps} steps instead of ${stepsFor(row.players)}`);
  }
  return notes;
}

const cpuMsNow = (): number => {
  const usage = process.cpuUsage();
  return (usage.user + usage.system) / 1000;
};

/** One run: build a room of `players`, warm up, then time `steps` pose rounds, stopping early once the run has taken `maxSeconds`. */
export async function measureRoom(players: number, steps: number, maxSeconds: number): Promise<RunSample> {
  const runStart = performance.now();
  const capMs = maxSeconds * 1000;
  let clock = 1_700_000_000_000;
  const now = () => clock;
  const host = createGameServerHost({ persistence: memoryPersistence(now), slotsPerServer: players + 1, now });
  const router = createHostRouter({ host, allowAnonymous: true, now });
  let counting = false;
  let bytes = 0;
  let messages = 0;
  const replies = new Map<number, unknown>();
  const connections: HostRouterConnection[] = [];
  const positions: { x: number; z: number }[] = [];

  try {
    for (let i = 0; i < players; i += 1) {
      const index = i;
      const connection = router.connect({
        send: (frame) => {
          if (counting) {
            messages += 1;
            bytes += typeof frame === "string" ? Buffer.byteLength(frame) : frame.byteLength;
            return;
          }
          if (index !== 0 || typeof frame !== "string") return;
          const message: unknown = JSON.parse(frame);
          if (typeof message === "object" && message !== null && "id" in message && typeof message.id === "number") {
            replies.set(message.id, message);
          }
        },
        close: () => {},
      });
      connections.push(connection);
      positions.push({ x: (i % 16) * 4, z: Math.floor(i / 16) * 4 });
    }

    let serverId: string | null = null;
    for (const [i, connection] of connections.entries()) {
      connection.handleRaw(JSON.stringify({ v: 1, t: "hello", id: 1, userId: `player-${i}` }));
      connection.handleRaw(JSON.stringify({ v: 1, t: "join", id: 2, gameId: "bench", ...(serverId === null ? {} : { serverId }) }));
      await router.drain();
      if (serverId === null) {
        const joined = replies.get(2);
        const result = typeof joined === "object" && joined !== null && "result" in joined ? joined.result : null;
        if (typeof result !== "object" || result === null || !("serverId" in result) || typeof result.serverId !== "string") {
          throw new Error(`the first player could not create a room: ${JSON.stringify(joined)}`);
        }
        serverId = result.serverId;
      }
      connection.handleRaw(JSON.stringify({ v: 1, t: "subscribe", id: 3, channel: "presence", serverId }));
    }
    await router.drain();

    const step = async () => {
      clock += STEP_MS;
      for (const [i, connection] of connections.entries()) {
        const position = positions[i];
        if (position === undefined) continue;
        position.x += STEP_METRES;
        connection.handleRaw(JSON.stringify({
          v: 1,
          t: "pose",
          serverId,
          pose: { x: position.x, y: 0, z: position.z, rotationY: 0, rotationPitch: 0 },
        }));
      }
      await router.drain();
    };

    for (let i = 0; i < WARMUP_STEPS; i += 1) await step();

    counting = true;
    const wallStart = performance.now();
    const cpuStart = cpuMsNow();
    let measured = 0;
    let capped = false;
    while (measured < steps) {
      await step();
      measured += 1;
      if (measured < steps && performance.now() - runStart > capMs) {
        capped = true;
        break;
      }
    }
    const wallMs = performance.now() - wallStart;
    const cpuMs = cpuMsNow() - cpuStart;
    counting = false;
    return { steps: measured, wallMs, cpuMs, bytes, messages, capped };
  } finally {
    for (const connection of connections) connection.close();
    router.close();
    await router.drain();
    await host.stop();
  }
}

async function main(argv: readonly string[]): Promise<number> {
  if (isHelpAsked(argv)) {
    console.log(renderUsage("perf server", USAGE));
    return 0;
  }
  let args: ServerBenchArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(`perf server: ${error instanceof Error ? error.message : String(error)}\n\n${renderUsage("perf server", USAGE)}`);
    return 2;
  }
  for (const players of args.players) {
    const samples: RunSample[] = [];
    for (let repeat = 0; repeat < args.repeats; repeat += 1) {
      samples.push(await measureRoom(players, stepsFor(players), args.maxSeconds));
    }
    const row = summarize(players, samples);
    const line = JSON.stringify(row);
    console.log(line);
    if (args.json !== null) appendFileSync(args.json, `${line}\n`);
    for (const note of rowNotes(row, args.maxSeconds)) console.error(note);
  }
  return 0;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
