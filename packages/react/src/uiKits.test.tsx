import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { UI_CUES } from "@jgengine/core/audio/uiCues";

import { GameMenu } from "./menu/gameMenu";
import { ContinuePane } from "./menu/gameMenuSaves";
import { actionGlyph } from "./inputDevice";
import { deadlineStage, formatCountdown, KitObjective, KitResultScreen } from "./kitFlow";
import { cappedShown } from "./notifications/notices";
import { customizeKit, meterFraction, meterSegmentsLit, missingKitParts, uiKitVars, type UiKit } from "./uiKit";
import { arcadeKit } from "./uiKitArcade";
import { broadcastKit } from "./uiKitBroadcast";
import { holoKit } from "./uiKitHolo";
import { inkKit } from "./uiKitInk";
import { paperKit } from "./uiKitPaper";
import { parchmentKit } from "./uiKitParchment";
import { plainKit } from "./uiKitPlain";
import { KitActionPrompt, KitButton, kitHudBridge, KitMenu, KitMeter, KitMinimapFrame, KitPanel, KitPrompt, KitToast, UiKitRoot, useActionGlyph } from "./uiKitRoot";
import { resolveUiKit, UI_KITS, type UiKitName } from "./uiKits";
import { UiKitsPreview } from "./uiKitsPreview";
import { signalKit } from "./uiKitSignal";
import { terminalKit } from "./uiKitTerminal";

const NAMES = Object.keys(UI_KITS) as UiKitName[];

function everyPart(kit: UiKit): string {
  return renderToStaticMarkup(
    <UiKitRoot kit={kit} bindings={{ interact: ["KeyE", "pad:0"] }}>
      {(["primary", "secondary", "ghost"] as const).map((variant) =>
        (["sm", "md", "lg"] as const).map((size) => (
          <KitButton key={variant + size} variant={variant} size={size} glyph="E" icon="★" tone="bad" pressed disabled={size === "sm"}>
            Go
          </KitButton>
        )),
      )}
      {(["hud", "card", "dialog", "pane", "strip"] as const).map((variant) => (
        <KitPanel key={variant} variant={variant} eyebrow="E" title="T" aside="A" footer="F" tone="warn" leaving={variant === "strip"}>
          Body
        </KitPanel>
      ))}
      {(["bar", "segments", "ring"] as const).map((variant) => (
        <KitMeter key={variant} variant={variant} value={3} max={4} label="L" readout tone="good" size="lg" />
      ))}
      {(["keyboard", "gamepad", "touch"] as const).map((device) => (
        <KitPrompt key={device} device={device} glyph="E" label="Take" progress={0.5} onActivate={device === "touch" ? () => undefined : undefined} />
      ))}
      <KitActionPrompt action="interact" label="Take parcel" />
      {(["neutral", "accent", "good", "warn", "bad"] as const).map((tone) => (
        <KitToast key={tone} tone={tone} title="T" icon="!" count={3} leaving={tone === "bad"}>
          Message
        </KitToast>
      ))}
      {(["title", "pause", "list"] as const).map((variant) => (
        <KitMenu
          key={variant}
          variant={variant}
          activeId="a"
          itemProps={(id) => ({ "data-test-item": id })}
          onSelect={() => undefined}
          items={[
            { id: "a", label: "Alpha", hint: "h", badge: "New" },
            { id: "b", label: "Beta", disabled: true },
            { id: "c", label: "Quit", secondary: true },
          ]}
        />
      ))}
      {(["circle", "square"] as const).map((shape) => (
        <KitMinimapFrame key={shape} size={120} shape={shape} label="Harbor" heading={1}>
          <i>map</i>
        </KitMinimapFrame>
      ))}
    </UiKitRoot>,
  );
}

