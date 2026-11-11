/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "@jgengine/core/ui/jsx";
import { continueGame, menuPane, newGame, openTitle, playGame, runPlayed, saveNow, showMenuPane, type MenuPane } from "@jgengine/core/game/gameFlow";
import { adjustSettingRow } from "@jgengine/core/settings/settingAdjustment";
import { useSettings, type SettingsRow } from "@jgengine/core/settings/settings.view";
import { RuneAction, RuneLayers, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind, createRuneFlow, type RuneFlow } from "@jgengine/core/ui/rune/primitives";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGameStore } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";

import { BRIEFING, CONTROLS, CREDITS } from "../controls";
import { Creator } from "./Creator";
import { Button, CYAN, DIM, DISPLAY, FULL, GOLD, Heading, INK, Panel, Row, Small, Tag, Text, TEAL } from "./kit";

/** Session key that reopens the creator after the page restarts for a second New game. */
const SETUP_AFTER_RESTART = "jgengine:new-game-setup";

/** New game in a page: a second run reloads so nothing from the first carries over. */
function startNewGame(ctx: GameContext): Promise<void> {
  return newGame(ctx, () => location.reload());
}

function setupAfterRestart(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  const pending = sessionStorage.getItem(SETUP_AFTER_RESTART) === "1";
  sessionStorage.removeItem(SETUP_AFTER_RESTART);
  return pending;
}

const ROUTES = {
  main: { layer: "screen", pause: false, capture: true },
  controls: { layer: "screen", pause: false, capture: true },
  settings: { layer: "screen", pause: false, capture: true },
  credits: { layer: "screen", pause: false, capture: true },
  creator: { layer: "screen", pause: false, capture: true },
} as const;
type Route = keyof typeof ROUTES;

/** Pages swap at once: a fade's bound opacity is only resampled while frames run, and a settled page must show fully. */
const INSTANT = { duration: 0, distance: 0 };

/** Back one page; the menu's own page stays (a press can arrive twice while the page leaves). */
function back(flow: RuneFlow): void {
  if (flow.read().length > 1) flow.pop();
}

/** The route the title opens on before any choice; headless captures set it to show a page. */
export const titleRoute: { first: Route | null } = { first: null };

const paneOf = (route: string | undefined): MenuPane | null => (route === "controls" || route === "settings" || route === "credits" ? route : null);

/** A flow for one menu, its pane mirrored both ways with the game's state, so probes and the `menu.pane` command agree. */
function useMenuFlow(first: Route | null): RuneFlow {
  const ctx = useGameContext();
  const pane = useGameStore((c) => menuPane(c));
  const flow = useMemo(() => {
    const f = createRuneFlow(ROUTES);
    f.push("main");
    const opening = menuPane(ctx) ?? first;
    if (opening !== null) f.push(opening);
    return f;
  }, []);
  useEffect(() => flow.subscribe(() => {
    const next = paneOf(flow.read().at(-1)?.kind);
    if (next !== menuPane(ctx)) showMenuPane(ctx, next);
  }), [ctx, flow]);
  useEffect(() => {
    const top = flow.read().at(-1)?.kind;
    if (pane === paneOf(top) || top === "creator") return;
    if (paneOf(top) !== null) flow.pop();
    if (pane !== null) flow.push(pane);
  }, [pane, flow]);
  useEffect(() => () => showMenuPane(ctx, null), [ctx]);
  return flow;
}

function ControlsList(): ReactNode {
  return (
    <RuneView gap={7}>
      {CONTROLS.map(([keys, does]) => (
        <Row key={keys} gap={14} items="start">
          <Text width={150} shrink weight={700} tracking={0.6} text={keys} />
          <Text grow={1} shrink color={DIM} text={does} />
        </Row>
      ))}
    </RuneView>
  );
}

function CreditsList(): ReactNode {
  return (
    <RuneView gap={12}>
      {CREDITS.sections.map((section) => (
        <RuneView key={section.heading} gap={4}>
          <Tag text={section.heading} />
          {section.entries.map((entry) => <Small key={entry.label} color={INK} text={[entry.label, entry.detail, entry.href].filter(Boolean).join(" · ")} />)}
        </RuneView>
      ))}
      {CREDITS.notice === undefined ? null : <Small text={CREDITS.notice} />}
    </RuneView>
  );
}

function Briefing(): ReactNode {
  return (
    <RuneView gap={10}>
      {BRIEFING.map((line, index) => (
        <Row key={line} gap={10} items="start">
          <Text width={18} weight={700} color={TEAL} text={`${index + 1}.`} />
          <Text grow={1} shrink size={15} text={line} />
        </Row>
      ))}
    </RuneView>
  );
}

