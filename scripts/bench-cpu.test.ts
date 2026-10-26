import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { BENCH_FILES } from "./bench-cpu";

const root = fileURLToPath(new URL("..", import.meta.url));

describe("bench:cpu", () => {
  test("every benchmark file exists, so a moved test cannot drop out of the gate", () => {
    expect(BENCH_FILES.filter((path) => !existsSync(join(root, path)))).toEqual([]);
  });
});
