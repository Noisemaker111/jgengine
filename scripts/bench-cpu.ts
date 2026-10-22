import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { TIMING_GATE_ENV } from "./timing-budget";

/**
 * The wall-clock gate: runs every test file that carries a timing budget with
 * `JG_TIMING_GATE=1`, so the ceilings assert here and stay measured-and-printed
 * in `bun test`. CI runs this in the `perf-cpu` job, never in `test`, because a
 * shared runner throttles and a busy neighbour must not fail a merge.
 *
 *   bun run bench:cpu
 */

export const BENCH_FILES = [
  "packages/core/src/ai/flock.test.ts",
  "packages/core/src/ai/utilityBrain.test.ts",
  "packages/core/src/nav/navCrowd.perf.test.ts",
  "packages/core/src/nav/navMesh.test.ts",
  "packages/core/src/nav/traffic.soak.test.ts",
  "packages/core/src/scene/spatial.test.ts",
  "packages/core/src/sensor/perception.perf.test.ts",
  "packages/core/src/sim/offScreen.perf.test.ts",
  "packages/core/src/visibility/benchmark.test.ts",
  "packages/core/src/visibility/spatialIndex.test.ts",
  "packages/core/src/world/terrain.test.ts",
] as const;

const root = fileURLToPath(new URL("..", import.meta.url));

if (import.meta.main) {
  // A renamed or deleted benchmark file would otherwise drop out of the gate silently.
  const missing = BENCH_FILES.filter((path) => !existsSync(join(root, path)));
  if (missing.length > 0) {
    console.error(`bench:cpu: no such test file: ${missing.join(", ")} - update BENCH_FILES in scripts/bench-cpu.ts`);
    process.exit(2);
  }

  const result = spawnSync("bun", ["test", "--timeout", "600000", ...BENCH_FILES], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, [TIMING_GATE_ENV]: "1" },
  });
  process.exit(result.status ?? 1);
}
