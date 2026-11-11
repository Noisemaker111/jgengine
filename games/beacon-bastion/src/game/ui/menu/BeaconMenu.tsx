/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useState, type ReactNode } from "@jgengine/core/ui/jsx";
import { RuneLayers, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { createRuneFlow, type RuneFlow } from "@jgengine/core/ui/rune/primitives";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { useSaveSlots, relativeSavedAt } from "@jgengine/core/save/saveSlots.view";
import { slotNumber, slotText, type SaveSlotMeta } from "@jgengine/core/save/saveSlots";
import { useOptionalGamePhase } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { DIFFICULTIES, DIFFICULTY_IDS, setDifficulty, type DifficultyId } from "../../campaign";
import { BEACON_CREDITS } from "../../credits";
import { beginRun, enterRun, resumeRun, withdrawToTitle } from "../../menu";
import { KEEP_LABEL, beaconSave, beaconSlots, keepCanCheckpoint, keepForNewRun, loadSlot, prepareKeep, refreshBeaconSlots, saveToSlot } from "../../save";
import { currentWaveNumber, session } from "../../session";
import { keepProfile } from "../../thumbs";
import { TOTAL_WAVES } from "../../waves/manifest";
import { BLOOD, Brazier, DIM, FIRE, GOLD, Glyph, Heading, INK, Plank, Row, Tag, Text, usePhone } from "../look";
import { StoneSettings } from "./StoneSettings";

/** Capture-only focus request: a shot or a menu command names the screen it wants open. */
export const menuFocus: { id: string | null } = { id: null };
const focusListeners = new Set<() => void>();
export function focusMenu(id: string | null): void {
  menuFocus.id = id;
  for (const listener of focusListeners) listener();
}

/** Names a commander can sign with on a pad or a phone, where no keyboard is at hand. */
const ROSTER = ["Mara Vell", "Osric Thane", "Edda Corr", "Bram Holt", "Isolde Rook"];

/** Roman numerals for the wave the banner is stitched with. */
function roman(value: number): string {
  const table: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let left = Math.max(0, Math.floor(value)), out = "";
  for (const [step, glyph] of table) while (left >= step) { out += glyph; left -= step; }
  return out === "" ? "0" : out;
}

/** A letter, digit, space or apostrophe typed onto the commission, from the key that was pressed. */
function typed(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (code === "Space") return " ";
  if (code === "Minus") return "-";
  if (code === "Quote") return "'";
  return null;
}
const titleCase = (name: string) => name.replace(/(^|\s)([a-z])/g, (_, gap: string, letter: string) => gap + letter.toUpperCase());

type Busy = (label: string, work: () => Promise<unknown>) => Promise<void>;

/** Beacon's front-end: the title is the keep's carved lintel and timber verbs; the pause is a war banner. */
export function BeaconMenu() {
  const ctx = useGameContext(), phase = useOptionalGamePhase();
  const [busy, setBusy] = useState<string | null>(null);
  const run: Busy = async (label, work) => {
    if (busy !== null) return;
    setBusy(label);
    try { await Promise.all([work(), new Promise((resolve) => setTimeout(resolve, 320))]); }
    finally { setBusy(null); }
  };
  if (phase !== "menu" && phase !== "paused") return null;
  return <>
    {phase === "menu" ? <TitleMenu key="title" run={run} /> : <PauseBanner key="pause" ctx={ctx} run={run} />}
    {busy === null ? null : <RuneView anchor="fill" fill="#0b0705e0" modal items="center" justify="center" gap={12} role="status" label={busy}>
      <Brazier size={74} strength={1} /><Heading size={22}>{busy}</Heading>
    </RuneView>}
  </>;
}

function useFlow(routes: readonly string[], initial: (flow: RuneFlow) => void): RuneFlow {
  const flow = useMemo(() => {
    const f = createRuneFlow(Object.fromEntries(routes.map((id) => [id, { layer: "screen" as const, pause: false, capture: true }])));
    f.push("main"); initial(f);
    return f;
  }, []);
  useEffect(() => {
    const listener = () => { flow.clear(); flow.push("main"); if (menuFocus.id !== null && flow.routes[menuFocus.id] !== undefined) flow.push(menuFocus.id); };
    focusListeners.add(listener);
    return () => { focusListeners.delete(listener); };
  }, [flow]);
  return flow;
}

/** One menu screen: dark dusk wash, a header line and the screen's own column, Back on Escape. */
function Screen({ children, back, width = 760 }: { children: ReactNode; back?: () => void; width?: number }) {
  const viewport = useRuneViewport(), phone = viewport.width < 600;
  return <RuneView anchor="fill" gradient={{ angle: 180, stops: [[0, "#0b0705f0"], [0.6, "#1a100ad8"], [1, "#2a1608b0"]] }} padding={phone ? [20, 16, 20, 16] : [32, 40, 32, 40]} {...(back === undefined ? {} : { onBack: back })}>
    <RuneView anchor="center" width={Math.min(width, viewport.width - (phone ? 24 : 64))} maxHeight={viewport.height - 32} gap={phone ? 12 : 16}>{children}</RuneView>
  </RuneView>;
}

function TitleMenu({ run }: { run: Busy }) {
  const ctx = useGameContext(), phone = usePhone(), { height } = useRuneViewport();
  const keeps = useSaveSlots(beaconSlots), recent = beaconSlots.mostRecent(), newKeep = keepForNewRun();
  const [commander, setCommander] = useState(keepProfile.commander ?? ""), [difficulty, setDifficultyChoice] = useState<DifficultyId>("knight");
  const flow = useFlow(["main", "new", "keeps", "settings", "credits"], (f) => { if (menuFocus.id !== null && f.routes[menuFocus.id] !== undefined) f.push(menuFocus.id); });
  useEffect(() => { void refreshBeaconSlots(ctx); }, [ctx]);
  const back = () => { if (flow.read().length > 1) flow.pop(); };
  const open = (slot: string) => run("Opening the keep", async () => { await loadSlot(ctx, slot); enterRun(ctx); });
  const raise = (slot: string) => run("Raising the keep", async () => {
    keepProfile.commander = commander.trim() === "" ? null : commander.trim();
    await prepareKeep(ctx, slot);
    // A fresh keep's campaign starts at Knight; the oath taken here sets it before the walls rise.
    setDifficulty(ctx, difficulty);
    beginRun(ctx);
  });
  const held = keeps.filter((slot) => !slot.empty).length;
  return <RuneLayers flow={flow}>{(entry) => {
    if (entry.kind === "main") return <Screen>
      <RuneView items="center" gap={6}>
        <Brazier size={phone ? 56 : 72} strength={1} />
        <RuneView variant="stone" items="center" gap={0} padding={phone ? [10, 22, 10, 22] : [14, 40, 14, 40]}>
          <Text family="Cinzel" weight={700} size={phone ? 34 : 54} tracking={phone ? 3 : 6} color={INK} align="center">BEACON</Text>
          <Text family="Cinzel" weight={700} size={phone ? 34 : 54} tracking={phone ? 3 : 6} color={FIRE} align="center">BASTION</Text>
        </RuneView>
        <Text size={phone ? 14 : 17} color={DIM} align="center">Hold the road the raiders carved.</Text>
      </RuneView>
      <RuneView items="center" width={{ fraction: 1 }}><RuneView gap={8} width={phone ? { fraction: 1 } : 380} maxHeight={height - (phone ? 300 : 360)} scroll>
        <Verb label="Continue" hint={recent === null ? "No keep held yet" : `${recent.name ?? KEEP_LABEL[recent.id] ?? recent.id}`} disabled={recent === null} run={() => { if (recent !== null) void open(recent.id); }} />
        <Verb label="New Defense" hint={newKeep === null ? "No keep free" : `Raise ${KEEP_LABEL[newKeep] ?? newKeep}`} disabled={newKeep === null} run={() => flow.push("new")} />
        <Verb label="Keeps" hint={`${held} of ${keeps.length} held`} run={() => { void refreshBeaconSlots(ctx); flow.push("keeps"); }} />
        <Verb label="Settings" run={() => flow.push("settings")} />
        <Verb label="Credits" run={() => flow.push("credits")} />
      </RuneView></RuneView>
      <Tag align="center">ARROWS CHOOSE · ENTER TAKES · ESC BACK</Tag>
    </Screen>;
    if (entry.kind === "new") return <Screen back={back} width={560}>
      <Commission slot={newKeep} commander={commander} setCommander={setCommander} difficulty={difficulty} setDifficulty={setDifficultyChoice} onBegin={() => { if (newKeep !== null) void raise(newKeep); }} />
      <Plank run={back}>Back</Plank>
    </Screen>;
    if (entry.kind === "keeps") return <Screen back={back} width={900}>
      <Heading align="center">Keeps</Heading>
      <RuneView scroll maxHeight={height - 170} gap={10}>
        <RuneView layout="grid" columns={3} responsive={{ phone: { columns: 1 } }} gap={10}>
          {keeps.map((slot) => <KeepNiche key={slot.id} slot={slot} recent={slot.id === recent?.id} onTake={() => void (slot.empty ? raise(slot.id) : open(slot.id))} />)}
        </RuneView>
      </RuneView>
      <Plank run={back}>Back</Plank>
    </Screen>;
    if (entry.kind === "settings") return <Screen back={back} width={640}>
      <Heading align="center">Prepare the Keep</Heading>
      <RuneView variant="stone" scroll maxHeight={height - 170}><StoneSettings /></RuneView>
      <Plank run={back}>Back</Plank>
    </Screen>;
    return <Screen back={back} width={640}><Credits height={height} /><Plank run={back}>Back</Plank></Screen>;
  }}</RuneLayers>;
}

/** A timber verb on the title: label in Cinzel and its hint under it. */
function Verb({ label, hint, disabled, run }: { label: string; hint?: string; disabled?: boolean; run: () => void }) {
  return <Plank label={label} disabled={disabled === true} run={run} layout="stack" gap={0} minHeight={46}>
    <Text family="Cinzel" weight={700} size={18} color={INK}>{label}</Text>
    {hint === undefined ? null : <Text size={12} color={DIM}>{hint}</Text>}
  </Plank>;
}

/** The New Defense commission on parchment: who takes the wall, the oath and which keep they raise. */
function Commission({ slot, commander, setCommander, difficulty, setDifficulty: choose, onBegin }: {
  slot: string | null; commander: string; setCommander: (name: string) => void; difficulty: DifficultyId; setDifficulty: (id: DifficultyId) => void; onBegin: () => void;
}) {
  const [signing, setSigning] = useState(false);
  const label = slot === null ? "No keep available" : (KEEP_LABEL[slot] ?? slot);
  const nextName = () => { const at = ROSTER.indexOf(commander); setCommander(ROSTER[(at + 1) % ROSTER.length] ?? ""); };
  const sign = (code: string) => {
    if (code === "Enter" || code === "Escape" || code === "Tab") { setSigning(false); return; }
    if (code === "Backspace") { setCommander(commander.slice(0, -1)); return; }
    const letter = typed(code);
    if (letter !== null && commander.length < 24) setCommander(titleCase(commander + letter));
  };
  return <RuneView variant="parchment" gap={10} label="Commission">
    <Heading color="#2e1f12" align="center">Commission</Heading>
    <Tag color="#6a4a2a">COMMANDER</Tag>
    <RuneView layout="row" gap={6} items="center" {...(signing ? { onKey: sign } : {})}>
      <Plank grow={1} variant="parchment" fill="#fff6e0" padding={[8, 10, 8, 10]} items="start" border={{ width: signing ? 2 : 1, color: signing ? "#8a2414" : "#9c7f4c" }}
        label="Commander name" run={() => setSigning(!signing)}>
        <Text size={16} color={commander === "" ? "#8a7454" : "#2e1f12"}>{commander === "" ? (signing ? "Type your name, Enter to seal" : "Sign your name") : signing ? `${commander}|` : commander}</Text>
      </Plank>
      <Plank minHeight={36} padding={[4, 10, 4, 10]} label="Next name" run={nextName}>Next name</Plank>
    </RuneView>
    <Tag color="#6a4a2a">OATH</Tag>
    <RuneView layout="grid" columns={3} gap={6} label="Difficulty">
      {DIFFICULTY_IDS.map((id) => <Plank key={id} tone={difficulty === id ? "enamel" : "plank"} minHeight={36} padding={[4, 8, 4, 8]} run={() => choose(id)}>{DIFFICULTIES[id].label}</Plank>)}
    </RuneView>
    <Text size={13} color="#4a3520">{DIFFICULTIES[difficulty].detail}</Text>
    <Row gap={10} justify="center">
      {beaconSlots.list().map((entry) => <Row key={entry.id} gap={4}>
        <RuneView width={10} height={10} radius={5} fill={entry.id === slot ? "#8a2414" : entry.empty ? "#d8c393" : "#6a4a2a"} border={{ width: 1, color: "#5a3a12" }} />
        <Text size={12} color={entry.id === slot ? "#8a2414" : "#4a3520"}>{KEEP_LABEL[entry.id] ?? entry.id}</Text>
      </Row>)}
    </Row>
    <Plank tone="enamel" disabled={slot === null} run={onBegin}>{`Raise ${label}`}</Plank>
  </RuneView>;
}

/** One kept defense in its niche: last capture or a cold brazier, commander, wave, purse, walls. */
function KeepNiche({ slot, recent, onTake }: { slot: SaveSlotMeta; recent: boolean; onTake: () => void }) {
  const label = KEEP_LABEL[slot.id] ?? slot.id, thumb = slotText(slot, "thumbnail");
  const wave = slotNumber(slot, "wave"), gold = slotNumber(slot, "gold"), lives = slotNumber(slot, "lives");
  return <RuneView variant="stone" gap={6} items="center" border={{ width: 2, color: recent ? FIRE : "#2a2622" }} label={label}>
    {thumb === null
      ? <RuneView height={90} width={{ fraction: 1 }} fill="#1f1b17" radius={3} items="center" justify="center"><Brazier size={44} strength={slot.empty ? 0 : 0.55} /></RuneView>
      : <RuneView height={90} width={{ fraction: 1 }} radius={3} image={thumb} fit="cover" clip />}
    <Heading size={18}>{label}</Heading>
    <Text size={14} color={DIM}>{slot.empty ? "Unclaimed" : (slotText(slot, "character") ?? slot.name ?? label)}</Text>
    {slot.empty ? <Text size={12} color={DIM}>No defense kept here</Text> : <Row gap={10}>
      {wave === null ? null : <Row gap={3}><Glyph name="flag" size={13} /><Text size={13}>{`Wave ${wave}`}</Text></Row>}
      {gold === null ? null : <Row gap={3}><Glyph name="coin" size={13} color={GOLD} /><Text size={13}>{String(gold)}</Text></Row>}
      {lives === null ? null : <Row gap={3}><Glyph name="heart" size={13} color={BLOOD} /><Text size={13}>{String(lives)}</Text></Row>}
    </Row>}
    {slot.empty || slot.savedAt === undefined ? null : <Text size={12} color={DIM}>{`Kept ${relativeSavedAt(slot.savedAt)}`}</Text>}
    <Plank tone={slot.empty ? "plank" : "enamel"} width={{ fraction: 1 }} label={slot.empty ? `Raise ${label}` : `Hold ${label}`} run={onTake}>{slot.empty ? "Raise" : "Hold"}</Plank>
  </RuneView>;
}

function Credits({ height }: { height: number }) {
  return <RuneView variant="parchment" scroll maxHeight={height - 130} gap={8} label="Credits">
    <Heading color="#2e1f12" align="center">Credits</Heading>
    {BEACON_CREDITS.sections.map((section) => <RuneView key={section.heading} gap={3}>
      <Text family="Cinzel" weight={700} size={15} color="#5a2a12">{section.heading}</Text>
      {section.entries.map((entry) => <Text key={entry.label} size={13} color="#2e1f12">{[entry.label, entry.detail, entry.href].filter(Boolean).join(" · ")}</Text>)}
    </RuneView>)}
    {BEACON_CREDITS.notice === undefined ? null : <Text size={12} color="#4a3520">{BEACON_CREDITS.notice}</Text>}
  </RuneView>;
}

/** The pause: a war banner with the wave stitched in Roman numerals and the stitched verbs under it. */
function PauseBanner({ ctx, run }: { ctx: GameContext; run: Busy }) {
  const phone = usePhone(), { height } = useRuneViewport();
  const [notice, setNotice] = useState<string | null>(null), [confirming, setConfirming] = useState(false);
  const flow = useFlow(["main", "settings", "credits"], (f) => { if (menuFocus.id === "settings" || menuFocus.id === "credits") f.push(menuFocus.id); });
  const back = () => { if (flow.read().length > 1) flow.pop(); else resumeRun(ctx); };
  const slot = beaconSave(ctx).slot(), keepName = KEEP_LABEL[slot] ?? slot;
  const write = () => { setConfirming(false); void run("Writing the keep", async () => { await saveToSlot(ctx, slot); setNotice(`Kept in ${keepName}`); }); };
  const save = () => { if (!keepCanCheckpoint(ctx) && beaconSlots.get(slot)?.empty === false) setConfirming(true); else write(); };
  const wave = Math.min(currentWaveNumber(), TOTAL_WAVES), standing = session.creeps.size;
  return <RuneLayers flow={flow}>{(entry) => {
    if (entry.kind === "settings") return <Screen back={back} width={640}><Heading align="center">Prepare the Keep</Heading><RuneView variant="stone" scroll maxHeight={height - 170}><StoneSettings /></RuneView><Plank run={back}>Back</Plank></Screen>;
    if (entry.kind === "credits") return <Screen back={back} width={640}><Credits height={height} /><Plank run={back}>Back</Plank></Screen>;
    return <Screen back={back} width={phone ? 360 : 420}>
      <RuneView items="center" gap={8} padding={phone ? [18, 16, 26, 16] : [22, 28, 32, 28]} gradient={{ angle: 90, stops: [[0, "#7a1d10"], [1, "#4a0f08"]] }} border={{ width: 2, color: "#c89a50" }}
        shape={{ points: [[0, 0], [100, 0], [100, 94], [50, 100], [0, 94]], viewBox: [100, 100] }} label="Defense paused">
        <Brazier size={48} strength={1} />
        <Text family="Cinzel" weight={700} size={phone ? 40 : 52} tracking={4} color="#ffe7c0">HOLD</Text>
        <Tag color="#f3c9a0">{`WAVE ${roman(wave)} · ${standing} RAIDER${standing === 1 ? "" : "S"} ON THE ROAD`}</Tag>
        <RuneView gap={6} width={{ fraction: 1 }} padding={[8, 0, 0, 0]}>
          <Plank tone="enamel" run={() => resumeRun(ctx)}>Hold the line</Plank>
          {confirming
            ? <RuneView gap={6}><Text size={13} color="#ffe7c0" align="center">{`Replace the saved defense in ${keepName}?`}</Text>
              <Row gap={6}><Plank grow={1} run={write}>Replace</Plank><Plank grow={1} run={() => setConfirming(false)}>Keep it</Plank></Row></RuneView>
            : <Plank run={save}>{`Save ${keepName}`}</Plank>}
          <Plank run={() => flow.push("settings")}>Settings</Plank>
          <Plank run={() => flow.push("credits")}>Credits</Plank>
          <Plank run={() => void run("Writing the keep", () => withdrawToTitle(ctx, slot))}>{keepCanCheckpoint(ctx) ? "Withdraw to title" : "Withdraw without saving"}</Plank>
        </RuneView>
        <Text size={13} color="#f3c9a0" role="status" align="center">{notice ?? "Esc to hold the line"}</Text>
      </RuneView>
    </Screen>;
  }}</RuneLayers>;
}

