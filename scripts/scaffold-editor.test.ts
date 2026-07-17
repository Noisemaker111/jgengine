import { describe, expect, test } from "bun:test";

import { normalizeEditorLayers } from "../packages/core/src/editor/document";
import type { EditorDocument } from "../packages/core/src/editor/types";
import { resolveAuthoredObjects } from "../packages/core/src/world/authoredObjects";
import { authoredSpawnPosition } from "../packages/core/src/world/authoredSpawn";
import { gameTemplate } from "../packages/jgengine/src/templates";
import { shellDrivesPlayerPose } from "../packages/shell/src/shellMovement";

/**
 * From-scratch loop, browserless: what `npx jgengine create` / `bun run new:game` scaffolds must be
 * walkable and editor-wired with zero hand-written code. Guards the create → walk → F2+E → play
 * chain the same way editor-mvp.test.ts guards authoring → AuthoredScene parity: the starter scene
 * document normalizes, carries a player_spawn the runtime honors (`authoredSpawnPosition`), resolves
 * placeable props, and the keybinds template binds actions that make the shell drive the walk pose.
 */
describe("scaffold → edit → play parity", () => {
  for (const variant of ["standalone", "in-repo"] as const) {
    const files = gameTemplate({ id: "probe-game", name: "Probe Game", variant, engineVersion: "0.10.0" });
    const fileOf = (path: string): string => {
      const file = files.find((entry) => entry.path === path);
      if (file === undefined) throw new Error(`template missing ${path}`);
      return file.contents;
    };

    test(`${variant}: starter scene normalizes with an authored spawn and placeable props`, () => {
      const raw = JSON.parse(fileOf("src/editor.scene.json")) as EditorDocument;
      const document = normalizeEditorLayers(raw);
      expect(authoredSpawnPosition(document)).not.toBeNull();
      const props = resolveAuthoredObjects(document);
      expect(props.length).toBeGreaterThan(0);
      for (const prop of props) {
        expect(["crate", "tree"]).toContain(prop.catalogId);
      }
    });

    test(`${variant}: scaffolded keybinds make the shell drive the walk controller`, () => {
      const source = fileOf("src/game/keybinds.ts");
      const boundActions = [...source.matchAll(/^\s{2}(\w+): \[/gm)].map((match) => match[1]!);
      expect(boundActions.length).toBeGreaterThan(0);
      const map = Object.fromEntries(boundActions.map((action) => [action, ["KeyW"]]));
      expect(shellDrivesPlayerPose(map)).toBe(true);
    });

    test(`${variant}: the document reaches play and editor modes through defineGame({ editorLayers })`, () => {
      expect(fileOf("src/game.config.ts")).toMatch(/editorLayers,/);
      expect(fileOf("src/loop.ts")).toContain("authoredSpawnPosition(editorLayers)");
    });
  }
});
