/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useRef, useState } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneRoot, RuneTransient, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { registerNativeRuneFont } from "@jgengine/core/ui/rune/nativeSurface.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import { useInputDevice } from "@jgengine/core/input/inputDevice.view";
import { useSettings } from "@jgengine/core/settings/settings.view";
import { usePanels } from "@jgengine/core/ui/panels.view";
import { useGame, useGameClock, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";

import { GAME_FONTS } from "../../art/fonts/fonts";
import { currentHint } from "../onboarding";
import { session } from "../session";
import { BuildBar } from "./BuildBar";
import { Inspector } from "./Inspector";
import { ParkBooks, ParkGoal, ParkStatus } from "./ParkDashboard";
import { ParkFlow, resultOpen } from "./ParkFlow";
import { ResearchPanel } from "./ResearchPanel";
import { ParkMenu, parkFocus } from "./menu/ParkMenu";
import { ParkSettings } from "./menu/ParkSettings";
import { BUILD_PANEL, PARK_PANELS, RESEARCH_PANEL } from "./panels";
import { pointHint } from "./hintRing";
import { BAD, Button, Card, GOOD, Heading, INK, PAPER, Row, Tag, Text, parkTheme, stillTheme, WindowRoom } from "./look";

for (const face of [GAME_FONTS.display, GAME_FONTS.body]) if (face !== undefined) registerNativeRuneFont(resolveAssetBaseUrl(face.src));

const MOTION_KEY = "brightway-park.reduced-motion";
function savedMotion(): boolean { try { return localStorage.getItem(MOTION_KEY) === "true"; } catch { return false; } }

export function GameUI() {
  const ctx = useGameContext();
  const { commands } = useGame();
  const clock = useGameClock();
  const settings = useSettings();
  const started = useGameStore(() => session.started);
  const resultUp = useGameStore((c) => resultOpen(c));
  const [reducedMotion, setReducedMotion] = useState(savedMotion);
  // While the pause board or a result screen is up it owns the keys, so the palette hotkeys stand down.
  const panelDefs = useMemo(() => parkFocus.panel === null ? PARK_PANELS : PARK_PANELS.map((def) => ({ ...def, initial: def.id === parkFocus.panel || def.id === BUILD_PANEL })), []);
  const panels = usePanels(panelDefs, { hotkeys: started && !clock.paused && !resultUp });
  const notices = useMemo(() => ({ read: ctx.game.notices.list, subscribe: ctx.game.notices.subscribe }), [ctx]);
  const onReducedMotion = (next: boolean) => {
    setReducedMotion(next);
    try { localStorage.setItem(MOTION_KEY, String(next)); } catch { /* Preferences remain usable for this session. */ }
    commands.run("park.motion", { reduced: next });
  };
  return <RuneRoot context={ctx} theme={reducedMotion ? stillTheme : parkTheme}>
    {started ? <Hud panels={panels} paused={clock.paused} /> : null}
    <ParkMenu reducedMotion={reducedMotion} onReducedMotion={onReducedMotion} />
    <ParkFlow />
    {settings.isOpen ? <RuneView anchor="fill" fill="#14323888" modal onBack={settings.close} justify="center" items="center">
      <Card width={560} maxHeight={640} responsive={{ phone: { width: { fraction: 0.94 } } }} label="Settings">
        <Row justify="between"><Heading>Settings</Heading><Button tone="ghost" label="Close settings" onPress={settings.close}>×</Button></Row>
        <RuneView scroll gap={10} maxHeight={560}><ParkSettings reducedMotion={reducedMotion} onReducedMotion={onReducedMotion} /></RuneView>
      </Card>
    </RuneView> : null}
    <RuneView anchor="bottom" safe inset={0} padding={[0, 0, 250, 0]} gap={6} items="center" responsive={{ phone: { padding: [0, 0, 300, 0] } }}>
      <RuneTransient source={notices} expire={ctx.game.notices.prune}>{(notice) =>
        <RuneView fill={PAPER} radius={10} padding={[8, 14, 8, 14]} border={{ width: 2, color: notice.tone === "deny" ? BAD : notice.tone === "success" ? GOOD : INK }} maxWidth={420}>
          <Text weight={700} color={notice.tone === "deny" ? BAD : INK} align="center">{notice.count > 1 ? `${notice.text} ×${notice.count}` : notice.text}</Text>
        </RuneView>}
      </RuneTransient>
    </RuneView>
  </RuneRoot>;
}

type Panels = ReturnType<typeof usePanels>;

/** The live park: the status and goal cards, the hint, the clock, the side window, the palette and the touch camera. */
function Hud({ panels, paused }: { panels: Panels; paused: boolean }) {
  const { width, height } = useRuneViewport(), phone = width < 600;
  const inspecting = useGameStore((ctx) => session.selectedObject !== null || ctx.scene.entity.selection.list().length > 0);
  const books = panels.isOpen("books"), lab = panels.isOpen(RESEARCH_PANEL), side = inspecting || books || lab;
  const room = phone ? Math.round(height * 0.5) : height - 92 - (panels.isOpen(BUILD_PANEL) ? 262 : 16);
  const sideWindow = !side ? null : <WindowRoom value={room}>{inspecting ? <Inspector /> : books ? <ParkBooks onClose={() => panels.close("books")} /> : <ResearchPanel onClose={() => panels.close(RESEARCH_PANEL)} />}</WindowRoom>;
  const build = panels.isOpen(BUILD_PANEL) && !(phone && side);
  const openLab = () => { panels.close("books"); panels.open(RESEARCH_PANEL); };
  if (phone) return <>
    <RuneView anchor="top" safe inset={8} width={width - 16} gap={6}>
      <TimeBar panels={panels} />
      <ParkStatus />
      {/* A side window takes the lower half on a phone: the goal and hint cards step aside for it. */}
      {side ? null : <ParkGoal />}
      {side ? null : <ParkHint />}
    </RuneView>
    {side ? <RuneView anchor="bottom" safe inset={12}>{sideWindow}</RuneView> : null}
    {build ? <RuneView anchor="bottom" safe inset={8}><BuildBar onClose={() => panels.close(BUILD_PANEL)} onResearch={openLab} /></RuneView> : null}
    {!paused && !build && !side ? <RuneView anchor="bottom-right" safe inset={12}><CameraPad /></RuneView> : null}
  </>;
  return <>
    <RuneView anchor="top-left" safe inset={16} gap={10}><ParkStatus /><ParkGoal /></RuneView>
    <RuneView anchor="top" safe inset={16} padding={[64, 0, 0, 0]} maxWidth={440}><ParkHint /></RuneView>
    <RuneView anchor="top-right" safe inset={16} gap={10} items="end"><TimeBar panels={panels} />{sideWindow}</RuneView>
    {build ? <RuneView anchor="bottom-right" safe inset={16}><BuildBar onClose={() => panels.close(BUILD_PANEL)} onResearch={openLab} /></RuneView> : null}
    {!paused ? <RuneView anchor="bottom-right" safe inset={16}><CameraPad /></RuneView> : null}
  </>;
}

/** Pause, the clock speeds and the three windows. */
function TimeBar({ panels }: { panels: Panels }) {
  const { commands } = useGame();
  const clock = useGameClock();
  const phone = useRuneViewport().width < 600;
  return <RuneView layout="row" gap={4} padding={6} radius={12} fill="#fff4dae6" border={{ width: 2, color: "#edbc5c" }} label="Simulation controls" justify={phone ? "between" : "start"}>
    <Button label="Pause park" pressed={clock.paused} minHeight={34} padding={[4, 10, 4, 10]} onPress={() => commands.run("pauseToggle", {})}>II</Button>
    {clock.speeds.map((s) => <Button key={s} pressed={!clock.paused && clock.speed === s} minHeight={34} padding={[4, 8, 4, 8]} onPress={() => commands.run("park.speed", { speed: s })}>{`${s}×`}</Button>)}
    <Button tone="ghost" hint="hud:build" label="Build" pressed={panels.isOpen(BUILD_PANEL)} minHeight={34} onPress={() => panels.toggle(BUILD_PANEL)}>Build</Button>
    <Button tone="ghost" hint="hud:lab" label="Lab" pressed={panels.isOpen(RESEARCH_PANEL)} minHeight={34} onPress={() => panels.toggle(RESEARCH_PANEL)}>Lab</Button>
    <Button tone="ghost" label="Books" pressed={panels.isOpen("books")} minHeight={34} onPress={() => panels.toggle("books")}>Books</Button>
  </RuneView>;
}

/**
 * The first scenario's next step from the engine's onboarding: a card that says what to do, and a
 * ring on the control that does it (`hintRing`). The world arrow for a spot on the lot is drawn by
 * the world overlay from the same step. "Hide hints" skips the rest.
 */
function ParkHint() {
  const { commands } = useGame();
  const ctx = useGameContext();
  // The engine touches the store on every step change; the id is all that re-renders the card.
  const id = useGameStore((c) => currentHint(c)?.id ?? null);
  const step = id === null ? null : currentHint(ctx);
  useEffect(() => { pointHint(step?.ui ?? []); return () => pointHint([]); }, [id]);
  if (step === null) return null;
  return <Card padding={12} gap={4} role="status" label={`Next step: ${step.id}`} border={{ width: 2, color: "#ff5a3c" }}>
    <Row justify="between"><Tag>NEXT STEP</Tag><Button tone="ghost" label="Hide the hints" minHeight={26} padding={[2, 8, 2, 8]} onPress={() => commands.run("onboarding.skip", {})}><Text size={12} weight={800}>Hide hints</Text></Button></Row>
    <Text>{step.text}</Text>
  </Card>;
}

/** Touch-only camera keys: they feed the published RTS rig's existing keyboard input boundary. */
function CameraPad() {
  const touch = useInputDevice() === "touch";
  const held = useRef(new Set<string>());
  const release = () => {
    for (const code of held.current) window.dispatchEvent(new KeyboardEvent("keyup", { code }));
    held.current.clear();
  };
  const press = (code: string) => { release(); held.current.add(code); window.dispatchEvent(new KeyboardEvent("keydown", { code })); };
  useEffect(() => { window.addEventListener("blur", release); return () => { release(); window.removeEventListener("blur", release); }; }, []);
  if (!touch) return null;
  const zoom = (deltaY: number) => document.querySelector("canvas")?.dispatchEvent(new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true }));
  const key = (label: string, glyph: string, code: string) => <RuneAction key={code} variant="ticket" label={label} width={44} height={44} padding={0}
    onDrag={(d) => { if (d.phase === "down") press(code); else if (d.phase === "up" || d.cancelled) release(); }}><Text weight={800} size={18}>{glyph}</Text></RuneAction>;
  const tap = (label: string, glyph: string, run: () => void) => <RuneAction variant="ticket" label={label} width={44} height={44} padding={0} run={run}><Text weight={800} size={18}>{glyph}</Text></RuneAction>;
  return <RuneView layout="grid" columns={3} gap={4} label="Camera navigation">
    {key("Rotate camera left", "↶", "KeyQ")}{key("Pan camera up", "↑", "ArrowUp")}{key("Rotate camera right", "↷", "KeyE")}
    {key("Pan camera left", "←", "ArrowLeft")}{tap("Zoom camera in", "+", () => zoom(-100))}{key("Pan camera right", "→", "ArrowRight")}
    {tap("Zoom camera out", "−", () => zoom(100))}{key("Pan camera down", "↓", "ArrowDown")}
  </RuneView>;
}
