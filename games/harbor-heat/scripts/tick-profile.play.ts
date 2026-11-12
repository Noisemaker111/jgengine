// Temporary profiling script (frame-pacing #3022): start the game and walk for 60 s of sim time.
const g = globalThis as unknown as { __tickReport?: () => { ticks: number; sums: Record<string, number> }; __tickReset?: () => void };
let last = 0;
let total = 0;
let worst = 0;
let counted = 0;
const WARM = 600;
const END = 10799;
export default {
  seed: "harbor-heat",
  dt: 1 / 60,
  ticks: 10800,
  setup(ctx: import("@jgengine/core/runtime/gameContext").GameContext) {
    ctx.game.commands.run("game.start");
  },
  onTick(_ctx: unknown, tick: number) {
    const now = performance.now();
    if (tick === WARM) g.__tickReset?.();
    if (tick > WARM) {
      const ms = now - last;
      total += ms;
      counted += 1;
      if (ms > worst) worst = ms;
    }
    last = now;
    if (tick === END) {
      const report = g.__tickReport?.();
      const rows = Object.entries(report?.sums ?? {}).sort((a, b) => b[1] - a[1]);
      console.error(`TICKPROF whole step avg ${(total / counted).toFixed(3)} ms, worst ${worst.toFixed(2)} ms over ${counted} ticks; game onTick calls ${report?.ticks}`);
      let named = 0;
      for (const [name, ms] of rows) {
        named += ms;
        console.error(`TICKPROF ${name.padEnd(26)} ${(ms / counted).toFixed(4)} ms/tick`);
      }
      console.error(`TICKPROF game systems sum ${(named / counted).toFixed(3)} ms/tick`);
    }
  },
  steps: [
    { tick: 1, action: "move", move: "forward", ticks: 10799 },
    { tick: 600, action: "aim", yaw: 1.2 },
    { tick: 1500, action: "aim", yaw: -0.8 },
    { tick: 2600, action: "aim", yaw: 2.4 },
  ],
  expect: [],
};
