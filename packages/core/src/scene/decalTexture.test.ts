import { expect, test } from "bun:test";
import { DECAL_STYLES, readDecalRules } from "@jgengine/core/world/decalKind";
import { createDecalTexture } from "./decalTexture";

const covered = (data: Uint8Array): number => data.reduce((n, _, i) => (i % 4 === 3 && data[i]! > 0 ? n + 1 : n), 0);

test("stencil paints its text in its colour and nothing without text", () => {
  const painted = createDecalTexture("stencil", "a", 128, { text: "LINE 06", color: "#336699" });
  expect(covered(painted.data)).toBeGreaterThan(300);
  const first = painted.data.findIndex((_, i) => i % 4 === 3 && painted.data[i]! > 0);
  expect([painted.data[first - 3], painted.data[first - 2], painted.data[first - 1]]).toEqual([0x33, 0x66, 0x99]);
  expect(covered(createDecalTexture("stencil", "a", 128, { text: "" }).data)).toBe(0);
  expect(createDecalTexture("stencil", "a", 128, { text: "LINE 06", color: "#336699" }).data).toEqual(painted.data);
});

test("every stencil letter, digit and mark has a seven-row glyph", () => {
  for (const char of "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-/.") expect(covered(createDecalTexture("stencil", "g", 128, { text: char }).data)).toBeGreaterThan(0);
});

test("chevrons paint a band and every style bakes", () => {
  expect(covered(createDecalTexture("chevrons", "c", 128, { color: "#ffcc00" }).data)).toBeGreaterThan(200);
  for (const style of DECAL_STYLES) expect(createDecalTexture(style, "s", 32, { text: "A" }).data.length).toBe(32 * 32 * 4);
});

test("a decal marker's text and paint parse, and a bad colour falls back", () => {
  expect(readDecalRules({ style: "stencil", text: "LINE 06", color: "#112233" })).toMatchObject({ style: "stencil", text: "LINE 06", color: "#112233" });
  expect(readDecalRules({ color: "red" }).color).toBe("#e0b040");
});
