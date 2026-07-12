import { useEffect, useRef, useState, type ReactNode } from "react";
import type { InventorySlot } from "@jgengine/core/inventory/inventoryModel";
import type { ProximityPrompt as ProximityPromptDef } from "@jgengine/core/interaction/proximityPrompt";
import {
  evaluateSkillCheck,
  type SkillCheckConfig,
  type SkillCheckResult,
} from "@jgengine/core/interaction/skillCheck";
import { pendingQteStep, type QteStep } from "@jgengine/core/interaction/qte";
import type { FeedEntry } from "@jgengine/core/game/feed";
import type { StatLevelUpEvent } from "@jgengine/core/game/events";
import { rollCheck, type CheckAdvantage, type CheckResult } from "@jgengine/core/stats/rollCheck";
import { useGameContext } from "./provider";
import { useCurrency, useEntityStat, useFeed, useInventory, useLocalPlayerDead } from "./hooks";
import { paintQteStepDom, paintSkillCheckDom } from "./skillCheckPaint";

export { paintQteStepDom, paintSkillCheckDom } from "./skillCheckPaint";

export function SlotGrid({
  inventoryId,
  className,
  renderSlot,
}: {
  inventoryId: string;
  className?: string;
  renderSlot?: (slot: InventorySlot, index: number) => ReactNode;
}) {
  const slots = useInventory(inventoryId);
  return (
    <div className={className} data-inventory={inventoryId}>
      {slots.map((slot, index) => (
        <div key={index} data-slot={index}>
          {renderSlot !== undefined
            ? renderSlot(slot, index)
            : slot !== null
              ? `${slot.itemId} x${slot.count}`
              : null}
        </div>
      ))}
    </div>
  );
}

export function HealthBar({
  instanceId,
  statId,
  className,
  fillClassName,
}: {
  instanceId: string;
  statId: string;
  className?: string;
  fillClassName?: string;
}) {
  const stat = useEntityStat(instanceId, statId);
  if (stat === null) return null;
  const range = stat.max - stat.min;
  const percent = range <= 0 ? 0 : ((stat.current - stat.min) / range) * 100;
  return (
    <div
      className={className}
      role="progressbar"
      aria-valuemin={stat.min}
      aria-valuemax={stat.max}
      aria-valuenow={stat.current}
      data-stat={statId}
    >
      <div className={fillClassName} style={{ width: `${percent}%`, height: "100%" }} />
    </div>
  );
}

export function CurrencyPill({ currencyId, className }: { currencyId: string; className?: string }) {
  const amount = useCurrency(currencyId);
  return (
    <span className={className} data-currency={currencyId}>
      {amount}
    </span>
  );
}

export function ProximityPrompt({
  prompt,
  className,
}: {
  prompt: ProximityPromptDef;
  className?: string;
}) {
  const display = prompt.display;
  if (display.kind === "keybind") {
    return (
      <span className={className} data-prompt="keybind" data-action={display.actionId}>
        <kbd>{display.actionId}</kbd>
        {display.label !== undefined ? <span data-prompt-label>{display.label}</span> : null}
      </span>
    );
  }
  if (display.kind === "gauge") {
    return (
      <span className={className} data-prompt="gauge" data-gauge={display.gaugeId}>
        {display.gaugeId}
      </span>
    );
  }
  return (
    <span className={className} data-prompt="label">
      {display.text}
    </span>
  );
}

