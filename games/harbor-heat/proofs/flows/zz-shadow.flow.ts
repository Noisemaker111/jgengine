import { defineFlow } from "@jgengine/core/play/flow";
import { game } from "../../src/game.config";

/** Shadow-cache counters after a still settle: how many casters stay dynamic and what the check costs. */
export default defineFlow(game, {
  browser: true,
  async run(f) {
    await f.waitFor((p) => p.x !== 0 || p.z !== 0, { timeoutMs: 30000 });
    await f.wait(4000);
    const snap = (await f.rpc({ method: "debug_snapshot" })) as { snapshot?: Record<string, unknown> };
    const inner = (snap.snapshot ?? {}) as { systems?: Record<string, unknown>; probes?: Record<string, unknown> };
    console.log(`zz-shadow systems=${JSON.stringify(Object.keys(inner.systems ?? {})).slice(0, 600)}`);
    console.log(`zz-shadow probes=${JSON.stringify(Object.keys(inner.probes ?? {})).slice(0, 600)}`);
    const cache = (inner.systems ?? {})["render/shadow-cache"] ?? (inner.probes ?? {})["render/shadow-cache"];
    console.log(`zz-shadow cache=${JSON.stringify(cache)?.slice(0, 900)}`);
  },
});