/** One settings row: a slider dragged or nudged with arrow keys, or a choice that steps on each press. */
function Setting({ row }: { row: SettingsRow }): ReactNode {
  const min = row.min ?? 0;
  const max = row.max ?? 1;
  const fraction = useRef((Number(row.value) - min) / Math.max(1e-6, max - min));
  fraction.current = (Number(row.value) - min) / Math.max(1e-6, max - min);
  const shown = row.kind === "toggle" ? (row.value ? "On" : "Off") : (row.options?.find((o) => o.value === row.value)?.label ?? String(row.value));
  const adjust = (delta: -1 | 1) => {
    const next = adjustSettingRow(row, delta);
    if (next !== undefined) row.set(next);
  };
  const value = () => min + fraction.current * (max - min);
  return (
    <RuneView gap={5}>
      <Row justify="between">
        <Text grow={1} shrink text={row.label} />
        <Text color={GOLD} text={row.kind === "slider" ? bind(() => row.format?.(value()) ?? value().toFixed(2)) : shown} />
      </Row>
      {row.kind !== "slider" ? (
        <Button label={row.label} justify="start" run={() => adjust(1)}>{`${shown} ›`}</Button>
      ) : (
        <RuneAction label={row.label} height={30} fill="#0d1417" radius={4} padding={[11, 0, 11, 0]} onAdjust={adjust}
          onDrag={(d) => {
            if (d.cancelled) {
              fraction.current = (Number(row.value) - min) / Math.max(1e-6, max - min);
              return;
            }
            fraction.current = Math.max(0, Math.min(1, d.x / Math.max(1, d.width)));
            if (d.phase === "up") row.set(Math.min(max, Math.max(min, min + Math.round((value() - min) / (row.step ?? 1)) * (row.step ?? 1))));
          }}>
          <RuneView height={8} radius={4} fill={CYAN} width={bind(() => ({ fraction: Math.max(0.01, fraction.current) }))} />
        </RuneAction>
      )}
    </RuneView>
  );
}

/** The engine's settings (graphics, sound, keys, accessibility) composed as Fernwild's own page. */
export function SettingsPage(): ReactNode {
  const settings = useSettings();
  const [chosen, setChosen] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const active = settings.categories.find((c) => c.id === chosen) ?? settings.categories[0];
  return (
    <RuneView gap={12} {...(armed === null ? {} : { onKey: (code: string) => { if (code !== "Escape") active?.keybinds.find((k) => k.action === armed)?.rebind(code); setArmed(null); } })}>
      <RuneView layout="grid" columns={4} responsive={{ phone: { columns: 2 } }} gap={6}>
        {settings.categories.map((c) => <Button key={c.id} picked={c === active} run={() => setChosen(c.id)}>{c.label}</Button>)}
      </RuneView>
      {active?.rows.map((row) => <Setting key={row.id} row={row} />)}
      {active?.keybinds.map((k) => (
        <Row key={k.action} gap={6}>
          <Text grow={1} shrink text={k.label} />
          <Button disabled={k.locked === true} label={`Rebind ${k.label}`} run={() => setArmed(k.action)}>{armed === k.action ? "Press a key · Esc cancels" : k.bindingLabel}</Button>
          <Button disabled={k.locked === true || k.isDefault} label={`Reset ${k.label}`} run={k.reset}>Reset</Button>
        </Row>
      ))}
      {settings.actions.map((a) => <Button key={a.id} run={a.run}>{a.label}</Button>)}
    </RuneView>
  );
}

/** The page under each route: its heading, what it shows, and Back. */
function Page({ title, back, children }: { title: string; back: () => void; children: ReactNode }): ReactNode {
  const { width, height } = useRuneViewport();
  return (
    <RuneView anchor="center" width={Math.min(720, width - 24)} maxHeight={height - 24}>
      <Panel gap={12} padding={18}>
        <Row justify="between"><Heading text={title} /><Button run={back}>Back</Button></Row>
        <RuneView scroll maxHeight={height - 120} gap={10}>{children}</RuneView>
      </Panel>
    </RuneView>
  );
}

/** A verb on the title or pause list. */
function Verb({ label, hint, disabled, run }: { label: string; hint?: string; disabled?: boolean; run: () => void }): ReactNode {
  return (
    <RuneAction label={label} disabled={disabled === true} run={run} padding={[8, 14, 8, 14]} radius={4} fill="#0c181dcc" border={{ width: 1, color: "#6fb7c944" }} hover="#3fd0c933" press="#00000030" gap={1}>
      <Text family={DISPLAY} size={20} weight={600} tracking={1.2} color={INK} text={label.toUpperCase()} />
      {hint === undefined ? null : <Small text={hint} />}
    </RuneAction>
  );
}

