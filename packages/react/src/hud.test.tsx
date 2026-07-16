import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createAbilityKit } from "@jgengine/core/combat/abilityKit";
import { defineGame } from "@jgengine/core/game/defineGame";
import { createGameContext } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";

import { GameProvider } from "./provider";
import { AbilityButton, StatBar } from "./hud";
import { useHudTick } from "./hooks";

function makeContext() {
  return createGameContext({
    definition: defineGame({ name: "HudTest", assets: createAssetCatalog(), multiplayer: "off" }),
    content: {},
    player: { userId: "user_a", isNew: true },
  });
}

function renderBar(props: Parameters<typeof StatBar>[0]): string {
  const ctx = makeContext();
  return renderToStaticMarkup(createElement(GameProvider, { context: ctx }, createElement(StatBar, props)));
}

describe("StatBar raw value/max variant", () => {
  test("renders the fill fraction and readout from raw numbers, ignoring entity stats", () => {
    const markup = renderBar({ value: 40, max: 100, label: "Boss" });
    expect(markup).toContain("width:40%");
    expect(markup).toContain("40");
    expect(markup).toContain("/ 100");
    expect(markup).toContain("Boss");
  });

  test("clamps the fill to [0,1] and defaults max to 100", () => {
    expect(renderBar({ value: 150 })).toContain("width:100%");
    expect(renderBar({ value: -5, max: 100 })).toContain("width:0%");
  });

  test("honors a non-zero min when resolving the fraction", () => {
    expect(renderBar({ value: 75, min: 50, max: 100 })).toContain("width:50%");
  });

  test("entity-bound form still renders nothing when the stat is absent", () => {
    expect(renderBar({ statId: "health" })).toBe("");
  });
});

describe("StatBar skin overrides", () => {
  test("a constant fill overrides the draining health tone", () => {
    const markup = renderBar({ value: 10, max: 100, tone: "health", fill: "#1eb838" });
    expect(markup).toContain("background:#1eb838");
    expect(markup).not.toContain("dc2626"); // no low-health red ramp
  });

  test("chromeless drops the glass panel and honors rail height + inside label", () => {
    const markup = renderBar({ value: 30, max: 60, chromeless: true, railHeight: 15, labelPlacement: "inside", label: "Boss" });
    expect(markup).not.toContain("backdrop-filter"); // no PANEL chrome
    expect(markup).toContain("height:15px");
    expect(markup).toContain("Boss");
    expect(markup).toContain("width:50%");
  });

  test("capped forces a full bar and swaps to the capped fill", () => {
    const markup = renderBar({ value: 10, max: 100, capped: true, fill: "#b85eff", fillCapped: "#c9941a" });
    expect(markup).toContain("width:100%");
    expect(markup).toContain("background:#c9941a");
  });

  test("underlay renders a second fill behind the main one", () => {
    const markup = renderBar({ value: 40, max: 100, underlay: { fraction: 0.7, color: "#4a9eff66" } });
    expect(markup).toContain("width:70%");
    expect(markup).toContain("#4a9eff66");
    expect(markup).toContain("width:40%");
  });
});

function renderButton(props: Parameters<typeof AbilityButton>[0]): string {
  return renderToStaticMarkup(createElement(AbilityButton, props));
}

