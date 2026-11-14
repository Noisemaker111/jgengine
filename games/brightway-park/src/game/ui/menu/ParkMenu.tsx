/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useState } from "@jgengine/core/ui/jsx";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { suspendPlayControls } from "@jgengine/core/game/controlGate";
import { useGameContext } from "@jgengine/ui/provider";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { useGame, useGameStore } from "@jgengine/ui/hooks";
import { useSaveSlots, relativeSavedAt } from "@jgengine/core/save/saveSlots.view";
import type { SaveSlotMeta } from "@jgengine/core/save/saveSlots";

import { lookCredits } from "../../../art/look";
import { captureParkThumb, parkProfile } from "../../parkProfile";
import { parkSlots, refreshParkSlot } from "../../parkSlot";
import { FIRST_SCENARIO, SCENARIOS, scenarioDef, scenarioLock } from "../../scenarios";
import { session } from "../../session";
import { park } from "../../park";
import { parkFlags } from "../parkFlags";
import { resultOpen } from "../ParkFlow";
import { Button, CORAL, CREAM, DISPLAY, GOLD, Heading, INK, PENCIL, Row, SAND, SHADE, Tag, Text } from "../look";
import { ParkSettings } from "./ParkSettings";

/** Capture-only focus request: a shot declares which menu pane (`id`) and which HUD window (`panel`) it wants open. */
export const parkFocus: { id: string | null; panel: string | null } = { id: null, panel: null };

export interface ParkMenuProps {
  reducedMotion: boolean;
  onReducedMotion: (next: boolean) => void;
}

/**
 * The board's panes as a plain stack. Each press swaps the pane in the same commit: a layered flow
 * that fades a pane out commits its removal later from a timer, and on this Rune build that idle-time
 * tree change can go unpainted until the next input (see the PR notes).
 */
function usePanes(first: string, focus: string | null, panes: readonly string[]) {
  const [stack, setStack] = useState<readonly string[]>(() => focus !== null && panes.includes(focus) ? [first, focus] : [first]);
  return { pane: stack[stack.length - 1]!, push: (pane: string) => setStack((s) => [...s, pane]), pop: () => setStack((s) => s.length > 1 ? s.slice(0, -1) : s), depth: stack.length };
}

const CREDITS = [
  { heading: "Hauntworks", entries: [{ label: "The derelict seaside haunt", detail: "game and art direction" }] },
  { heading: "Models", entries: [
    { label: "Quaternius: Ultimate Animated Characters, Modular Street, Low Poly Food, Stylized Nature, Lowpoly Buildings, Fantasy Props, Low Poly Desert, Textured Cute Monsters", detail: "CC0", href: "https://quaternius.com" },
    { label: "KayKit City Builder", detail: "CC0", href: "https://kaylousberg.itch.io" }] },
  ...lookCredits(),
  { heading: "Engine", entries: [{ label: "JGengine", detail: "scene, save, menu" }] },
] as const;

/** The gate board behind every menu screen: the haunt's sign, a tagline and one pane at a time. */
function Board({ eyebrow, tagline, footer, children, onBack }: { eyebrow: string; tagline: string; footer: string; children: unknown; onBack?: () => void }) {
  const { width, height } = useRuneViewport(), phone = width < 600;
  const ctx = useGameContext();
  // The board owns the keys while it is up: the camera and palette hotkeys stand down.
  useEffect(() => suspendPlayControls(ctx), [ctx]);
  return <RuneView anchor="fill" fill={SHADE} padding={phone ? 12 : 40} justify="center" items="center" modal {...(onBack === undefined ? {} : { onBack })}>
    <RuneView variant="board" width={Math.min(760, width - (phone ? 24 : 80))} maxHeight={height - (phone ? 24 : 60)} gap={phone ? 10 : 14}>
      <Row justify="between"><Tag color={GOLD}>{eyebrow.toUpperCase()}</Tag><RuneView width={60} height={6} radius={3} fill={CORAL} /></Row>
      <RuneView gap={2}><Text family={DISPLAY} size={phone ? 44 : 68} color={CREAM}>Hauntworks</Text><Text color={GOLD} weight={700} size={phone ? 14 : 16}>{tagline}</Text></RuneView>
      <RuneView variant="card" scroll gap={10} maxHeight={height - (phone ? 210 : 260)} padding={phone ? 12 : 18}>{children as never}</RuneView>
      <Text size={12} color={PENCIL}>{footer}</Text>
    </RuneView>
  </RuneView>;
}

