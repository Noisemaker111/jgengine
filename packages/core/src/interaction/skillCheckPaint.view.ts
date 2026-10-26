import type { SkillCheckConfig, SkillCheckResult } from "@jgengine/core/interaction/skillCheck";
import type { QteStep } from "@jgengine/core/interaction/qte";

/** @internal */
export function paintSkillCheckDom(
  root: HTMLElement,
  zone: HTMLElement,
  marker: HTMLElement,
  config: SkillCheckConfig,
  result: SkillCheckResult,
): void {
  const zoneLeft = (result.zone.start / config.trackWidth) * 100;
  const zoneWidth = ((result.zone.end - result.zone.start) / config.trackWidth) * 100;
  const markerLeft = (result.markerPosition / config.trackWidth) * 100;
  zone.style.left = `${zoneLeft}%`;
  zone.style.width = `${zoneWidth}%`;
  marker.style.left = `${markerLeft}%`;
  root.dataset.inZone = result.success ? "true" : "false";
  root.dataset.timedOut = result.timedOut ? "true" : "false";
}

/** @internal */
export function paintQteStepDom(
  elements: ReadonlyMap<string, HTMLElement>,
  steps: readonly QteStep[],
  elapsed: number,
  activeId: string | null,
  stepClassName?: string,
  activeClassName?: string,
  doneClassName?: string,
): void {
  for (const step of steps) {
    const el = elements.get(step.id);
    if (el === undefined) continue;
    const isActive = activeId === step.id;
    const isDone = elapsed > step.windowEnd;
    const classes = [stepClassName, isActive ? activeClassName : isDone ? doneClassName : undefined]
      .filter(Boolean)
      .join(" ");
    if (classes.length > 0) el.className = classes;
    else el.removeAttribute("class");
    el.dataset.active = isActive ? "true" : "false";
    el.dataset.done = isDone ? "true" : "false";
  }
}
