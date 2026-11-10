import type { BrowserFlow, FlowKey } from "@jgengine/core/play/flow";
import type { ProbeReadings } from "@jgengine/core/game/playableGame";

/**
 * One step of a UI tour: every screen of the game's UI visited and shot once. The same steps run
 * on the DOM and on Rune (`--param ui=rune`) and at any width (`--device mobile`); shots are named
 * `tour-<ui>-<width>-<screen>` so the two runs sit side by side.
 */
export type TourStep =
  | { shot: string }
  /** Press the control whose text or accessible name contains this. */
  | { tap: string; arrive?: string }
  /** Press that control when the layout has it (a phone layout's back button), and go on when it does not. */
  | { tapIf: string }
  /** Press the first element matching this selector. */
  | { tapOn: string; arrive?: string }
  | { press: FlowKey; arrive?: string }
  /** Wait until this page expression is true. */
  | { until: string }
  /** Type letters into the field matching `field`, whose DOM label is `label`. */
  | { type: string; field: string; label: string };

const centre = (pick: string): string => `(() => {
  const el = ${pick};
  if (el == null) return null;
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0 ? [box.x + box.width / 2, box.y + box.height / 2] : null;
})()`;

const named = (label: string): string => `(() => {
  const want = ${JSON.stringify(label.toLowerCase())};
  // A menu row's number is not part of its name, and of two controls with one name the later in
  // the page wins: a menu mounts after the HUD it covers.
  const name = (el) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().toLowerCase().replace(/^\d+\s*/, "");
  // A control that shows the words beats an icon button that only carries them as its label.
  const written = (el) => ((el.textContent ?? "").toLowerCase().includes(want) ? 0 : 1);
  const laid = (el) => { const box = el.getBoundingClientRect(); return box.width > 0 && box.height > 0; };
  return [...document.querySelectorAll("button, [role=switch], [role=button], [role=tab], [role=menuitem], a[href]")]
    .filter((el) => name(el).includes(want) && laid(el))
    .reverse()
    .sort((a, b) => written(a) - written(b) || name(a).length - name(b).length)[0] ?? null;
})()`;

export async function uiTour<TProbe extends ProbeReadings>(f: BrowserFlow<TProbe>, steps: readonly TourStep[]): Promise<void> {
  const tag = String(await f.page("(new URLSearchParams(location.search).get('ui') ?? 'dom') + '-' + innerWidth"));
  // `--param still=1` switches CSS animations off, to see the screens behind an entrance animation
  // the Rune mirror holds at its first frame. Without it the run shows what a player gets.
  await f.page("new URLSearchParams(location.search).get('still') === '1' && document.head.append(Object.assign(document.createElement('style'), { textContent: '*, *::before, *::after { animation: none !important; }' }))");

  // A press on the first element a selector matches, at the middle of its box.
  const pressAt = async (pick: string, what: string): Promise<void> => {
    const at = await f.waitForPage(`${centre(pick)} ?? false`, { timeoutMs: 15000, note: `a laid-out ${what}` });
    const [x, y] = at as [number, number];
    await f.clickAt(x, y);
  };
  const arrived = async (step: { arrive?: string }, what: string): Promise<void> => {
    await f.wait(700);
    if (step.arrive !== undefined) await f.waitForPage(step.arrive, { timeoutMs: 15000, note: `arrival after ${what}: ${step.arrive}` });
  };

  // A failed step is kept and the tour goes on, so one broken screen does not hide the ones after it.
  const failures: string[] = [];
  const attempt = async (what: string, work: () => Promise<void>): Promise<void> => {
    try {
      await work();
    } catch (error) {
      failures.push(`${what}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
      console.log(`degraded: ui-tour ${tag} ${what} failed and the tour went on`);
    }
  };

  for (const step of steps) await attempt(JSON.stringify(step), async () => {
    if ("shot" in step) await f.shot(`tour-${tag}-${step.shot}`);
    else if ("until" in step) await f.waitForPage(step.until, { timeoutMs: 40000 });
    else if ("tapIf" in step) {
      if (await f.page(`${named(step.tapIf)} === null`)) return;
      await f.click(step.tapIf);
      await f.wait(700);
    } else if ("tap" in step) {
      await f.click(step.tap);
      await arrived(step, `pressing "${step.tap}"`);
    } else if ("tapOn" in step) {
      await pressAt(`document.querySelector(${JSON.stringify(step.tapOn)})`, step.tapOn);
      await arrived(step, `pressing ${step.tapOn}`);
    } else if ("press" in step) {
      await f.press(step.press);
      await arrived(step, `the key`);
    } else {
      const value = `document.querySelector(${JSON.stringify(step.field)}).value.toLowerCase()`;
      await f.fill(step.label, step.type);
      await f.wait(500);
      await f.shot(`tour-${tag}-typed`);
      await f.expectPage(value, `arrival: the typed text reached ${step.field}`, step.type.toLowerCase());
    }
  });
  console.log(`ui-tour ${tag}: not drawn by the Rune mirror:`, JSON.stringify(await f.page("window.__jgRuneStage?.report.lines() ?? []"), null, 1));
  if (failures.length > 0) throw new Error(`ui-tour ${tag}: ${failures.length} step(s) failed\n  ${failures.join("\n  ")}`);
}
