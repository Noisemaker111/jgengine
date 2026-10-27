import { catenaryCurve } from "@jgengine/core/world/catenary";
import { poleA, poleB } from "./myWorld";

const slack = 0.22; // 0.1 = 10% longer than taut

export const points = catenaryCurve(
  [poleA.x, 6, poleA.z],
  [poleB.x, 6, poleB.z],
  slack,
  56,
);
