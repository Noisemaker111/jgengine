import { useEffect, useRef, useState, type ReactNode } from "react";
import type { InventorySlot } from "@jgengine/core/inventory/inventoryModel";
import type { ProximityPrompt as ProximityPromptDef } from "@jgengine/core/interaction/proximityPrompt";
import type { FeedEntry } from "@jgengine/core/game/feed";
import type { StatLevelUpEvent } from "@jgengine/core/game/events";
import { useGameContext } from "./provider";
import { useCurrency, useEntityStat, useFeed, useInventory, useLocalPlayerDead } from "./hooks";

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

export interface DialogueChoice {
  label: string;
  invoke: { command: string; args?: unknown } | null;
}

export type DialogueLine = { speaker: string; text: string } | { choices: readonly DialogueChoice[] };

export interface DialogueDef {
  id: string;
  lines: readonly DialogueLine[];
}

export function DialogueBox({
  dialogue,
  onChoice,
  className,
}: {
  dialogue: DialogueDef;
  onChoice?: (choice: DialogueChoice) => void;
  className?: string;
}) {
  return (
    <div className={className} data-dialogue={dialogue.id}>
      {dialogue.lines.map((line, index) =>
        "choices" in line ? (
          <div key={index} data-choices>
            {line.choices.map((choice) => (
              <button key={choice.label} type="button" onClick={() => onChoice?.(choice)}>
                {choice.label}
              </button>
            ))}
          </div>
        ) : (
          <p key={index}>
            <span data-speaker>{line.speaker}</span>
            <span>{line.text}</span>
          </p>
        ),
      )}
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
