import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AchievementGallery, AchievementToast } from "./achievements";
import { createAchievementTracker, type AchievementView } from "@jgengine/core/game/achievements";

function views(): readonly AchievementView[] {
  const tracker = createAchievementTracker({
    defs: [
      { id: "first-blood", name: "First Blood", points: 10 },
      { id: "centurion", name: "Centurion", description: "Defeat 100 foes", target: 100, points: 50 },
      { id: "secret-ending", name: "True Ending", secret: true, points: 100 },
    ],
    now: () => 1,
  });
  tracker.unlock("first-blood");
  tracker.progress("centurion", 40);
  return tracker.list();
}

describe("AchievementGallery", () => {
  test("renders each achievement with unlocked state and a completion/score header", () => {
    const html = renderToStaticMarkup(createElement(AchievementGallery, { achievements: views() }));
    expect(html).toContain('data-achievement="first-blood"');
    expect(html).toContain('data-unlocked="true"');
    expect(html).toContain('data-unlocked="false"');
    expect(html).toContain("1/3"); // one of three unlocked
    expect(html).toContain("10 pts"); // score = unlocked points only
  });

  test("shows a progress bar for a partially-completed counter achievement", () => {
    const html = renderToStaticMarkup(createElement(AchievementGallery, { achievements: views() }));
    expect(html).toContain("data-achievement-progress");
    expect(html).toContain("width:40%"); // 40 / 100
  });

  test("masks a secret, still-locked achievement", () => {
    const html = renderToStaticMarkup(createElement(AchievementGallery, { achievements: views() }));
    expect(html).toContain("???");
    expect(html).not.toContain("True Ending");
  });

  test("maskSecrets=false reveals the secret name", () => {
    const html = renderToStaticMarkup(createElement(AchievementGallery, { achievements: views(), maskSecrets: false }));
    expect(html).toContain("True Ending");
  });

  test("empty gallery renders the empty label", () => {
    const html = renderToStaticMarkup(createElement(AchievementGallery, { achievements: [], emptyLabel: "Nothing here" }));
    expect(html).toContain("Nothing here");
    expect(html).toContain("0/0");
  });
});

describe("AchievementToast", () => {
  test("renders the unlock banner with heading, name, and points", () => {
    const html = renderToStaticMarkup(
      createElement(AchievementToast, { name: "First Blood", description: "Land the first hit", points: 10 }),
    );
    expect(html).toContain("data-achievement-toast");
    expect(html).toContain("Achievement Unlocked");
    expect(html).toContain("First Blood");
    expect(html).toContain("Land the first hit");
    expect(html).toContain("10");
  });
});
