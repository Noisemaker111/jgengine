import { expect, test } from "bun:test";
import { createVitals } from "@jgengine/core/stats/vitals";

import { SURVIVOR, survivorVitals } from "./survivor";

test("held under, breath lasts its seconds, then drowning takes health; at the surface it refills", () => {
  const body = createVitals(survivorVitals());
  const under = { extra: [{ vital: "oxygen", rate: -SURVIVOR.oxygen / SURVIVOR.breathSeconds }], regen: { oxygen: 0 } };
  const flags: string[] = [];
  for (let second = 0; second < SURVIVOR.breathSeconds - 1; second += 1) for (const change of body.tick(1, under)) if (change.raised) flags.push(change.id);
  expect(body.value("oxygen")).toBeGreaterThan(0);
  expect(body.value("health")).toBe(SURVIVOR.health);
  for (let second = 0; second < 6; second += 1) for (const change of body.tick(1, under)) if (change.raised) flags.push(change.id);
  expect(flags).toContain("drowning");
  expect(body.value("health")).toBeLessThan(SURVIVOR.health - 10);
  for (let second = 0; second < 15; second += 1) body.tick(1);
  expect(body.value("oxygen")).toBe(SURVIVOR.oxygen);
  expect(body.has("drowning")).toBe(false);
});
