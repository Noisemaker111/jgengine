/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneGlyph, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import type { SessionSnapshot } from "../run/session";
import { PART_SLOTS } from "../parts/catalog";
import { medalArtwork, partArtwork } from "./artwork";
import { Button, FULL, Label, MedalRow, ORANGE, PEN, Row, STENCIL, Sheet, Stencil, Text } from "./pit";

/** The pit radio's result card: what the run did, what it paid, and what the yard draws next. */
export function Results({ snapshot, onRestart, onTitle }: { snapshot: SessionSnapshot; onRestart: () => void; onTitle: () => void }) {
  const { width } = useRuneViewport(), phone = width < 600;
  const outcome = snapshot.outcome;
  if (outcome === null) return null;
  const won = outcome.kind === "won";
  const cell = (value: string, label: string) => <RuneView key={label} gap={0} padding={[6, 8, 6, 8]} fill="#2a241912"><Text family={STENCIL} size={phone ? 18 : 22} color={PEN}>{value}</Text><Label size={11} color={PEN}>{label}</Label></RuneView>;
  const run = [
    cell(`${outcome.place}/${outcome.fieldSize}`, "FINISH"), cell(`${outcome.time.toFixed(1)}s`, "RUN TIME"),
    cell(`${won ? snapshot.track.exitAt : Math.max(0, Math.floor(snapshot.run))}m`, "DISTANCE"),
    cell(`${[...snapshot.clearedGateIds].filter(id => !id.endsWith(":beaten")).length}/${snapshot.track.gates}`, "BARRIERS CLEARED"),
    cell(String(outcome.armorSaves), "ARMOR SAVES"), cell(`${outcome.carried} cr`, "SALVAGE CARRIED"),
  ];
  const pay = [
    cell(won ? `×${outcome.lineMultiplier.toFixed(2)}` : "×0.00", won ? "LINE" : "LINE CUT"), cell(`${outcome.banked} cr`, "BANKED"),
    cell(`${outcome.lost} cr`, "LOST"), cell(`${snapshot.career.credits} cr`, "YARD CREDITS"),
  ];
  const ev = outcome.event;
  return <Sheet label={won ? "Escape results" : "Crushed results"} back={onTitle} width={720}>
    <Label color={ORANGE}>{won ? "PIT RADIO / SIGNAL RECEIVED" : "PIT RADIO / SIGNAL LOST"}</Label>
    <RuneView gap={0}><Stencil size={phone ? 30 : 42} color={PEN}>{won ? "OUT OF" : snapshot.track.label.toUpperCase()}</Stencil><Stencil size={phone ? 30 : 42} color={ORANGE}>{won ? "THE YARD" : "CAUGHT YOU"}</Stencil></RuneView>
    <Text color={PEN}>{won ? "The salvage special lives to race another shift." : `Caught in ${outcome.zoneLabel.toLowerCase()}. Watch the next barrier cue and jump on the teal marks.`}</Text>
    <RuneView layout="grid" columns={phone ? 2 : 3} gap={6} width={FULL}>{run}</RuneView>
    <RuneView layout="grid" columns={phone ? 2 : 4} gap={6} width={FULL}>{pay}</RuneView>
    {won && outcome.lineNotes.length > 0 ? <Label color={PEN}>{outcome.lineNotes.join(" · ")}</Label> : null}
    <RuneView gap={4} padding={[8, 10, 8, 10]} border={{ width: 2, color: PEN }}>
      <Row gap={8} width={FULL} justify="between"><Label color={PEN}>{ev.label.toUpperCase()}</Label><MedalRow held={ev.medal} size={22} /></Row>
      <Row gap={8}><Text family={STENCIL} size={20} color={PEN}>{ev.result ?? "NO RESULT"}</Text>{ev.newBest && ev.result !== null ? <Label color={ORANGE}>EVENT BEST</Label> : null}</Row>
      {ev.firstTime.map(entry => <Row key={entry.medal} gap={6}><RuneGlyph artwork={medalArtwork(entry.medal, true)} width={18} height={18} /><Label color={PEN}>{`FIRST ${entry.medal.toUpperCase()} +${entry.credits} cr`}</Label></Row>)}
      {ev.openedTiers.length > 0 ? <Text role="status" color={ORANGE}>{`${ev.openedTiers.join(", ").toUpperCase()} EVENTS NOW OPEN ON THE YARD CALENDAR`}</Text> : null}
      <Text size={15} color={PEN}>{ev.next === null ? "Every medal on this event is yours." : `Next: ${ev.next.medal} - ${ev.next.text}.`}</Text>
    </RuneView>
    <Row gap={10} width={FULL}>{snapshot.race.standings.map(entry => <Row key={entry.id} gap={4}><Text family={STENCIL} size={15} color={entry.id === "player" ? ORANGE : PEN}>{String(entry.place)}</Text><Text size={15} color={entry.id === "player" ? ORANGE : PEN}>{`${entry.name}${entry.id === "player" && !entry.finished ? (won ? " · RUNNING" : " · OUT") : ""}`}</Text></Row>)}</Row>
    <RuneView layout="grid" columns={phone ? 2 : 4} gap={6} width={FULL}>{PART_SLOTS.map(slot => <Row key={slot} gap={6}><RuneGlyph artwork={partArtwork(snapshot.installed[slot]?.id ?? null)} width={22} height={22} /><Text size={15} color={PEN}>{snapshot.installed[slot]?.label ?? "Empty slot"}</Text></Row>)}</RuneView>
    {won && snapshot.personalBest !== "unchanged" ? <Label color={ORANGE}>{snapshot.personalBest === "first" ? "FIRST ESCAPE ON RECORD" : snapshot.personalBest === "improved" ? "NEW PERSONAL BEST" : "PERSONAL BEST MATCHED"}</Label> : null}
    {outcome.nextShift ? <Text role="status" color={PEN}>{`NEXT RUN · ${outcome.nextShift.label}. ${outcome.nextShift.hint}`}</Text> : null}
    <Text role="status" size={15} color={PEN}>{snapshot.recordsSaved ? `${outcome.banked > 0 ? `${outcome.banked} cr banked. ` : ""}${snapshot.records.escapes} escape${snapshot.records.escapes === 1 ? "" : "s"} · best ${snapshot.records.bestTime?.toFixed(1) ?? "—"}s · ${snapshot.runsPlayed} run${snapshot.runsPlayed === 1 ? "" : "s"} settled` : "Record could not be saved in this browser. This result remains available until reload."}</Text>
    <RuneView layout="grid" columns={2} gap={8} width={FULL}><Button label="Run it again" onPress={onRestart}>RUN IT AGAIN · R</Button><Button quiet label="Back to pit" onPress={onTitle}>BACK TO PIT</Button></RuneView>
  </Sheet>;
}