/** Title screen over the standing island: Continue opens the save, New game the creator, then Controls, Settings and Credits. */
export function TitleMenu(): ReactNode {
  const ctx = useGameContext();
  const { width, height } = useRuneViewport();
  const phone = width < 600;
  const flow = useMenuFlow(setupAfterRestart() ? "creator" : titleRoute.first);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void ctx.game.save?.hasSave().then(setSaved);
  }, [ctx]);
  const startNew = () => {
    if (runPlayed(ctx)) {
      sessionStorage.setItem(SETUP_AFTER_RESTART, "1");
      location.reload();
      return;
    }
    flow.push("creator");
  };
  return (
    <RuneLayers flow={flow} transition={INSTANT}>
      {(entry) =>
        entry.kind === "creator" ? (
          <Creator begin={() => void startNewGame(ctx)} back={() => back(flow)} />
        ) : entry.kind !== "main" ? (
          <RuneView anchor="fill" fill="#03090bcc">
            <Page title={entry.kind === "controls" ? "Controls" : entry.kind === "settings" ? "Settings" : "Credits"} back={() => back(flow)}>
              {entry.kind === "controls" ? <ControlsList /> : entry.kind === "settings" ? <SettingsPage /> : <CreditsList />}
            </Page>
          </RuneView>
        ) : (
          <RuneView anchor="fill" gradient={{ angle: 90, stops: [[0, "#02090bdd"], [0.55, "#02090b66"], [1, "#02090b00"]] }} onBack={() => {}}>
            <RuneView anchor={phone ? "center" : "left"} safe inset={phone ? 16 : 56} maxHeight={height - 24} scroll>
              <RuneView layout={phone ? "stack" : "row"} gap={phone ? 16 : 48} items="start">
                <RuneView gap={14} width={phone ? width - 32 : 360}>
                  <RuneView gap={2}>
                    <Tag color={TEAL} text="WAKE ON THE BEACH. SURVIVE THE ISLAND." />
                    <Text family={DISPLAY} size={phone ? 54 : 84} weight={700} tracking={2} color={INK} text="FERNWILD" />
                    <Text size={15} color={DIM} text="Gather, craft, learn engrams, build, and tame the island's dinosaurs." />
                  </RuneView>
                  <RuneView gap={6}>
                    <Verb label="Continue" hint={saved ? "Back where you left off" : "No save yet"} disabled={!saved} run={() => void continueGame(ctx)} />
                    <Verb label="New game" hint="Start from nothing" run={startNew} />
                    <Verb label="Controls" run={() => flow.push("controls")} />
                    <Verb label="Settings" hint="Graphics, sound, keys" run={() => flow.push("settings")} />
                    <Verb label="Credits" run={() => flow.push("credits")} />
                  </RuneView>
                </RuneView>
                <Panel width={phone ? width - 32 : 440} padding={18} gap={12}>
                  <Tag text="How a run goes" />
                  <Briefing />
                </Panel>
              </RuneView>
            </RuneView>
          </RuneView>
        )
      }
    </RuneLayers>
  );
}

/** Pause: resume, save, the controls, settings, or back to the title (the save keeps the run). */
export function PauseMenu(): ReactNode {
  const ctx = useGameContext();
  const flow = useMenuFlow(null);
  const [note, setNote] = useState("");
  return (
    <RuneLayers flow={flow} transition={INSTANT}>
      {(entry) =>
        entry.kind !== "main" ? (
          <RuneView anchor="fill" fill="#03090bcc">
            <Page title={entry.kind === "controls" ? "Controls" : entry.kind === "settings" ? "Settings" : "Credits"} back={() => back(flow)}>
              {entry.kind === "controls" ? <ControlsList /> : entry.kind === "settings" ? <SettingsPage /> : <CreditsList />}
            </Page>
          </RuneView>
        ) : (
          <RuneView anchor="fill" fill="#02090bb8" onBack={() => playGame(ctx)} label="Paused">
            <RuneView anchor="center" width={300} gap={6}>
              <Text family={DISPLAY} size={44} weight={700} tracking={2} align="center" text="PAUSED" />
              <Verb label="Resume" run={() => playGame(ctx)} />
              <Verb label="Save" run={() => void saveNow(ctx).then(() => setNote("Saved"))} />
              <Verb label="Controls" run={() => flow.push("controls")} />
              <Verb label="Settings" run={() => flow.push("settings")} />
              <Verb label="Quit to title" run={() => void saveNow(ctx).then(() => openTitle(ctx))} />
              <Small align="center" color={GOLD} text={note} />
            </RuneView>
          </RuneView>
        )
      }
    </RuneLayers>
  );
}
