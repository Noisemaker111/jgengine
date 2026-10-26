import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createWaveRunner } from "@jgengine/core/waves/waveRunner";
import { createComboMeter } from "@jgengine/core/combat/comboMeter";
import { createDialogueRun } from "@jgengine/core/dialogue/dialogueGraph";
import { createTalentTree } from "@jgengine/core/talents/talents";
import { createTimerSet } from "@jgengine/core/time/timerSet";
import { createCameraShake } from "@jgengine/core/camera/shake/cameraShake";

import { CameraShakeMeter } from "@jgengine/core/camera/shake/cameraShake.view";
import { ComboMeterHud } from "@jgengine/core/hud/comboMeter.view";
import { DialogueView } from "../../dialogue/dialogueView.view";
import { Crosshair } from "@jgengine/core/hud/hudReadouts.view";
import { KitWaveClock } from "@jgengine/core/hud/kitHud.view";
import { HudChromePreview } from "@jgengine/core/hud/hudChromePreview.view";
import { HudSkinPreview } from "@jgengine/core/hud/hudSkinPreview.view";
import { StatusEffectBar } from "@jgengine/core/hud/statusEffectBar.view";
import { TalentTreePanel } from "../../talents/talentTree.view";
import { TimerReadout, TimerRing } from "../../time/timerReadout.view";
import { WaveHud } from "@jgengine/core/hud/waveHud.view";

// The widgets whose bars moved onto KitMeter and whose colours moved off the retired `--jg-bar-*`
// tokens: each still renders, draws its meter through the kit, and reads no removed token.
function render(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  const html = renderToStaticMarkup(node);
  expect(html).not.toContain("--jg-bar-");
  return html;
}

describe("widgets on KitMeter", () => {
  test("the camera shake meter draws its trauma as a kit meter", () => {
    const shake = createCameraShake({ seed: "t", decayPerSecond: 0, maxTranslation: [1, 1, 1], maxRotation: [0.1, 0.1, 0.1], frequency: 10 });
    expect(render(<CameraShakeMeter controller={shake} />)).toContain('role="meter"');
  });

  test("the combo meter draws its window as a kit meter", () => {
    const combo = createComboMeter({ windowMs: 60_000, tiers: [{ id: "good", min: 1 }], count: 3 });
    expect(render(<ComboMeterHud meter={combo} />)).toContain('role="meter"');
  });

  test("the wave HUD draws its alert as a kit meter", () => {
    const runner = createWaveRunner({ seed: 1, maxAlive: 4, waves: [{ budget: 10, duration: 5, entries: [{ id: "grunt", cost: 2 }] }], onSpawn: () => {} });
    expect(render(<WaveHud runner={runner} />)).toContain('role="meter"');
  });

  test("text widgets take the shared text token", () => {
    const run = createDialogueRun({ start: "a", nodes: [{ id: "a", speaker: "Mara", text: "Hold the wall." }] });
    expect(render(<DialogueView run={run} />)).toContain("Hold the wall.");
    const tree = createTalentTree({ nodes: [{ id: "grit", maxRank: 2 }], points: 1 });
    expect(render(<TalentTreePanel tree={tree} nodes={[{ id: "grit", maxRank: 2 }]} />)).toContain("var(--jg-text");
    expect(render(<StatusEffectBar effects={[{ id: "burn", kind: "burn", remainingMs: 2000, durationMs: 4000, stacks: 1 }]} />)).toContain("burn");
    const timers = createTimerSet();
    expect(render(<TimerReadout timer={timers} id="round" />)).toContain("var(--jg-text");
    expect(render(<TimerRing timer={timers} id="round" />)).toContain("--jg-surface-deep");
  });

  test("the stock HUD pieces and the chrome previews render", () => {
    expect(render(<KitWaveClock text="Wave 2" detail="6 left" />)).toContain("6 left");
    render(<Crosshair />);
    expect(render(<HudChromePreview />)).toContain('role="meter"');
    expect(render(<HudSkinPreview />)).toContain("data-hud-skin-preview");
  });
});
