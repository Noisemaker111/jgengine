import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";

import { CombatPresentation } from "./CombatPresentation";
import { resolvePresentationEffects } from "./presentationResolve";
import { HitMarkers, MuzzleFlashes } from "./world/ShotFeedback";
import { CorpseRagdolls } from "./render/CorpseRagdolls";

function mounted(config: Parameters<typeof resolvePresentationEffects>[0]): unknown[] {
  const fragment = CombatPresentation({ effects: resolvePresentationEffects(config) }) as ReactElement<{ children: unknown[] }>;
  const children = fragment.props.children.flat().filter(Boolean) as ReactElement<{ children?: unknown }>[];
  const group = children.find((child) => child.type === "group") as ReactElement<{ children: unknown[] }>;
  return [...group.props.children.flat().filter(Boolean), ...children.filter((child) => child !== group)].map((child) => (child as ReactElement).type);
}

describe("CombatPresentation", () => {
  test("hit markers mount by default; muzzle flash comes with tracers", () => {
    expect(mounted(undefined)).toContain(HitMarkers);
    expect(mounted(undefined)).not.toContain(MuzzleFlashes);
    expect(mounted({ tracers: true })).toContain(MuzzleFlashes);
  });

  test("fallen bodies come with the impact layer and can be turned off alone", () => {
    expect(mounted(undefined)).toContain(CorpseRagdolls);
    expect(mounted({ impacts: { ragdolls: false } })).not.toContain(CorpseRagdolls);
    expect(mounted({ impacts: false })).not.toContain(CorpseRagdolls);
  });

  test("a game can turn either off", () => {
    expect(mounted({ hitMarkers: false })).not.toContain(HitMarkers);
    expect(mounted({ tracers: true, muzzleFlash: false })).not.toContain(MuzzleFlashes);
  });
});