/** One menu verb: a wide ticket with its line of detail underneath. */
function Verb({ label, hint, disabled, onPress, primary }: { label: string; hint?: string | undefined; disabled?: boolean; onPress: () => void; primary?: boolean }) {
  return <Button tone={primary === true ? "primary" : "ticket"} disabled={disabled === true} items="start" padding={[8, 14, 8, 14]} onPress={onPress} label={label}>
    <Text family={DISPLAY} size={20}>{label}</Text>{hint === undefined ? null : <Text size={12} color={PENCIL}>{hint}</Text>}
  </Button>;
}

/** Hauntworks' front end: the haunt behind, the gate board in front. A pause board while the night is held. */
export function ParkMenu(props: ParkMenuProps) {
  const v = useGameStore((c) => { const flags = parkFlags(park.of(c)); return { paused: c.time.isPaused(), result: resultOpen(c), ended: flags.gameOver || flags.ribbon, started: session.started, status: session.saveStatus }; });
  if (v.started) return v.paused && !v.result ? <PauseBoard {...props} /> : null;
  return v.ended ? null : <TitleBoard {...props} />;
}

function TitleBoard(props: ParkMenuProps) {
  const { commands } = useGame();
  const day = useGameStore((c) => park.of(c).num("park.day"));
  const slots = useSaveSlots(parkSlots);
  const recent = slots.find((slot) => !slot.empty) ?? null;
  useEffect(() => { refreshParkSlot(); }, []);
  const flow = usePanes("main", parkFocus.id, ["new", "saves", "settings", "credits"]);
  const back = flow.pop;
  const scenario = (id: string) => { commands.run("park.scenario", { id }); commands.run("park.start", {}); };
  const savedDay = recent === null ? null : String(recent.meta["day"] ?? day ?? 1);
  {
    const pane = flow.pane;
    const footer = recent === null ? "Hauntworks · nothing saved yet" : `${recent.name ?? "Hauntworks"} · night ${savedDay}`;
    const tagline = "You are the ghost proprietor of a derelict seaside park. Scare the living out. Let the dead move in.";
    if (pane === "main") return <Board eyebrow="A derelict pier · after dark" tagline={tagline} footer={footer}>
      <Verb label="Continue" primary={recent !== null} disabled={recent === null} hint={recent === null ? "No haunt on the board" : `${recent.name ?? "Hauntworks"} · night ${savedDay}`} onPress={() => commands.run("park.start", {})} />
      <Verb label="Wake the haunt" primary={recent === null} hint={recent === null ? `Begin with ${scenarioDef(FIRST_SCENARIO)?.title ?? "the first scenario"}` : "Start fresh or pick a scenario"}
        onPress={() => { if (recent === null) scenario(FIRST_SCENARIO); else flow.push("new"); }} />
      <Verb label="Haunt saves" hint={recent === null ? "Nothing saved yet" : `Night ${savedDay} on the board`} onPress={() => flow.push("saves")} />
      <Verb label="Settings" hint="Motion, sound, controls" onPress={() => flow.push("settings")} />
      <Verb label="Credits" onPress={() => flow.push("credits")} />
    </Board>;
    const titled = (title: string, body: unknown) => <Board eyebrow={title} tagline={tagline} footer={footer} onBack={back}>
      <Row justify="between"><Heading>{title}</Heading><Button tone="ghost" onPress={back}>‹ Back</Button></Row>{body as never}
    </Board>;
    if (pane === "new") return titled("Wake the haunt", <NewParkPane hasSave={recent !== null} onFresh={() => commands.run("park.new", {})} onFreePlay={() => commands.run("park.start", {})} onScenario={scenario} />);
    if (pane === "saves") return titled("Haunt saves", <SavesPane slots={slots} onLoad={() => commands.run("park.start", {})} />);
    if (pane === "settings") return titled("Settings", <ParkSettings {...props} />);
    return titled("Credits", <>
      <Text size={13} color={PENCIL}>Original Hauntworks art. Third-party packs are CC0.</Text>
      {CREDITS.map((s) => <RuneView key={s.heading} gap={3}><Tag>{s.heading.toUpperCase()}</Tag>{s.entries.map((e) => <Text key={e.label} size={13}>{[e.label, e.detail, "href" in e ? e.href : undefined].filter(Boolean).join(" · ")}</Text>)}</RuneView>)}
    </>);
  }
}

