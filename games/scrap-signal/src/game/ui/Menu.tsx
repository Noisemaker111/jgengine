/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useRef, useState } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneLabel, RuneLayers, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { createRuneFlow } from "@jgengine/core/ui/rune/primitives";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { useCanvasCover } from "@jgengine/core/ui/canvasCover.view";
import { useSaveSlots } from "@jgengine/core/save/saveSlots.view";
import { useGame, useGamePhase } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
import { CHARACTERS } from "../characters";
import { SCRAP_CREDITS } from "../credits";
import { scrapProfile } from "../scrapProfile";
import { SCRAP_SLOTS, refreshScrapSlots, scrapSlots } from "../scrapSlots";
import { Button, C, ControlKeys, FULL, Heading, Label, Portrait, Row, SignalBars, Small, Stamp, Text, useCompact } from "./kit";

function savedAgo(savedAt: number | undefined): string {
  if (savedAt === undefined) return "";
  const minutes = Math.floor((Date.now() - savedAt) / 60_000);
  if (minutes < 1) return "Saved just now";
  if (minutes < 60) return `Saved ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `Saved ${hours}h ago` : `Saved ${Math.floor(hours / 24)}d ago`;
}

/** The key codes a call sign accepts, as the characters they type. */
export function callSignKey(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^(Digit|Numpad)[0-9]$/.test(code)) return code.slice(-1);
  if (code === "Space") return " ";
  if (code === "Minus" || code === "NumpadSubtract") return "-";
  return null;
}
/** Apply one key to a call sign: typed characters up to 24, Backspace removes the last one. */
export function editCallSign(current: string, code: string): string {
  if (code === "Backspace") return current.slice(0, -1);
  const typed = callSignKey(code);
  return typed === null || current.length >= 24 ? current : current + typed;
}

/** Screens the boot can open on directly; proofs set this before mounting. */
export const menuFocus: { screen: "main" | "credits" } = { screen: "main" };

/**
 * Scrap Signal's front end, and the only surface a boot shows: the jammed broadcast. A kept run is a
 * signal to resume; tuning a reclaimer channel starts a new run in a free bay (or the oldest one).
 */
export function ScrapMenu() {
  const ctx = useGameContext();
  const { commands } = useGame();
  const { phase } = useGamePhase();
  const slots = useSaveSlots(scrapSlots);
  const [callSign, setCallSign] = useState("");
  const flow = useMemo(() => {
    const f = createRuneFlow({ main: { layer: "screen", pause: false, capture: true }, credits: { layer: "screen", pause: false, capture: true } });
    f.push("main"); if (menuFocus.screen === "credits") f.push("credits");
    return f;
  }, []);
  // Refresh the kept-run index when the menu appears, not on every render: the refresh writes the
  // index, the index notifies the pane, and an effect keyed on the context identity would loop.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  useEffect(() => { void refreshScrapSlots(ctxRef.current); }, [phase]);
  // The broadcast fills the screen: the field behind it is not drawn while the front end is up.
  useCanvasCover(phase === "menu");

  const kept = slots.filter(slot => !slot.empty).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  const recent = kept[0] ?? null;
  const bay = slots.find(slot => slot.empty)?.id ?? kept[kept.length - 1]?.id ?? SCRAP_SLOTS[0].id;
  const detail = recent === null ? "" : [SCRAP_SLOTS.find(s => s.id === recent.id)?.label, recent.meta["playtime"] === undefined ? undefined : `${String(recent.meta["playtime"])} played`, savedAgo(recent.savedAt)].filter(p => p !== undefined && p !== "").join(" · ");
  const pick = (characterId: string) => {
    const name = callSign.trim();
    scrapProfile.name = name === "" ? null : name;
    commands.run("character.pick", { characterId, slot: bay });
  };
  return <RuneLayers flow={flow}>{entry => entry.kind === "credits"
    ? <Credits back={() => flow.pop()} />
    : <Broadcast kept={recent === null ? null : { name: recent.name ?? "Reclaimer", detail }} onContinue={() => { if (recent !== null) commands.run("run.continue", { slot: recent.id }); }}
      callSign={callSign} onCallSign={setCallSign} onPick={pick} onCredits={() => flow.push("credits")} />}
  </RuneLayers>;
}

/** The broadcast wordmark: Russo One split across the red and cyan guns of a bad tube. */
function Wordmark({ size }: { size: number }) {
  const mark = (color: string, x?: number) => <RuneLabel value="SCRAP SIGNAL" family="Russo One" size={size} tracking={size / 14} color={color} {...(x === undefined ? {} : { pin: [x, 0, -x, null] as const })} />;
  return <RuneView>{mark("#ff3b2fcc", -3)}{mark("#3fd8ffcc", 3)}{mark(C.ink)}</RuneView>;
}

/**
 * The title as a jammed broadcast: the carrier is down and three reclaimer channels flicker on a
 * bank of salvaged monitors. Tuning one in starts a new run; a kept run shows as a signal to resume.
 */
function Broadcast({ kept, onContinue, callSign, onCallSign, onPick, onCredits }: {
  kept: { name: string; detail: string } | null; onContinue: () => void; callSign: string; onCallSign: (next: string) => void; onPick: (id: string) => void; onCredits: () => void;
}) {
  const { height } = useRuneViewport(), { compact, portrait: phone } = useCompact(), short = compact && !phone;
  const [editing, setEditing] = useState(false);
  const [tuned, setTuned] = useState(CHARACTERS[0]?.id ?? "");
  return <RuneView anchor="fill" padding={compact ? 12 : 28} gap={compact ? 8 : 14}
    gradient={{ angle: 1.57, stops: [[0, "#14100c"], [0.6, "#0d1110"], [1, "#050807"]] }}>
    <Row justify="between"><Label color={C.ink}>CH 04 ▸ NO CARRIER</Label><Row gap={6}><RuneView width={8} height={8} radius={4} fill={C.red} /><Label color={C.red}>{phone ? "REC" : "REC · FERRALON WASTES"}</Label></Row></Row>
    <RuneView scroll maxHeight={height - (compact ? 50 : 100)} gap={compact ? 8 : 14} width={FULL}>
      <RuneView gap={4} items="center" width={FULL}>
        <Label color={C.amber}>REACTIVATE · RECLAIM · RISE</Label>
        <Wordmark size={short ? 36 : phone ? 40 : 76} />
        {short ? null : <Text size={14} color={C.dim} align="center" maxWidth={640}>A broken carrier. A desert of stolen machines. Reclaim the copper-ring relay north of the crash site, then follow B0-LT’s campaign across Ferralon.</Text>}
      </RuneView>
      {kept === null ? null : <RuneAction label="Continue" run={onContinue} layout="row" items="center" gap={12} padding={[10, 14, 10, 14]} fill="#1b2225" border={{ width: 3, color: C.amber }} hover="#ffb40022" press="#00000044" width={FULL} maxWidth={720} responsive={{ phone: { layout: "stack", gap: 4 } }}>
        <Stamp>Resume signal</Stamp>
        <RuneView grow={1} shrink gap={1}><Text family="Russo One" size={18}>{kept.name}</Text><Small>{kept.detail}</Small></RuneView>
        <Label color={C.amber}>▸ Continue</Label>
      </RuneAction>}
      <Row gap={10} justify="between" responsive={{ phone: { layout: "stack", gap: 6 } }}>
        <Label color={C.dim}>{kept === null ? "Tune a reclaimer" : "Or tune a new reclaimer"}</Label>
        <CallSign value={callSign} editing={editing} setEditing={setEditing} onChange={onCallSign} />
      </Row>
      <RuneView layout="grid" columns={CHARACTERS.length} gap={phone ? 8 : 14} responsive={{ phone: { columns: 1 } }} label="Choose your reclaimer">
        {CHARACTERS.map((character, index) => {
          const on = tuned === character.id;
          return <RuneAction key={character.id} label={character.name} run={() => onPick(character.id)} onFocus={() => setTuned(character.id)} onHover={inside => { if (inside) setTuned(character.id); }}
            padding={phone ? 8 : 10} gap={phone ? 4 : 8} fill="#1b2225" border={{ width: on ? 3 : 2, color: on ? C.amber : "#3a3226" }} hover="#ffb4001a" press="#00000044"
            responsive={{ phone: { layout: "row", items: "center" } }}>
            {compact ? null : <Row justify="between"><Stamp tone={on ? "amber" : "dim"}>{`CH ${index + 1}`}</Stamp><SignalBars strength={on ? 4 : 1 + (index % 2)} color={on ? C.amber : C.phosphorDim} /></Row>}
            <Portrait id={character.id} color={character.color} size={phone ? 72 : short ? 110 : 180} />
            <RuneView gap={2} grow={1} shrink>
              <Heading size={phone ? 18 : 22}>{character.name.toUpperCase()}</Heading>
              <Label color={character.color}>{character.className}</Label>
              <Small>{character.tagline}</Small>
              {compact ? null : <Row gap={4}>{character.branches.map(b => <RuneView key={b.id} padding={[1, 5, 1, 5]} border={{ width: 1, color: "#44403c" }}><Small size={10} color="#d6d3d1">{b.name.toUpperCase()}</Small></RuneView>)}</Row>}
              <Label color={on ? C.amber : C.faint}>{on ? "▸ Tune in" : "Static"}</Label>
            </RuneView>
          </RuneAction>;
        })}
      </RuneView>
      <Row justify="between" gap={10} responsive={{ phone: { layout: "stack" } }}>
        {compact ? null : <ControlKeys />}
        <Small>{phone ? "Tap a channel to lock it in" : "Arrows or mouse to tune · Enter to lock the channel"}</Small>
        <Button onPress={onCredits}>Credits</Button>
      </Row>
    </RuneView>
  </RuneView>;
}

/**
 * The call sign plate. Rune has no native text field yet, so the plate takes typed keys while armed:
 * letters, digits, space and hyphen, Backspace to erase, Enter or Escape to lock it.
 */
function CallSign({ value, editing, setEditing, onChange }: { value: string; editing: boolean; setEditing: (on: boolean) => void; onChange: (next: string) => void }) {
  const current = useRef(value);
  current.current = value;
  return <RuneAction label="Call sign" run={() => setEditing(!editing)} layout="row" items="center" gap={8} padding={[6, 10, 6, 10]} minWidth={280} fill="#0c0a09" border={{ width: 2, color: editing ? C.amber : "#44403c" }}
    {...(editing ? { onKey: (code: string) => {
      if (code === "Enter" || code === "NumpadEnter" || code === "Escape") { setEditing(false); return; }
      onChange(editCallSign(current.current, code));
    } } : {})}>
    <Label color={C.dim}>Call sign</Label>
    <Text grow={1} size={15} color={value === "" ? C.faint : C.ink}>{value === "" ? (editing ? "Type a name…" : "Name the reclaimer") : `${value}${editing ? "_" : ""}`}</Text>
    <Label color={editing ? C.amber : C.faint}>{editing ? "Enter ✓" : "Edit"}</Label>
  </RuneAction>;
}

function Credits({ back }: { back: () => void }) {
  const { width } = useRuneViewport(), phone = width < 600;
  return <RuneView anchor="fill" fill="#0c0a09f8" padding={phone ? 16 : 40} gap={12} onBack={back}>
    <Row justify="between"><Heading size={phone ? 22 : 30} color={C.amber}>Scrap Signal credits</Heading><Button onPress={back}>Back</Button></Row>
    <RuneView scroll grow={1} gap={14}>
      {SCRAP_CREDITS.sections.map(s => <RuneView key={s.heading} gap={4}><Label>{s.heading}</Label>{s.entries.map(e => <Small key={`${e.label}${e.detail ?? ""}`} color={C.ink}>{[e.label, e.detail, e.href].filter(Boolean).join(" · ")}</Small>)}</RuneView>)}
      {SCRAP_CREDITS.notice === undefined ? null : <Small>{SCRAP_CREDITS.notice}</Small>}
    </RuneView>
  </RuneView>;
}
