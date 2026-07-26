import { describe, expect, test } from "bun:test";
import { adoptionSmellsIn, importsModule } from "./gameAdoptionSmells.ts";

const FILE = "Games/probe/src/game/ui/Hud.tsx";
const smells = (source: string): string[] => adoptionSmellsIn(FILE, source);

describe("adoptionSmellsIn — widget re-derivation", () => {
  test("a hand-rolled widget with no engine import is flagged", () => {
    const source = `import { useGame } from "@jgengine/react/hooks";

function Bar({ value }: { value: number }) {
  return <div style={{ width: value }} />;
}
`;
    expect(smells(source)).toEqual([`${FILE}:local-widget-Bar`]);
  });

  test("a thin wrapper over the shipped module is adoption, not debt", () => {
    // claudecraft's real shape: a local `Bar` that exists only to apply game tokens to HealthBar.
    const source = `import { HealthBar, barTokens } from "@jgengine/react/bars";

function Bar({ value, max }: { value: number; max: number }) {
  return <HealthBar value={value} max={max} style={barTokens({ height: "15px" })} />;
}
`;
    expect(smells(source)).toEqual([]);
  });

  test("each widget name is cleared only by its OWN owning module", () => {
    // Importing bars must not excuse a hand-rolled Slot — the mistake a blanket
    // "imports something from @jgengine/react" check would make on ironhold's Hud.
    const source = `import { HealthBar } from "@jgengine/react/bars";

function Slot({ icon }: { icon: string }) {
  return <button>{icon}</button>;
}
`;
    expect(smells(source)).toEqual([`${FILE}:local-widget-Slot`]);
  });

  test("every flagged widget name has an owning module, so none is unclearable", () => {
    for (const [name, owner] of [
      ["Bar", "@jgengine/react/bars"],
      ["Window", "@jgengine/react/panels"],
      ["Slot", "@jgengine/react/actionHud"],
      ["Chip", "@jgengine/react/components"],
    ] as const) {
      expect(smells(`function ${name}() { return null; }`)).toEqual([`${FILE}:local-widget-${name}`]);
      expect(smells(`import { X } from "${owner}";\nfunction ${name}() { return null; }`)).toEqual([]);
    }
  });

  test("exported widgets are flagged the same as local ones", () => {
    expect(smells("export function Window() { return null; }")).toEqual([`${FILE}:local-widget-Window`]);
  });

  test("module-global `export let` is still flagged regardless of imports", () => {
    const source = `import { HealthBar } from "@jgengine/react/bars";

export let session = null;
`;
    expect(smells(source)).toEqual([`${FILE}:export-let`]);
  });

  test("a clean file reports nothing", () => {
    expect(smells('import { HealthBar } from "@jgengine/react/bars";\nconst x = 1;')).toEqual([]);
  });
});

describe("importsModule", () => {
  test("matches single and double quotes, and named or namespace imports", () => {
    expect(importsModule('import { A } from "@jgengine/react/bars";', "@jgengine/react/bars")).toBe(true);
    expect(importsModule("import * as B from '@jgengine/react/bars';", "@jgengine/react/bars")).toBe(true);
  });

  test("does not match a different module that shares a prefix", () => {
    // `@jgengine/react/barsExtra` must not satisfy `@jgengine/react/bars`.
    expect(importsModule('import { A } from "@jgengine/react/barsExtra";', "@jgengine/react/bars")).toBe(false);
  });

  test("does not match the module name appearing in prose or a string", () => {
    expect(importsModule('// see @jgengine/react/bars for the shipped version', "@jgengine/react/bars")).toBe(false);
  });
});