function SavesPane({ slots, onLoad }: { slots: readonly SaveSlotMeta[]; onLoad: () => void }) {
  return <>{slots.map((slot) => <RuneView key={slot.id} gap={6} padding={10} radius={10} fill={SAND}>
    {slot.empty ? <Text color={PENCIL}>Nothing saved yet. Wake a haunt and it is kept here as the nights pass.</Text> : <>
      <Row items="start" gap={12}>
        {typeof slot.meta["thumbnail"] === "string" ? <RuneView width={128} height={72} radius={6} image={slot.meta["thumbnail"]} fit="cover" border={{ width: 2, color: INK }} /> : null}
        <RuneView gap={2} grow={1} shrink><Heading size={18}>{slot.name ?? "Hauntworks"}</Heading>
          <Text size={13}>{([["day", "night"], ["guests", "living"], ["cash", "ecto"], ["playtime", "playtime"]] as const).map(([key, label]) => `${label} ${String(slot.meta[key] ?? "–")}`).join(" · ")}</Text>
          {slot.savedAt === undefined ? null : <Text size={12} color={PENCIL}>{`Saved ${relativeSavedAt(slot.savedAt)}`}</Text>}</RuneView>
      </Row>
      <Button tone="primary" label="Load haunt" onPress={onLoad}>Return to this haunt</Button>
    </>}
  </RuneView>)}</>;
}

const LETTERS: Readonly<Record<string, string>> = { Space: " ", Minus: "-", Quote: "'", Period: "." };
const NAMES = ["Hauntworks", "Gallows Point Pier", "The Drowned Midway", "Lanternfall", "Grimwater Fair"];

/** The haunt's name: tap it, type (Enter or Esc finishes), or cycle a seaside name on a touch screen. */
function NameField() {
  const [name, setName] = useState(parkProfile.name ?? ""), [typing, setTyping] = useState(false);
  const commit = (next: string) => { setName(next); parkProfile.name = next.trim() === "" ? null : next.trim(); };
  const key = (code: string) => {
    if (code === "Enter" || code === "Escape" || code === "Tab") { setTyping(false); return; }
    if (code === "Backspace") { commit(name.slice(0, -1)); return; }
    const ch = code.startsWith("Key") ? code.slice(3) : code.startsWith("Digit") ? code.slice(5) : LETTERS[code];
    if (ch === undefined || name.length >= 28) return;
    // Capital at the start of each word, lower case after: the sign-painter's casing.
    commit(name + (name === "" || name.endsWith(" ") ? ch.toUpperCase() : ch.toLowerCase()));
  };
  return <RuneView gap={4} {...(typing ? { onKey: key } : {})}>
    <Tag>HAUNT NAME</Tag>
    <Row gap={6}>
      <Button tone="ghost" label="Haunt name" grow={1} items="start" border={{ width: 2, color: typing ? CORAL : INK }} onPress={() => setTyping(!typing)}>
        <Text family={DISPLAY} size={20} color={name === "" ? PENCIL : INK}>{`${name === "" ? "Hauntworks" : name}${typing ? "|" : ""}`}</Text>
      </Button>
      <Button label="Suggest a name" onPress={() => commit(NAMES[(NAMES.indexOf(name) + 1) % NAMES.length]!)}>Suggest</Button>
    </Row>
    <Text size={12} color={PENCIL}>{typing ? "Type the name · Enter to finish" : "Tap to type a name, or let the board suggest one."}</Text>
  </RuneView>;
}

