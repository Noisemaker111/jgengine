import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { reactImports, scanReactFree } from "./check-react-free";

test("React imports are detected and the engine's @jgengine/react UI package is not", () => {
  expect(reactImports('import type { ReactNode } from "react"; export { Provider } from "@jgengine/react/provider";')).toEqual(["import of react"]);
  expect(reactImports('import { useState } from "@jgengine/core/ui/jsx"; import { GameProvider } from "@jgengine/react";')).toEqual([]);
});

test("hook manifests grant no source exemption, and hosts may use React and the engine UI package", () => {
  const root = mkdtempSync(join(tmpdir(), "jg-react-free-"));
  try {
    const init = spawnSync("git", ["init", "--quiet", root], { encoding: "utf8" });
    expect(init.status).toBe(0);
    const files = {
      "packages/ui/src/provider.ts": 'import React from "react";',
      "packages/ui/package.json": '{"dependencies":{"react-dom":"19"}}',
      "packages/convex/src/adapter.ts": 'import { useState } from "react";',
      "packages/convex/package.json": '{"peerDependencies":{"react":"19"}}',
      "games/llmville/src/app.tsx": 'import { useEffect } from "react";',
      "games/llmville/package.json": '{"dependencies":{"react":"19"}}',
      "apps/web/src/app.tsx": 'import React from "react"; import { GameProvider } from "@jgengine/react";',
      "apps/web/package.json": '{"dependencies":{"react":"19","@jgengine/react":"0.55"}}',
    };
    for (const [name, contents] of Object.entries(files)) {
      const path = join(root, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents);
    }
    const report = scanReactFree(root);
    expect(report.violations).toHaveLength(4);
    expect(report.violations.map((violation) => violation.file).sort()).toEqual([
      "games/llmville/src/app.tsx",
      "packages/convex/src/adapter.ts", "packages/ui/package.json", "packages/ui/src/provider.ts",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
