/** What `fastForward` needs from a flow: a page check and a command. */
interface Driver {
  page(expression: string): Promise<unknown>;
  command(name: string, input: unknown): Promise<unknown>;
}

/**
 * Run the park's own ticks forward (`park.dev.advance`) in steps until a page check holds, or the
 * game-time budget runs out. A software renderer runs the clock at a few game seconds a minute, so a
 * flow that waits out real game time (a ghost settling, a ride wearing out) steps the sim instead.
 * The flow's own wait after it still checks the result.
 */
export async function fastForward(f: Driver, check: string, gameSeconds = 120, step = 10): Promise<void> {
  for (let spent = 0; spent < gameSeconds; spent += step) {
    if ((await f.page(check)) === true) return;
    await f.command("park.dev.advance", { seconds: step });
  }
}
