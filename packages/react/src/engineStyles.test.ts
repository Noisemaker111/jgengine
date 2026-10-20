import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ENGINE_STYLESHEET } from "./engineStyles";
import { HudButton } from "./hudButton";
import { HudPanel } from "./hudPanel";
import { HudThemeRoot } from "./hudThemeRoot";
import { defaultHudTheme, hudTheme } from "./hudTheme";

const root = join(import.meta.dir, "../../..");
const keyframes = new Set([...ENGINE_STYLESHEET.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.") ? [join(dir, entry.name)] : [],
  );
}

describe("engine stylesheet", () => {
  test("src/styles.css is the generated copy of ENGINE_STYLESHEET (run `bun --cwd=packages/react run styles`)", () => {
    expect(readFileSync(join(import.meta.dir, "styles.css"), "utf8")).toBe(ENGINE_STYLESHEET);
  });

  test("defines every jg-* keyframe the registry declares", () => {
    const registry = JSON.parse(readFileSync(join(root, "registry/registry.json"), "utf8")) as { items: { css?: Record<string, unknown> }[] };
    const declared = registry.items.flatMap((item) => Object.keys(item.css ?? {})).filter((key) => key.startsWith("@keyframes jg-"));
    expect(declared.length).toBeGreaterThan(0);
    for (const key of declared) expect(keyframes.has(key.replace("@keyframes ", "")), key).toBe(true);
  });

  test("defines every jg-* animation the registry blocks and react package reference", () => {
    const files = [...sourceFiles(join(root, "registry/jgengine")), ...sourceFiles(import.meta.dir)].filter((file) => !file.endsWith("rotateDevice.tsx"));
    const used = new Set(files.flatMap((file) => [...readFileSync(file, "utf8").matchAll(/animation:\s*["'`](jg-[\w-]+)/g)].map((match) => match[1])));
    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(keyframes.has(name), name).toBe(true);
  });

  test("reduced motion zeroes the motion scale for the OS preference and the accessibility setting", () => {
    expect(ENGINE_STYLESHEET).toContain("@media (prefers-reduced-motion: reduce) { :root { --jg-motion-scale: 0; } }");
    expect(ENGINE_STYLESHEET).toContain('[data-reduced-motion="true"] { --jg-motion-scale: 0; }');
  });

  test("generic HUD control defaults have zero specificity so game selectors win", () => {
    for (const line of ENGINE_STYLESHEET.split("\n").filter((l) => l.includes("[data-jg-hud]) :where(button"))) {
      expect(line.trimStart().startsWith(":where([data-jg-hud])")).toBe(true);
    }
  });
});

describe("HudThemeRoot", () => {
  test("applies the default theme on a layout-free HUD root", () => {
    const html = renderToStaticMarkup(createElement(HudThemeRoot, null, "hud"));
    expect(html).toContain('data-jg-hud=""');
    expect(html).toContain("display:contents");
    expect(html).toContain(`--jg-accent:${defaultHudTheme.palette.accent}`);
    expect(html).toContain("--jg-type-xs:max(12px, 12px)");
  });

  test("uses the game's theme when given", () => {
    const html = renderToStaticMarkup(createElement(HudThemeRoot, { theme: hudTheme({ palette: { accent: "#ff00aa" } }) }, "hud"));
    expect(html).toContain("--jg-accent:#ff00aa");
  });

  test("false opts out of the theme root entirely", () => {
    expect(renderToStaticMarkup(createElement(HudThemeRoot, { theme: false }, "hud"))).toBe("hud");
  });
});

describe("HudButton", () => {
  test("renders a typed button with variant, size, and cue hooks for the stylesheet", () => {
    const html = renderToStaticMarkup(createElement(HudButton, { variant: "primary", size: "lg", cue: "confirm" }, "Go"));
    expect(html).toContain('type="button"');
    expect(html).toContain('data-jg-button=""');
    expect(html).toContain('data-variant="primary"');
    expect(html).toContain('data-size="lg"');
    expect(html).toContain('data-jg-cue="confirm"');
  });
});

describe("HudPanel", () => {
  test("a static panel has no transition state; a controlled one starts open", () => {
    expect(renderToStaticMarkup(createElement(HudPanel, null, "x"))).not.toContain("data-state");
    const open = renderToStaticMarkup(createElement(HudPanel, { open: true, title: "Bag", elevation: "modal" }, "x"));
    expect(open).toContain('data-state="open"');
    expect(open).toContain('data-elevation="modal"');
    expect(open).toContain("Bag");
  });

  test("a panel that starts closed renders nothing", () => {
    expect(renderToStaticMarkup(createElement(HudPanel, { open: false }, "x"))).toBe("");
  });
});
