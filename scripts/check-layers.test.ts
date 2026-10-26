import { describe, expect, test } from "bun:test";

import { layerOfFile, violationsIn } from "./check-layers";

describe("check layers", () => {
  test("a core file's suffix names its layer; react is view, shell is draw", () => {
    expect(layerOfFile("packages/core/src/hud/hudLayout.ts")).toBe("model");
    expect(layerOfFile("packages/core/src/hud/kitHud.view.tsx")).toBe("view");
    expect(layerOfFile("packages/core/src/hud/WorldHud.draw.tsx")).toBe("draw");
    expect(layerOfFile("packages/core/src/ui/kit/uiKit.view.ts")).toBe("view");
    expect(layerOfFile("packages/shell/src/GamePlayer.tsx")).toBe("draw");
    expect(layerOfFile("packages/core/src/hud/kitHud.view.test.tsx")).toBeNull();
    expect(layerOfFile("packages/editor/src/EditorApp.tsx")).toBeNull();
  });

  test("model code imports no React, three.js, view or draw file", () => {
    const file = "packages/core/src/save/saveStore.ts";
    const bad = [
      `import { useState } from "react";`,
      `import * as THREE from "three";`,
      `import { useFrame } from "@react-three/fiber";`,
      `import { SaveSlots } from "./saveSlots.view";`,
      `import { WorldHud } from "@jgengine/core/hud/WorldHud.draw";`,
      `import { KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";`,
      `export { GamePlayer } from "@jgengine/shell/GamePlayer";`,
      `const editor = () => import("@jgengine/editor");`,
    ];
    for (const line of bad) expect(violationsIn(file, line)).toHaveLength(1);
    expect(violationsIn(file, `import { rng } from "../random/rng";\nimport type { HudRect } from "@jgengine/core/hud/hudLayout";`)).toEqual([]);
  });

  test("view code imports React and model, never three.js or a draw file", () => {
    const file = "packages/core/src/hud/kitHud.view.tsx";
    expect(violationsIn(file, `import { useState } from "react";\nimport { HUD_CORNER_WIDTH } from "./hudLayout.view";\nimport { KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";`)).toEqual([]);
    expect(violationsIn(file, `import { Vector3 } from "three";`)).toHaveLength(1);
    expect(violationsIn(file, `import { WorldHud } from "./WorldHud.draw";`)).toHaveLength(1);
    expect(violationsIn("packages/core/src/ui/panels.view.tsx", `import { WorldHud } from "@jgengine/core/hud/WorldHud.draw";`)).toHaveLength(1);
  });

  test("draw code may import every layer below the editor", () => {
    const file = "packages/core/src/hud/WorldHud.draw.tsx";
    expect(violationsIn(file, `import { Html } from "@react-three/drei";\nimport { KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";\nimport { HudFrame } from "./hudFrame.view";`)).toEqual([]);
    expect(violationsIn(file, `import { EditorApp } from "@jgengine/editor/EditorApp";`)).toHaveLength(1);
  });

  test("comments and tests do not count", () => {
    expect(violationsIn("packages/core/src/save/saveStore.ts", `/** Pass \`() => import("@jgengine/editor")\`. */\n// import React from "react";`)).toEqual([]);
    expect(violationsIn("packages/core/src/save/saveStore.test.ts", `import { useState } from "react";`)).toEqual([]);
  });
});
