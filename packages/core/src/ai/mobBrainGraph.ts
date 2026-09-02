import type { DecisionGraph } from "./decisionGraph";

/** Graph-shaped description of the mob brain's idle, wander, chase, engage, and evade decisions. */
export const mobBrainGraph: DecisionGraph = {
  kind: "selector",
  children: [
    { kind: "sequence", children: [
      { kind: "condition", key: "evading", op: "=", value: true },
      { kind: "action", action: "evade" },
    ] },
    { kind: "sequence", children: [
      { kind: "condition", key: "targetId", op: "!=", value: "" },
      { kind: "selector", children: [
        { kind: "sequence", children: [
          { kind: "condition", key: "leashExceeded", op: "=", value: true },
          { kind: "action", action: "evade" },
        ] },
        { kind: "sequence", children: [
          { kind: "condition", key: "inAttackRange", op: "=", value: true },
          { kind: "action", action: "engage" },
        ] },
        { kind: "action", action: "chase" },
      ] },
    ] },
    { kind: "action", action: "wanderOrIdle" },
  ],
};
