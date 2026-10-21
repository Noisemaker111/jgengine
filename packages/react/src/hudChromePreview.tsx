import { actionCooldownFromFraction, actionCost, resolveAction } from "@jgengine/core/ui/actionModel";

import { ActionButton } from "./actionHud";
import { HealthBar, ManaBar } from "./bars";
import { HudButton } from "./hudButton";
import { HudFrame } from "./hudFrame";
import { HudSurface } from "./hudSurface";
import { HudThemeRoot } from "./hudThemeRoot";
import { ConfirmDialog, PauseMenu } from "./modals";
import { Window } from "./panels";
import { TweenNumber } from "./tweenNumber";

const ACTIONS = [
  resolveAction({ id: "slash", label: "Slash", icon: "⚔", hotkey: "1" }),
  resolveAction({ id: "guard", label: "Guard", icon: "⛨", hotkey: "2", active: true }),
  resolveAction({ id: "bolt", label: "Bolt", icon: "⚡", hotkey: "3", costs: [actionCost("mana", 30, 50)] }),
  resolveAction({ id: "heal", label: "Heal", icon: "✚", hotkey: "4", cooldown: actionCooldownFromFraction(4200, 0.6) }),
  resolveAction({ id: "nova", label: "Nova", icon: "✺", hotkey: "5", costs: [actionCost("mana", 80, 50)] }),
];
const noop = () => undefined;

/**
 * The shared HUD chrome under the shell's default root theme, from static values: a glass frame with
 * vitals and a counter, an action bar, a window, a confirm dialog, a pause menu, and the button
 * variants. Screenshots identically; the before/after evidence for theme and primitive changes.
 */
export function HudChromePreview({ className }: { className?: string }) {
  return (
    <div
      className={className}
      style={{ position: "relative", width: "100%", height: "100%", minHeight: 720, overflow: "hidden", background: "radial-gradient(ellipse at 30% 20%, #3b5a46, #1b2a24 55%, #0f1714)" }}
    >
      <HudThemeRoot>
        <div style={{ position: "absolute", left: 24, top: 24, width: 280 }}>
          <HudFrame title="Warden · Lv 12" aside={<TweenNumber value={12480} />} padding={12}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <HealthBar value={78} max={100} label="HP" width="100%" />
              <ManaBar value={50} max={80} label="MP" width="100%" />
            </div>
          </HudFrame>
        </div>
        <div style={{ position: "absolute", left: 24, bottom: 24, display: "flex", gap: 8 }}>
          {ACTIONS.map((action, index) => (
            <ActionButton key={action.id} action={action} focused={index === 0} />
          ))}
        </div>
        <Window title="Inventory" x={340} y={24} width={260} closable onClose={noop}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
            {Array.from({ length: 10 }, (_, index) => (
              <div key={index} style={{ aspectRatio: "1", background: "var(--jg-slot-bg)", border: "var(--jg-slot-border)", borderRadius: "var(--jg-slot-radius)" }} />
            ))}
          </div>
        </Window>
        <div style={{ position: "absolute", left: 640, top: 24 }}>
          <ConfirmDialog title="Abandon the expedition?" body="Your haul stays in the wagon, but the crew returns home." confirmLabel="Abandon" danger onConfirm={noop} onCancel={noop} />
        </div>
        <div style={{ position: "absolute", left: 1040, top: 24 }}>
          <PauseMenu onResume={noop} items={[{ id: "settings", label: "Settings", onSelect: noop }, { id: "quit", label: "Quit to title", onSelect: noop, danger: true }]} />
        </div>
        <div style={{ position: "absolute", left: 340, top: 300 }}>
          <HudSurface title="Buttons" padding={14}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: 420 }}>
              <HudButton variant="primary">Deploy</HudButton>
              <HudButton>Inspect</HudButton>
              <HudButton variant="ghost">Skip</HudButton>
              <HudButton variant="danger">Scrap</HudButton>
              <HudButton disabled>Locked</HudButton>
              <HudButton size="sm">Small</HudButton>
            </div>
          </HudSurface>
        </div>
      </HudThemeRoot>
    </div>
  );
}
