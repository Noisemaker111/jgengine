import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { GameProvider } from "@jgengine/react/provider";

import type { OnboardingConfig } from "./onboarding";
import { OnboardingCallout } from "./onboardingCallout.view";
import { createOnboardingSystem } from "./onboardingSystem";

const TOUR: OnboardingConfig<GameContext> = {
  id: "tour",
  title: "Tour",
  style: "blended",
  steps: [
    { id: "welcome", text: "Welcome", detail: "Take the tour.", done: { next: true } },
    { id: "bag", text: "Your bag", anchor: "#bag", placement: "top", done: { next: true } },
    { id: "walk", text: "Walk to the gate", target: { at: [5, 0, 5] }, done: { when: () => false } },
  ],
};

function boot(): GameContext {
  const definition = defineGameDefinition({ name: "Callout test", multiplayer: "off", inventories: {}, systems: [createOnboardingSystem(TOUR)] });
  const ctx = createGameContext({ definition, content: {}, player: { userId: "p1", isNew: true } });
  definition.loop?.onInit?.(ctx);
  return ctx;
}

const render = (ctx: GameContext): string => renderToStaticMarkup(createElement(GameProvider, { context: ctx }, createElement(OnboardingCallout)));

describe("OnboardingCallout", () => {
  test("shows a Next step as a card with its counter, text, detail, Next and Skip", () => {
    const html = render(boot());
    expect(html).toContain('data-onboarding-callout="welcome"');
    expect(html).toContain("1 of 3");
    expect(html).toContain("Welcome");
    expect(html).toContain("Take the tour.");
    expect(html).toContain(">Next<");
    expect(html).toContain("Skip tour");
  });

  test("Next moves the card to the anchored step; a world step shows no card", () => {
    const ctx = boot();
    expect(ctx.game.commands.run("onboarding.next", {}).status).toBe("applied");
    expect(render(ctx)).toContain('data-onboarding-callout="bag"');
    ctx.game.commands.run("onboarding.next", {});
    expect(render(ctx)).toBe("");
  });

  test("skipping the tour removes the card", () => {
    const ctx = boot();
    ctx.game.commands.run("onboarding.skip", {});
    expect(render(ctx)).toBe("");
  });
});
