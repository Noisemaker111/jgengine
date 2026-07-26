import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findStatefulPrimitives } from "./statefulPrimitives";

function scan(source: string): string[] {
  const root = mkdtempSync(join(tmpdir(), "stateful-"));
  try {
    for (const dir of ["packages/core/src", "packages/react/src"]) mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, "packages/core/src/probe.ts"), source);
    return findStatefulPrimitives(root).map((entry) => entry.factory);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const STATEFUL_BODY = `
export function createThing(): Thing {
  let n = 0;
  return { tick: () => { n++; }, count: () => n };
}
`;

describe("findStatefulPrimitives", () => {
  test("flags a mutable handle with no way to read the state out", () => {
    expect(scan(`export interface Thing {\n  tick(dt: number): void;\n  count(): number;\n}\n${STATEFUL_BODY}`)).toEqual([
      "createThing",
    ]);
  });

  test("a state-out method alone is not enough — the state must come back in", () => {
    expect(
      scan(`export interface Thing {\n  tick(dt: number): void;\n  snapshot(): number;\n}\n${STATEFUL_BODY}`),
    ).toEqual(["createThing"]);
  });

  test("clears a handle that pairs state-out with restore", () => {
    const source = `export interface Thing {
  tick(dt: number): void;
  snapshot(): number;
  restore(next: number): void;
}
${STATEFUL_BODY}`;
    expect(scan(source)).toEqual([]);
  });

  test("clears the cardPile shape — state() plus reset()", () => {
    const source = `export interface Thing {
  draw(n: number): readonly string[];
  state(): ThingState;
  reset(next: ThingState): void;
}
${STATEFUL_BODY}`;
    expect(scan(source)).toEqual([]);
  });

  test("ignores a factory that owns no mutable state", () => {
    const source = `export interface Thing {
  encode(id: string): string;
}

export function createThing(): Thing {
  return { encode: (id) => id };
}`;
    expect(scan(source)).toEqual([]);
  });
});
