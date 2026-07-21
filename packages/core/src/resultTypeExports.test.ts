import { describe, expect, test } from "bun:test";
import {
  canAfford,
  charge,
  chargeAll,
  createEmptyWallet,
  grant,
  type ChargeOptions,
  type ChargeResult,
  type Overdraft,
} from "@jgengine/core/gameplay";
import {
  resolveDefense,
  resolveShot,
  type DefenseResolution,
  type ResolvedShot,
} from "@jgengine/core/combat";

// Regression guard for #1319: the result/option types of these public barrel
// functions must be importable from the same barrel that exports the function,
// so a consumer never has to reach for ReturnType<>/Parameters<> gymnastics.
// The `type` annotations below only compile if the types are genuinely
// re-exported; `check-types` enforces that, and the runtime asserts back it up.
describe("public result/option types are re-exported (#1319)", () => {
  test("gameplay barrel: charge types annotate real values", () => {
    expect(typeof canAfford).toBe("function");
    expect(typeof charge).toBe("function");
    expect(typeof chargeAll).toBe("function");

    const wallet = grant(createEmptyWallet(), "gold", 10);
    expect(canAfford(wallet, { gold: 5 })).toBe(true);

    const opts: ChargeOptions = { overdraft: true };
    const overdraft: Overdraft = { max: 3 };
    const result: ChargeResult = charge(wallet, "gold", 5, opts);
    expect(result.status).toBe("ok");
    const all: ChargeResult = chargeAll(wallet, { gold: 5 }, opts);
    expect(all.status).toBe("ok");
    expect(overdraft.max).toBe(3);
  });

  test("combat barrel: defense/shot result types annotate real values", () => {
    expect(typeof resolveDefense).toBe("function");
    expect(typeof resolveShot).toBe("function");

    // Types are usable in annotations (compile-time proof of the re-export).
    const _defense: DefenseResolution | undefined = undefined;
    const _shot: ResolvedShot | null = null;
    expect(_defense).toBeUndefined();
    expect(_shot).toBeNull();
  });
});