describe("built-in UI kits", () => {
  test("there are eight, each complete, with all seven cue sounds", () => {
    expect(NAMES).toHaveLength(8);
    for (const name of NAMES) {
      const kit = UI_KITS[name];
      expect(kit.id).toBe(name);
      expect(missingKitParts(kit)).toEqual([]);
      expect(Object.keys(kit.sounds).sort()).toEqual([...UI_CUES].sort());
      expect(kit.name.length).toBeGreaterThan(0);
    }
  });

  test("every part renders in every variant without throwing", () => {
    for (const name of NAMES) {
      const html = everyPart(UI_KITS[name]);
      expect(html).toContain(`data-jg-kit="${name}"`);
      expect(html).toContain("Alpha");
      expect(html).toContain('data-test-item="a"');
      expect(html).toContain("<i>map</i>");
      expect(html).toContain('data-state="closed"');
    }
  });

  test("class names and keyframes stay inside each kit's own prefix", () => {
    for (const name of NAMES) {
      const css = UI_KITS[name].css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/url\([^)]*\)/g, "");
      const classes = [...css.matchAll(/\.(-?[a-z_][\w-]*)/gi)].map((match) => match[1]!).filter((cls) => !/^\d/.test(cls));
      const foreign = classes.filter((cls) => !cls.startsWith(`jgk-${name}`));
      expect({ name, foreign: [...new Set(foreign)] }).toEqual({ name, foreign: [] });
      for (const match of css.matchAll(/@keyframes\s+([\w-]+)/g)) expect(match[1]!.startsWith(`jgk-${name}-`)).toBe(true);
    }
  });

  test("the kit contract never draws text under 12px", () => {
    for (const name of NAMES) {
      for (const match of UI_KITS[name].css.matchAll(/calc\((\d+(?:\.\d+)?)px \* var\(--kit-text\)\)/g)) {
        expect({ name, size: Number(match[1]) >= 12 }).toEqual({ name, size: true });
      }
    }
  });

  test("resolveUiKit takes a name or a kit", () => {
    expect(resolveUiKit("paper")).toBe(UI_KITS.paper);
    const custom = customizeKit(UI_KITS.ink, { tokens: { accent: "#ff00aa" } });
    expect(resolveUiKit(custom)).toBe(custom);
  });

  test("the registry holds each kit module's own export, and the plain fallback is complete too", () => {
    expect(UI_KITS).toEqual({ ink: inkKit, paper: paperKit, parchment: parchmentKit, terminal: terminalKit, holo: holoKit, broadcast: broadcastKit, arcade: arcadeKit, signal: signalKit });
    expect(missingKitParts(plainKit)).toEqual([]);
    expect(everyPart(plainKit)).toContain('data-jg-kit="plain"');
  });

  test("panel titles may wrap: no kit forces a long title onto one line past its panel", () => {
    for (const name of ["ink", "paper", "holo", "broadcast"] as const) {
      const rule = UI_KITS[name].css.match(new RegExp(`\\.jgk-${name}-title \\{[^}]*\\}`))?.[0] ?? "";
      expect({ name, nowrap: rule.includes("nowrap") }).toEqual({ name, nowrap: false });
    }
  });

  test("the contact sheet renders all eight", () => {
    const html = renderToStaticMarkup(<UiKitsPreview />);
    for (const name of NAMES) expect(html).toContain(`data-jg-kit="${name}"`);
  });
});

describe("customizeKit", () => {
  test("changes tokens, swaps a part and silences a cue without losing the rest", () => {
    const Button = () => <b>custom</b>;
    const kit = customizeKit(UI_KITS.ink, { tokens: { accent: "#123456" }, components: { Button }, css: ".jgk-ink-x{}", sounds: { hover: false }, motion: { enterMs: 1 } });
    expect(kit.tokens.accent).toBe("#123456");
    expect(kit.tokens.ink).toBe(UI_KITS.ink.tokens.ink);
    expect(kit.components.Button).toBe(Button);
    expect(kit.components.Panel).toBe(UI_KITS.ink.components.Panel);
    expect(kit.css.endsWith(".jgk-ink-x{}")).toBe(true);
    expect(kit.sounds.hover).toBeUndefined();
    expect(kit.sounds.click).toBeDefined();
    expect(kit.motion).toEqual({ ...UI_KITS.ink.motion, enterMs: 1 });
    expect(missingKitParts(kit)).toEqual([]);
  });

  test("tokens become --kit-* variables", () => {
    const vars = uiKitVars(UI_KITS.paper) as Record<string, string>;
    expect(vars["--kit-font-display"]).toBe(UI_KITS.paper.tokens.fontDisplay);
    expect(vars["--kit-surface-alt"]).toBe(UI_KITS.paper.tokens.surfaceAlt);
    expect(vars["--kit-enter-ms"]).toBe(`${UI_KITS.paper.motion.enterMs}ms`);
  });
});

describe("meters", () => {
  test("clamp and count lit cells", () => {
    expect(meterFraction(5, 10)).toBe(0.5);
    expect(meterFraction(20, 10)).toBe(1);
    expect(meterFraction(-1, 10)).toBe(0);
    expect(meterFraction(1, 0)).toBe(0);
    expect(meterSegmentsLit(6, 10, 8)).toBe(5);
  });
});

