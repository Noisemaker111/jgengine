import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ENGINE_STYLESHEET } from "./engineStyles";
import { HudButton } from "./hudButton";
import { HudPanel } from "./hudPanel";
import { HudSurface } from "./hudSurface";
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

  test("every rule sits in the components.jgengine layer, after Tailwind's layer order", () => {
    expect(ENGINE_STYLESHEET).toContain("@layer theme, base, components, utilities;\n@layer components.jgengine {\n");
    expect(ENGINE_STYLESHEET.trimEnd().endsWith("}")).toBe(true);
    const body = ENGINE_STYLESHEET.slice(ENGINE_STYLESHEET.indexOf("@layer components.jgengine {"));
    let depth = 0;
    let closedAt = -1;
    for (let index = 0; index < body.length; index += 1) {
      if (body[index] === "{") depth += 1;
      else if (body[index] === "}" && --depth === 0) { closedAt = index; break; }
    }
    expect(body.slice(closedAt + 1).trim()).toBe("");
  });

  test("buttons wrap and panels take padding from a variable", () => {
    const button = ENGINE_STYLESHEET.split("\n").find((line) => line.startsWith("[data-jg-button] {"))!;
    expect(button).toContain("white-space: normal;");
    expect(button).not.toContain("line-height: 1;");
    expect(ENGINE_STYLESHEET).toContain("[data-jg-panel] { box-sizing: border-box; padding: var(--jg-panel-padding, 12px);");
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
    expect(html).toContain("--jg-type-xs:calc(max(12px, 12px) * var(--jg-text-scale, 1))");
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

describe("HudSurface", () => {
  test("the deprecated HudPanel name is the same component", () => {
    expect(HudPanel).toBe(HudSurface);
  });

  test("renders as a landmark element and leaves padding to CSS unless asked", () => {
    const plain = renderToStaticMarkup(createElement(HudSurface, { as: "aside", "aria-label": "Crew" }, "x"));
    expect(plain.startsWith("<aside")).toBe(true);
    expect(plain).not.toContain("padding");
    const padded = renderToStaticMarkup(createElement(HudSurface, { padding: 20 }, "x"));
    expect(padded).toContain("--jg-panel-padding:20px");
    expect(padded).not.toMatch(/[";]padding:/);
  });

  test("a static panel has no transition state; a controlled one starts open", () => {
    expect(renderToStaticMarkup(createElement(HudSurface, null, "x"))).not.toContain("data-state");
    const open = renderToStaticMarkup(createElement(HudSurface, { open: true, title: "Bag", elevation: "modal" }, "x"));
    expect(open).toContain('data-state="open"');
    expect(open).toContain('data-elevation="modal"');
    expect(open).toContain("Bag");
  });

  test("a panel that starts closed renders nothing", () => {
    expect(renderToStaticMarkup(createElement(HudSurface, { open: false }, "x"))).toBe("");
  });
});
