import { describe, expect, test } from "bun:test";

import { buildImportGraph, closure, reverseReach } from "./import-graph";

const paths = (entries: Record<string, Record<string, string[]>>): Map<string, { key: string; targets: string[] }[]> =>
  new Map(Object.entries(entries).map(([dir, map]) => [dir, Object.entries(map).map(([key, targets]) => ({ key, targets }))]));

describe("import graph", () => {
  test("an ESM `.js` specifier names the TypeScript source beside it", () => {
    const graph = buildImportGraph("/repo", ["convex/api.d.ts", "convex/bills.ts"], {
      readText: () => 'import type * as bills from "./bills.js";',
      tsconfigs: paths({ "": {} }),
    });
    expect(graph.imports.get("convex/api.d.ts")).toEqual(["convex/bills.ts"]);
    expect(graph.opaque.size).toBe(0);
  });

  test("a shared file resolves through the paths of the program that imports it", () => {
    // The UI registry has no tsconfig of its own; each game compiles it with `@/components/ui/*`.
    const graph = buildImportGraph("/repo", ["games/registry/jgengine/slot.tsx", "games/registry/jgengine/badge.tsx", "games/a/tsconfig.json", "games/a/src/hud.tsx"], {
      readText: (path) =>
        ({
          "games/registry/jgengine/slot.tsx": 'import { Badge } from "@/components/ui/badge";',
          "games/a/src/hud.tsx": 'import { Slot } from "@/components/ui/slot";',
        })[path] ?? "",
      tsconfigs: paths({ "": {}, games: {}, "games/registry": {}, "games/registry/jgengine": {}, "games/a": { "@/components/ui/*": ["games/registry/jgengine/*"] } }),
    });
    expect(graph.imports.get("games/a/src/hud.tsx")).toEqual(["games/registry/jgengine/slot.tsx"]);
    expect(graph.imports.get("games/registry/jgengine/slot.tsx")).toEqual(["games/registry/jgengine/badge.tsx"]);
    expect(reverseReach(graph, ["games/registry/jgengine/badge.tsx"])).toEqual(
      new Set(["games/registry/jgengine/badge.tsx", "games/registry/jgengine/slot.tsx", "games/a/src/hud.tsx"]),
    );
  });

  test("a workspace package name resolves to its source; an npm package is neither an edge nor opaque", () => {
    const graph = buildImportGraph("/repo", ["games/llmville/packages/game/src/models.ts", "games/llmville/src/app.tsx"], {
      readText: (path) => (path === "games/llmville/src/app.tsx" ? 'import { models } from "@llmville/game/models";\nimport React from "react";' : ""),
      tsconfigs: paths({ "": {} }),
      packages: [{ name: "@llmville/game", dir: "games/llmville/packages/game" }],
    });
    expect(graph.imports.get("games/llmville/src/app.tsx")).toEqual(["games/llmville/packages/game/src/models.ts"]);
    expect(graph.opaque.size).toBe(0);
  });

  test("an in-repo specifier that names no file marks its importer opaque, never silently edgeless", () => {
    const graph = buildImportGraph("/repo", ["packages/core/src/a.ts"], {
      readText: () => 'import { gone } from "./gone";\nimport { x } from "@jgengine/core/missing";\nimport "./style.css";',
      tsconfigs: paths({ "": { "@jgengine/core/*": ["packages/core/src/*"] } }),
    });
    expect(graph.opaque.get("packages/core/src/a.ts")).toEqual(["./gone", "@jgengine/core/missing"]);
  });

  test("closure follows imports forward; reverse reach follows importers back", () => {
    const graph = buildImportGraph("/repo", ["a.ts", "b.ts", "c.ts"], {
      readText: (path) => ({ "a.ts": 'import "./b";', "b.ts": 'export * from "./c";' })[path] ?? "",
      tsconfigs: paths({ "": {} }),
    });
    expect(closure(graph, ["a.ts"])).toEqual(new Set(["a.ts", "b.ts", "c.ts"]));
    expect(reverseReach(graph, ["c.ts"])).toEqual(new Set(["c.ts", "b.ts", "a.ts"]));
  });
});