describe("prompts per device", () => {
  const map = { interact: ["KeyE", "pad:0"], jump: ["Space"] };
  test("keyboard, gamepad and touch glyphs", () => {
    expect(actionGlyph(map, "interact", "keyboard")).toBe("E");
    expect(actionGlyph(map, "interact", "gamepad")).toBe("A");
    expect(actionGlyph(map, "interact", "gamepad", "playstation")).toBe("Cross");
    expect(actionGlyph(map, "interact", "touch")).toBe("Tap");
    expect(actionGlyph(map, "jump", "gamepad")).toBeNull();
    expect(actionGlyph(map, "missing", "keyboard")).toBeNull();
  });

  test("useActionGlyph reads the kit root's bindings, with a fallback when unbound", () => {
    function Probe() {
      return <i>{useActionGlyph("interact") ?? "none"}|{useActionGlyph("pause", "P") ?? "none"}|{useActionGlyph("missing") ?? "none"}</i>;
    }
    const html = renderToStaticMarkup(
      <UiKitRoot kit={UI_KITS.ink} bindings={map}>
        <Probe />
      </UiKitRoot>,
    );
    expect(html).toContain("<i>E|P|none</i>");
  });

  test("an action prompt shows the bound key", () => {
    const html = renderToStaticMarkup(
      <UiKitRoot kit={UI_KITS.terminal} bindings={map}>
        <KitActionPrompt action="interact" label="Take parcel" />
      </UiKitRoot>,
    );
    expect(html).toContain("Take parcel");
    expect(html).toContain(">E<");
  });
});

