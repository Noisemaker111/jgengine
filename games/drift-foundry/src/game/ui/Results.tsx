/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneGlyph, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import type { SessionSnapshot } from "../run/session";
import { PART_SLOTS } from "../parts/catalog";
import { medalArtwork, partArtwork } from "./artwork";
import { Button, FULL, Label, MedalRow, ORANGE, PEN, Row, STENCIL, Sheet, Stencil, Text } from "./pit";

/**
 * The self-checkout receipt: what the run did, the points the scanner rang up for the clock, the
 * basket and the style, what it paid in store credit, and what the PA announces next. A cart the
 * shutters caught gets the locked-in slip instead.
 */
export function Results({ snapshot, onRestart, onTitle }: { snapshot: SessionSnapshot; onRestart: () => void; onTitle: () => void }) {
  const { width } = useRuneViewport(), phone = width < 600;
  const outcome = snapshot.outcome;
  if (outcome === null) return null;
  const won = outcome.kind === "won";
  const cell = (value: string, label: string) => <RuneView key={label} gap={0} padding={[6, 8, 6, 8]} fill="#1f243010"><Text family={STENCIL} size={phone ? 18 : 22} color={PEN}>{value}</Text><Label size={11} color={PEN}>{label}</Label></RuneView>;
  const run = [
    cell(`${outcome.place}/${outcome.fieldSize}`, "FINISH"), cell(`${outcome.time.toFixed(1)}s`, "RUN TIME"),
    cell(`${won ? snapshot.track.exitAt : Math.max(0, Math.floor(snapshot.run))}m`, "DISTANCE"),
    cell(`${[...snapshot.clearedGateIds].filter(id => !id.endsWith(":beaten")).length}/${snapshot.track.gates}`, "WALLS CLEARED"),
    cell(`${outcome.items} · $${outcome.cartValue.toFixed(0)}`, "IN THE CART"), cell(String(outcome.style), "STYLE"),
  ];
  const pay = [
    cell(won ? `×${outcome.lineMultiplier.toFixed(2)}` : "×0.00", won ? "LINE" : "LINE CUT"), cell(`$${outcome.banked}`, "BANKED"),
    cell(`$${outcome.lost}`, "LOST"), cell(`$${snapshot.career.credits}`, "STORE CREDIT"),
  ];
  const ev = outcome.event;
  const receipt = outcome.receipt;
  const dots = (label: string, points: number) => <Row key={label} justify="between" width={FULL}><Text size={15} color={PEN}>{label}</Text><Text family={STENCIL} size={16} color={PEN}>{String(points)}</Text></Row>;
  return <Sheet label={won ? "Checkout receipt" : "Locked-in slip"} back={onTitle} width={720}>
    <Label color={ORANGE}>{won ? "SELF-CHECKOUT 9 / THANK YOU FOR SHOPPING" : "SECURITY / THE STORE IS CLOSED"}</Label>
    <RuneView gap={0}><Stencil size={phone ? 30 : 42} color={PEN}>{won ? "CHECKED" : "LOCKED IN"}</Stencil><Stencil size={phone ? 30 : 42} color={ORANGE}>{won ? "OUT!" : snapshot.track.label.toUpperCase()}</Stencil></RuneView>
    <Text color={PEN}>{won ? "Bag your items. Have a great night." : `The shutters caught you in ${outcome.zoneLabel.toLowerCase()}. Watch the next wall cue, and hop on the pink arrows.`}</Text>
    {receipt === null ? null : <RuneView gap={3} padding={[10, 12, 10, 12]} border={{ width: 2, color: PEN }} fill="#ffffff">
      <Row justify="between" width={FULL}><Label color={PEN}>RECEIPT</Label><Label color={PEN}>{snapshot.event.label.toUpperCase()}</Label></Row>
      {receipt.lines.map(line => dots(line.label, line.points))}
      <RuneView height={2} width={FULL} fill={PEN} />
      <Row justify="between" width={FULL}><Stencil size={22} color={PEN}>TOTAL</Stencil><Stencil size={24} color={ORANGE}>{`${receipt.total} PTS`}</Stencil></Row>
      {snapshot.bestReceipt !== null ? <Label color={PEN}>{snapshot.bestReceipt <= receipt.total ? "BEST RECEIPT ON THIS EVENT" : `BEST HERE ${snapshot.bestReceipt} PTS`}</Label> : null}
    </RuneView>}
    <RuneView layout="grid" columns={phone ? 2 : 3} gap={6} width={FULL}>{run}</RuneView>
    <RuneView layout="grid" columns={phone ? 2 : 4} gap={6} width={FULL}>{pay}</RuneView>
    {won && outcome.lineNotes.length > 0 ? <Label color={PEN}>{outcome.lineNotes.join(" · ")}</Label> : null}
    <RuneView gap={4} padding={[8, 10, 8, 10]} border={{ width: 2, color: PEN }}>
      <Row gap={8} width={FULL} justify="between"><Label color={PEN}>{ev.label.toUpperCase()}</Label><MedalRow held={ev.medal} size={22} /></Row>
      <Row gap={8}><Text family={STENCIL} size={20} color={PEN}>{ev.result ?? "NO RESULT"}</Text>{ev.newBest && ev.result !== null ? <Label color={ORANGE}>EVENT BEST</Label> : null}</Row>
      {ev.firstTime.map(entry => <Row key={entry.medal} gap={6}><RuneGlyph artwork={medalArtwork(entry.medal, true)} width={18} height={18} /><Label color={PEN}>{`FIRST ${entry.medal.toUpperCase()} +$${entry.credits}`}</Label></Row>)}
      {ev.openedTiers.length > 0 ? <Text role="status" color={ORANGE}>{`${ev.openedTiers.join(", ").toUpperCase()} EVENTS NOW IN THE WEEKLY CIRCULAR`}</Text> : null}
      <Text size={15} color={PEN}>{ev.next === null ? "Every medal on this event is yours." : `Next: ${ev.next.medal} - ${ev.next.text}.`}</Text>
    </RuneView>
    <Row gap={10} width={FULL}>{snapshot.race.standings.map(entry => <Row key={entry.id} gap={4}><Text family={STENCIL} size={15} color={entry.id === "player" ? ORANGE : PEN}>{String(entry.place)}</Text><Text size={15} color={entry.id === "player" ? ORANGE : PEN}>{`${entry.name}${entry.id === "player" && !entry.finished ? (won ? " · RUNNING" : " · OUT") : ""}`}</Text></Row>)}</Row>
    <RuneView layout="grid" columns={phone ? 2 : 4} gap={6} width={FULL}>{PART_SLOTS.map(slot => <Row key={slot} gap={6}><RuneGlyph artwork={partArtwork(snapshot.installed[slot]?.id ?? null)} width={22} height={22} /><Text size={15} color={PEN}>{snapshot.installed[slot]?.label ?? "No mod"}</Text></Row>)}</RuneView>
    {won && snapshot.personalBest !== "unchanged" ? <Label color={ORANGE}>{snapshot.personalBest === "first" ? "FIRST CHECKOUT ON RECORD" : snapshot.personalBest === "improved" ? "NEW PERSONAL BEST" : "PERSONAL BEST MATCHED"}</Label> : null}
    {outcome.nextShift ? <Text role="status" color={PEN}>{`NEXT CLOSING · ${outcome.nextShift.label}. ${outcome.nextShift.hint}`}</Text> : null}
    <Text role="status" size={15} color={PEN}>{snapshot.recordsSaved ? `${outcome.banked > 0 ? `$${outcome.banked} banked. ` : ""}${snapshot.records.escapes} checkout${snapshot.records.escapes === 1 ? "" : "s"} · best ${snapshot.records.bestTime?.toFixed(1) ?? "—"}s · ${snapshot.runsPlayed} run${snapshot.runsPlayed === 1 ? "" : "s"} settled` : "Record could not be saved in this browser. This result remains available until reload."}</Text>
    <RuneView layout="grid" columns={2} gap={8} width={FULL}><Button label="Shop again" onPress={onRestart}>SHOP AGAIN · R</Button><Button quiet label="Back to customer service" onPress={onTitle}>CUSTOMER SERVICE</Button></RuneView>
  </Sheet>;
}