describe("AbilityButton", () => {
  test("a ready slot renders an enabled button with no cooldown overlay", () => {
    const kit = createAbilityKit([{ id: "fire", cooldownMs: 1000 }]);
    const markup = renderButton({ kit, slotId: "fire", label: "Fire", keyHint: "Q" });
    expect(markup).toContain('data-ability="fire"');
    expect(markup).not.toContain("disabled");
    expect(markup).toContain("Fire");
    expect(markup).not.toContain("conic-gradient"); // no cooldown → no sweep overlay
  });

  test("a slot on cooldown disables the button and shows remaining seconds", () => {
    const kit = createAbilityKit([{ id: "fire", cooldownMs: 2000 }]);
    kit.cast("fire");
    kit.tick(0.5); // 1.5s remaining, flash cleared
    const markup = renderButton({ kit, slotId: "fire" });
    expect(markup).toContain("disabled");
    expect(markup).toContain("1.5");
    expect(markup).toContain("conic-gradient");
  });

  test("insufficient resource tints and disables the slot", () => {
    const kit = createAbilityKit([{ id: "blast", cooldownMs: 500, resourceCost: 30 }]);
    const markup = renderButton({ kit, slotId: "blast", resourceAvailable: 10 });
    expect(markup).toContain("disabled");
    expect(markup).toContain("rgba(37,99,235");
  });

  test("locked state greys out, blocks activation, and shows the lock label", () => {
    const kit = createAbilityKit([{ id: "ult", cooldownMs: 500 }]);
    const markup = renderButton({ kit, slotId: "ult", locked: true, lockLabel: "Lv 6" });
    expect(markup).toContain("disabled");
    expect(markup).toContain("Lv 6");
    expect(markup).toContain('data-locked="true"');
  });

  test("vertical sweep renders a bottom-up fill instead of a radial wedge", () => {
    const kit = createAbilityKit([{ id: "fire", cooldownMs: 2000 }]);
    kit.cast("fire");
    kit.tick(0.5);
    const markup = renderButton({ kit, slotId: "fire", sweep: "vertical" });
    expect(markup).not.toContain("conic-gradient");
    expect(markup).toContain("height:75%");
  });

  test("cooldownText override reformats the remaining-seconds label", () => {
    const kit = createAbilityKit([{ id: "fire", cooldownMs: 2000 }]);
    kit.cast("fire");
    kit.tick(0.5); // 1.5s remaining
    const markup = renderButton({ kit, slotId: "fire", cooldownText: (ms) => `${Math.ceil(ms / 1000)}` });
    expect(markup).toContain(">2<"); // ceil(1.5) = 2, not "1.5"
    expect(markup).not.toContain("1.5");
  });

  test("noResourceStyle replaces the blue overlay with a root-level tint", () => {
    const kit = createAbilityKit([{ id: "blast", cooldownMs: 500, resourceCost: 30 }]);
    const markup = renderButton({ kit, slotId: "blast", resourceAvailable: 10, noResourceStyle: { color: "#ff8f85" } });
    expect(markup).not.toContain("rgba(37,99,235"); // default overlay suppressed
    expect(markup).toContain("color:#ff8f85");
  });

  test("chromeless drops the glass panel and keeps the game's className skin", () => {
    const kit = createAbilityKit([{ id: "fire", cooldownMs: 500 }]);
    const markup = renderButton({ kit, slotId: "fire", chromeless: true, className: "wcc-slot" });
    expect(markup).not.toContain("backdrop-filter");
    expect(markup).toContain("wcc-slot");
  });

  test("external dim greys the button without a kit group cooldown", () => {
    const kit = createAbilityKit([{ id: "fire", cooldownMs: 500 }]);
    const markup = renderButton({ kit, slotId: "fire", dimmed: true });
    expect(markup).toContain("opacity:0.82");
  });

  test("keepEnabled leaves a non-castable button interactive for drag", () => {
    const kit = createAbilityKit([{ id: "blast", cooldownMs: 500, resourceCost: 30 }]);
    const markup = renderButton({ kit, slotId: "blast", resourceAvailable: 0, keepEnabled: true, draggable: true });
    expect(markup).not.toContain("disabled");
    expect(markup).toContain("draggable");
  });

  test("wrapKeyHint=false renders the hint node raw (no Keycap wrapper)", () => {
    const kit = createAbilityKit([{ id: "fire", cooldownMs: 500 }]);
    const raw = renderButton({ kit, slotId: "fire", keyHint: createElement("kbd", { className: "gold-cap" }, "1"), wrapKeyHint: false });
    expect(raw).toContain("gold-cap");
  });
});

describe("useHudTick", () => {
  test("is SSR-safe and returns an initial tick without a window timer", () => {
    function Ticker() {
      const tick = useHudTick(50);
      return createElement("span", { "data-tick": tick });
    }
    const markup = renderToStaticMarkup(createElement(Ticker));
    expect(markup).toContain('data-tick="0"');
  });
});