describe("flow", () => {
  test("deadlines warn before they run out", () => {
    expect(deadlineStage({ remaining: 50, total: 60 })).toBe("calm");
    expect(deadlineStage({ remaining: 25, total: 60 })).toBe("warn");
    expect(deadlineStage({ remaining: 15, total: 60 })).toBe("urgent");
    expect(deadlineStage({ remaining: 9, total: 20 })).toBe("urgent");
    expect(deadlineStage({ remaining: 30, total: 60 }, 30)).toBe("urgent");
    expect(formatCountdown(65.2)).toBe("1:06");
    expect(formatCountdown(-3)).toBe("0:00");
  });

  test("the objective card shows goal, distance, countdown and the next action", () => {
    const html = renderToStaticMarkup(
      <UiKitRoot kit={UI_KITS.ink} bindings={{ interact: ["KeyE"] }}>
        <KitObjective title="Deliver to Shore Steps" distance={72.4} bearing={0.5} deadline={{ remaining: 12, total: 60 }} prompt={{ action: "interact", label: "Drop parcel" }} />
      </UiKitRoot>,
    );
    expect(html).toContain("Deliver to Shore Steps");
    expect(html).toContain("72 m");
    expect(html).toContain("0:12");
    expect(html).toContain('data-stage="urgent"');
    expect(html).toContain("Drop parcel");
    expect(html).toContain("data-jg-objective-arrow");
    expect(html).toContain("rotate(0.5rad)");
  });

  test("the result screen renders its tally and choices, and nothing when closed", () => {
    const props = { tone: "bad" as const, title: "Missed the tide", stats: [{ label: "Tips", value: "$64" }], actions: [{ id: "retry", label: "Try again", primary: true }, { id: "title", label: "Title" }], onAction: () => undefined };
    const html = renderToStaticMarkup(
      <UiKitRoot kit={UI_KITS.paper}>
        <KitResultScreen open {...props} />
      </UiKitRoot>,
    );
    expect(html).toContain("Missed the tide");
    expect(html).toContain("$64");
    expect(html).toContain("Try again");
    expect(renderToStaticMarkup(<KitResultScreen open={false} {...props} />)).toBe("");
    // The scrim sits over notices (z 85), so a toast never covers the result's title.
    expect(Number(html.match(/z-index:(\d+)/)?.[1])).toBeGreaterThan(85);
  });

  test("a kitted menu hands its panes the kit's colours, so engine settings read on light kits", () => {
    const html = renderToStaticMarkup(
      <UiKitRoot kit={UI_KITS.paper}>
        <GameMenu items={[{ id: "settings", label: "Settings" }]} onSelect={() => undefined} detail={<p>rows</p>} />
      </UiKitRoot>,
    );
    expect(html).toContain("--jg-text:var(--kit-ink)");
    expect(html).toContain("--jg-on-accent:var(--kit-accent-ink)");
    expect(html).toContain("<p>rows</p>");
  });

  test("a kitted menu pane scrolls inside the kit panel, so the panel's ground covers what scrolls", () => {
    const html = renderToStaticMarkup(
      <UiKitRoot kit={UI_KITS.parchment}>
        <GameMenu items={[{ id: "saves", label: "Saves" }]} onSelect={() => undefined} detail={<p>rows</p>} />
      </UiKitRoot>,
    );
    expect(html).toContain('<div data-jg-kit-pane-content=""><p>rows</p></div>');
    expect(html).toContain(":has([data-jg-kit-pane-content])");
    const panel = html.match(/<section[^>]*data-variant="pane"[^>]*>/)?.[0] ?? "";
    expect(panel).toContain("overflow:hidden");
  });

  test("the dialog bridge grounds a settings dialog on the kit's surface", () => {
    const dialog = kitHudBridge("dialog") as Record<string, string>;
    const pane = kitHudBridge("pane") as Record<string, string>;
    expect(dialog["--jg-surface"]).toBe("var(--kit-surface)");
    expect(dialog["--jg-surface-deep"]).toBe("var(--kit-surface-alt)");
    expect(pane["--jg-surface"]).toBe("var(--kit-surface-alt)");
    expect(dialog["--jg-text"]).toBe(pane["--jg-text"]);
    // Settings rows and tabs take the kit's corner and display type: square on ink, soft on paper.
    expect(pane["--jg-control-radius"]).toBe("var(--kit-radius, 8px)");
    expect(pane["--jg-control-font"]).toBe("var(--kit-font-display)");
    for (const name of Object.keys(UI_KITS) as UiKitName[]) expect({ name, radius: UI_KITS[name].tokens.radius !== undefined }).toEqual({ name, radius: true });
    expect(UI_KITS.ink.tokens.radius).toBe("0px");
  });

  test("the continue card keeps its name light on the picture and its saved line in the theme's dim text", () => {
    const html = renderToStaticMarkup(
      <ContinuePane slot={{ id: "a", name: "Mara Vell", empty: false, savedAt: 1_000, meta: { playtime: 90 } }} onContinue={() => undefined} now={() => 61_000} />,
    );
    const name = html.match(/<div data-continue-name=""[^>]*>/)?.[0] ?? "";
    expect(name).toContain("color:var(--jg-card-text, var(--jg-text, #f2f6fb))");
    expect(html.match(/<span data-continue-saved-at=""[^>]*>/)?.[0]).toContain("var(--jg-text-dim");
    expect(html.match(/<button[^>]*data-continue-action=""[^>]*>/)?.[0]).toContain("var(--jg-on-accent");
    // On a short pane the picture shrinks first, so Resume stays on screen.
    expect(html).toContain("flex-shrink:1;min-height:96px");
  });

  test("ink and paper heads keep the aside on the title's row however long the title is", () => {
    for (const name of ["ink", "paper"] as const) {
      const head = UI_KITS[name].css.match(new RegExp(`\\.jgk-${name}-panel-head \\{[^}]*\\}`))?.[0] ?? "";
      expect({ name, grid: head.includes("display: grid") }).toEqual({ name, grid: true });
      // Titles wrap between words, never mid-word ("DOWNT / OWN").
      const title = UI_KITS[name].css.match(new RegExp(`\\.jgk-${name}-title \\{[^}]*\\}`))?.[0] ?? "";
      expect({ name, wrap: title.includes("overflow-wrap: break-word") }).toEqual({ name, wrap: true });
    }
    // A long ink eyebrow ("WELCOME TO THE ISLE") pushes the title under it instead of squeezing it to a sliver.
    expect(UI_KITS.ink.css).toMatch(/\.jgk-ink-head-main \{[^}]*flex-wrap: wrap/);
    const html = renderToStaticMarkup(
      <UiKitRoot kit={UI_KITS.ink}><KitPanel eyebrow="Welcome to the isle" title="Find Marco under the downtown neon" aside="258 m" /></UiKitRoot>,
    );
    expect(html).toMatch(/<span class="jgk-ink-head-main"><span class="jgk-ink-eyebrow">Welcome to the isle<\/span><span class="jgk-ink-title">/);
  });
});

describe("notice cap", () => {
  test("keeps every leaving entry and the newest live ones", () => {
    const shown = [
      { id: 1, leaving: false },
      { id: 2, leaving: true },
      { id: 3, leaving: false },
      { id: 4, leaving: false },
      { id: 5, leaving: false },
    ];
    expect(cappedShown(shown, 2).map((entry) => entry.id)).toEqual([2, 4, 5]);
    expect(cappedShown(shown, 10)).toHaveLength(5);
  });
});