/** Name the haunt, then start a scenario or free play on the empty lot. */
function NewParkPane({ hasSave, onFresh, onFreePlay, onScenario }: { hasSave: boolean; onFresh: () => void; onFreePlay: () => void; onScenario: (id: string) => void }) {
  return <>
    <NameField />
    <Text>Scenarios open one after another, up to the Full Moon Festival: win one to unlock the next.</Text>
    <RuneView layout="grid" columns={2} responsive={{ phone: { columns: 1 } }} gap={8}>
      {SCENARIOS.map((scenario) => {
        const lock = scenarioLock(scenario.id);
        return <Button key={scenario.id} disabled={lock !== null} items="start" tooltip={lock ?? scenario.blurb} onPress={() => onScenario(scenario.id)} label={scenario.title}>
          <Text weight={800}>{lock === null ? scenario.title : `Locked · ${scenario.title}`}</Text><Text size={12} color={PENCIL}>{lock ?? scenario.goal}</Text>
        </Button>;
      })}
    </RuneView>
    {hasSave ? <Button tone="ghost" onPress={onFresh}>Start fresh · archive this save</Button> : <Button tone="ghost" onPress={onFreePlay}>Free haunting on the empty lot</Button>}
  </>;
}

function PauseBoard(props: ParkMenuProps) {
  const { commands } = useGame();
  const day = useGameStore((c) => park.of(c).num("park.day"));
  const [notice, setNotice] = useState<string | null>(null);
  const flow = usePanes("main", parkFocus.id, ["settings", "help"]);
  const resume = () => commands.run("pauseToggle", {});
  const back = () => { if (flow.depth > 1) flow.pop(); else resume(); };
  const footer = `Hauntworks · night ${day ?? 1}`;
  const entry = { kind: flow.pane };
  return entry.kind === "main"
    ? <Board eyebrow="The clocks have stopped" tagline="The living, the ghosts and the ectoplasm all hold their breath." footer={footer} onBack={resume}>
      <Verb label="Resume the night" primary onPress={resume} />
      <Verb label="Save the haunt" hint={notice ?? session.saveStatus} onPress={() => void captureParkThumb().then(() => { commands.run("park.save", {}); refreshParkSlot(); setNotice("The haunt is on the board."); })} />
      <Verb label="Settings" hint="Motion, sound, controls" onPress={() => flow.push("settings")} />
      <Verb label="How to haunt" onPress={() => flow.push("help")} />
    </Board>
    : <Board eyebrow="The clocks have stopped" tagline="The living, the ghosts and the ectoplasm all hold their breath." footer={footer} onBack={back}>
      <Row justify="between"><Heading>{entry.kind === "settings" ? "Settings" : "How to haunt"}</Heading><Button tone="ghost" onPress={back}>‹ Back</Button></Row>
      {entry.kind === "settings" ? <ParkSettings {...props} /> : <>
        <Text>Pan with WASD or the arrow keys, rotate with Q and E, scroll to zoom. On touch, hold the camera arrows and use + and −.</Text>
        <Text>The living come at dusk and go home at dawn. Every scare spends their nerve and wrings out ectoplasm; scares close together chain for more. A visitor with no nerve left flees screaming, which spreads the rumor - but scare a group out at the gate and they never reach your best rides.</Text>
        <Text>Pick a ticket in the build palette (B), then click a glowing spot. Number keys 1–6 pick the carousel, coaster, track, candy floss, dead oak or path; X or right-click stops placing.</Text>
        <Text>Ghosts (G) shows what each ghost wants before it moves in. Ghost hunters and TV crews film your scares: scare them out before they leave, or a Gargoyle Sentry jams their cameras. Too much footage and an exorcist comes at noon.</Text>
        <Text>Click a ride to turn its scare yield up or down and to tinker with it before it jams. The Ledger (L) holds the gate toll, the moon's accounts and the Ferryman's debt.</Text>
      </>}
    </Board>;
}