export function Screen({
  id,
  open = true,
  className,
  children,
}: {
  id: string;
  open?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  if (!open) return null;
  return (
    <section className={className} data-screen={id}>
      {children}
    </section>
  );
}

export function KeybindRow({
  action,
  keys,
  className,
}: {
  action: string;
  keys: readonly string[];
  className?: string;
}) {
  return (
    <div className={className} data-action={action}>
      <span>{action}</span>
      {keys.map((key) => (
        <kbd key={key}>{key}</kbd>
      ))}
    </div>
  );
}

export interface DialogueCheck {
  label?: string;
  modifier: number;
  dc: number;
  advantage?: CheckAdvantage;
}

export interface DialogueChoice {
  label: string;
  invoke: { command: string; args?: unknown } | null;
  check?: DialogueCheck;
  onSuccess?: { command: string; args?: unknown } | null;
  onFailure?: { command: string; args?: unknown } | null;
}

export type DialogueLine = { speaker: string; text: string } | { choices: readonly DialogueChoice[] };

export interface DialogueDef {
  id: string;
  lines: readonly DialogueLine[];
}

export function resolveDialogueInvoke(
  choice: DialogueChoice,
  result: CheckResult | null,
): { command: string; args?: unknown } | null {
  if (result === null) return choice.invoke;
  return result.success ? (choice.onSuccess ?? choice.invoke) : (choice.onFailure ?? choice.invoke);
}

export function DialogueBox({
  dialogue,
  onChoice,
  rng,
  className,
  lineClassName,
  speakerClassName,
  choicesClassName,
  choiceClassName,
  checkClassName,
}: {
  dialogue: DialogueDef;
  onChoice?: (choice: DialogueChoice, result: CheckResult | null) => void;
  rng?: () => number;
  className?: string;
  lineClassName?: string;
  speakerClassName?: string;
  choicesClassName?: string;
  choiceClassName?: string;
  checkClassName?: string;
}) {
  return (
    <div className={className} data-dialogue={dialogue.id}>
      {dialogue.lines.map((line, index) =>
        "choices" in line ? (
          <div key={index} className={choicesClassName} data-choices>
            {line.choices.map((choice) => (
              <button
                key={choice.label}
                type="button"
                className={choiceClassName}
                data-dc={choice.check?.dc}
                onClick={() => onChoice?.(choice, choice.check === undefined ? null : rollCheck(choice.check, rng))}
              >
                <span>{choice.label}</span>
                {choice.check !== undefined && (
                  <span className={checkClassName} data-check>
                    {choice.check.label ?? "Check"} DC {choice.check.dc}
                    {choice.check.advantage !== undefined && choice.check.advantage !== "normal"
                      ? ` (${choice.check.advantage})`
                      : ""}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <p key={index} className={lineClassName}>
            <span className={speakerClassName} data-speaker>
              {line.speaker}
            </span>
            <span>{line.text}</span>
          </p>
        ),
      )}
    </div>
  );
}

export function SkillCheckBar({
  config,
  startedAt,
  className,
  trackClassName,
  zoneClassName,
  markerClassName,
  renderStatus,
}: {
  config: SkillCheckConfig;
  startedAt: number;
  className?: string;
  trackClassName?: string;
  zoneClassName?: string;
  markerClassName?: string;
  renderStatus?: (result: SkillCheckResult) => ReactNode;
}) {
  const ctx = useGameContext();
  const rootRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<SkillCheckResult | null>(null);
  const statusKeyRef = useRef("");
  useEffect(() => {
    let frame: number;
    const step = () => {
      const elapsed = Math.max(0, ctx.time.now() - startedAt);
      const result = evaluateSkillCheck(config, elapsed);
      const root = rootRef.current;
      const zone = zoneRef.current;
      const marker = markerRef.current;
      if (root !== null && zone !== null && marker !== null) {
        paintSkillCheckDom(root, zone, marker, config, result);
      }
      if (renderStatus !== undefined) {
        const key = `${result.success}:${result.timedOut}:${Math.round(result.markerPosition)}`;
        if (key !== statusKeyRef.current) {
          statusKeyRef.current = key;
          setStatus(result);
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [ctx, config, startedAt, renderStatus]);
  return (
    <div ref={rootRef} className={className} data-skill-check data-in-zone="false" data-timed-out="false">
      <div className={trackClassName} data-track style={{ position: "relative" }}>
        <div
          ref={zoneRef}
          className={zoneClassName}
          data-zone
          style={{ position: "absolute", left: "0%", width: "0%", height: "100%" }}
        />
        <div
          ref={markerRef}
          className={markerClassName}
          data-marker
          style={{ position: "absolute", left: "0%", height: "100%" }}
        />
      </div>
      {renderStatus !== undefined && status !== null ? renderStatus(status) : null}
    </div>
  );
}

export function QteTrack({
  steps,
  startedAt,
  className,
  stepClassName,
  activeClassName,
  doneClassName,
}: {
  steps: readonly QteStep[];
  startedAt: number;
  className?: string;
  stepClassName?: string;
  activeClassName?: string;
  doneClassName?: string;
}) {
  const ctx = useGameContext();
  const stepRefs = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    let frame: number;
    const step = () => {
      const elapsed = Math.max(0, ctx.time.now() - startedAt);
      const active = pendingQteStep(steps, elapsed);
      paintQteStepDom(
        stepRefs.current,
        steps,
        elapsed,
        active?.id ?? null,
        stepClassName,
        activeClassName,
        doneClassName,
      );
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [ctx, steps, startedAt, stepClassName, activeClassName, doneClassName]);
  return (
    <div className={className} data-qte>
      {steps.map((step) => (
        <div
          key={step.id}
          ref={(node) => {
            if (node === null) stepRefs.current.delete(step.id);
            else stepRefs.current.set(step.id, node);
          }}
          className={stepClassName}
          data-qte-step={step.id}
          data-active="false"
          data-done="false"
        >
          {step.action}
        </div>
      ))}
    </div>
  );
}

export function CaptureOdds({
  chance,
  className,
  fillClassName,
}: {
  chance: number;
  className?: string;
  fillClassName?: string;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, chance)) * 100);
  return (
    <div
      className={className}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      data-capture-odds={percent}
    >
      <div className={fillClassName} style={{ width: `${percent}%`, height: "100%" }} />
      <span data-capture-odds-label style={{ position: "relative", zIndex: 1 }}>
        {percent}%
      </span>
    </div>
  );
}

function defaultToast(entry: FeedEntry): ReactNode {
  const data = entry.data as
    | { drops?: { item?: string; currency?: string; count: number }[] }
    | undefined;
  if (data?.drops !== undefined) {
    return data.drops.map((drop) => `${drop.item ?? drop.currency ?? "item"} ×${drop.count}`).join("  ");
  }
  return typeof entry.data === "string" ? entry.data : JSON.stringify(entry.data);
}

export function ToastStack({
  action,
  limit = 4,
  className,
  renderToast,
}: {
  action: string;
  limit?: number;
  className?: string;
  renderToast?: (entry: FeedEntry, index: number) => ReactNode;
}) {
  const entries = useFeed({ action, limit });
  if (entries.length === 0) return null;
  const newestFirst = [...entries].reverse();
  return (
    <div className={className} data-toast-stack={action}>
      {newestFirst.map((entry, index) => (
        <div key={`${entry.at}-${index}`} data-toast>
          {renderToast !== undefined ? renderToast(entry, index) : defaultToast(entry)}
        </div>
      ))}
    </div>
  );
}

export function DeathScreen({
  statId = "health",
  open,
  className,
  children,
}: {
  statId?: string;
  open?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const dead = useLocalPlayerDead(statId);
  return (
    <Screen id="death" open={open ?? dead} className={className}>
      {children}
    </Screen>
  );
}

export function LevelUpFlash({
  stat,
  durationMs = 1600,
  className,
  children,
  renderFlash,
}: {
  stat?: string;
  durationMs?: number;
  className?: string;
  children?: ReactNode;
  renderFlash?: (event: StatLevelUpEvent) => ReactNode;
}) {
  const ctx = useGameContext();
  const [flash, setFlash] = useState<StatLevelUpEvent | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsubscribe = ctx.game.events.on("stat.levelUp", (event) => {
      if (stat !== undefined && event.stat !== stat) return;
      setFlash(event);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setFlash(null), durationMs);
    });
    return () => {
      unsubscribe();
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [ctx, stat, durationMs]);
  if (flash === null) return null;
  return (
    <div className={className} data-levelup={flash.level}>
      {renderFlash !== undefined ? renderFlash(flash) : children ?? `Level ${flash.level}`}
    </div>
  );
}
