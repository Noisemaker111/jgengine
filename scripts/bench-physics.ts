import { buildBenchWorld } from "../Games/stress-bench/src/benchState";
import { DEFAULT_PARAMS, type BenchParams } from "../Games/stress-bench/src/params";

type Args = BenchParams & { frames: number; warmup: number };

function parseArgs(argv: string[]): Args {
  const args: Args = { ...DEFAULT_PARAMS, frames: 600, warmup: 60 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const num = () => Number(argv[++index]);
    if (value === "--small") args.small = num();
    else if (value === "--large") args.large = num();
    else if (value === "--chaos") args.chaos = num();
    else if (value === "--layers") args.layers = num();
    else if (value === "--cellSize") args.cellSize = num();
    else if (value === "--gravity") args.gravity = num();
    else if (value === "--seed") args.seed = num();
    else if (value === "--frames") args.frames = num();
    else if (value === "--warmup") args.warmup = num();
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const { world } = buildBenchWorld(args);

const dt = 1 / 60;
const times: number[] = [];
let settleFrame = -1;
const settleThreshold = Math.max(4, Math.floor(world.count * 0.001));

for (let frame = 0; frame < args.frames; frame += 1) {
  const stats = world.step(dt);
  if (frame >= args.warmup) times.push(stats.stepMs);
  if (settleFrame < 0 && stats.awake <= settleThreshold) settleFrame = frame;
}

times.sort((a, b) => a - b);
const sum = times.reduce((a, b) => a + b, 0);
const pct = (p: number) => times[Math.min(times.length - 1, Math.floor(times.length * p))] ?? 0;
const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const finalStats = world.getStats();

const report = {
  params: { small: args.small, large: args.large, chaos: args.chaos, layers: args.layers, cellSize: args.cellSize },
  bodies: world.count,
  cells: world.cells.total,
  frames: args.frames,
  sampled: times.length,
  settleFrame,
  awakeAtEnd: finalStats.awake,
  sleepingAtEnd: finalStats.sleeping,
  contactsAtEnd: finalStats.contacts,
  pairsAtEnd: finalStats.pairs,
  physicsMs: {
    avg: round(sum / Math.max(1, times.length)),
    p50: round(pct(0.5)),
    p95: round(pct(0.95)),
    max: round(times[times.length - 1] ?? 0),
  },
  headroomFps: round(1000 / Math.max(1e-6, sum / Math.max(1, times.length)), 1),
};

console.log(JSON.stringify(report, null, 2));
