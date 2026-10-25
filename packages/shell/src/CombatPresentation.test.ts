import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";

import { CombatPresentation } from "./CombatPresentation";
import { resolvePresentationEffects } from "./presentationResolve";
import { HitMarkers, MuzzleFlashes } from "./world/ShotFeedback";

function mounted(config: Parameters<typeof resolvePresentationEffects>[0]): unknown[] {
  const root = CombatPresentation({ effects: resolvePresentationEffects(config) }) as ReactElement<{ children: unknown[] }>;
  return root.props.children.flat().filter(Boolean).map((child) => (child as ReactElement).type);
}

describe("CombatPresentation", () => {
  test("hit markers mount by default; muzzle flash comes with tracers", () => {
    expect(mounted(undefined)).toContain(HitMarkers);
    expect(mounted(undefined)).not.toContain(MuzzleFlashes);
    expect(mounted({ tracers: true })).toContain(MuzzleFlashes);
  });

  test("a game can turn either off", () => {
    expect(mounted({ hitMarkers: false })).not.toContain(HitMarkers);
    expect(mounted({ tracers: true, muzzleFlash: false })).not.toContain(MuzzleFlashes);
  });
});
