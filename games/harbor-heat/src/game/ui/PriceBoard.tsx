/** @jsxImportSource @jgengine/core/ui/jsx */
import { useState } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { Button, Heading, KeyLegend, Label, money, Row, Scrim, Text, useMenuSound, useRoom, useScreenTouch } from "./kit";
import { HH, DISPLAY } from "./theme";

/**
 * One thing on the board: a gun, a box of shells, a car, an engine upgrade. `owned` and `gate` are
 * read from the game, so the same row draws a fresh item, one already in your pocket and one your
 * street cred has not reached yet.
 */
export interface BoardRow {
  id: string;
  name: string;
  /** One short line under the name: what it does, how much is in the box. */
  line?: string | undefined;
  /** Cash price. */
  price: number;
  /** Already yours: drawn with the OWNED stamp, and picking it does nothing. */
  owned?: boolean | undefined;
  /** Owned as a stack: `×3` beside the name. Picking it still buys another. */
  count?: number | undefined;
  /** Street cred level the row needs; above the player's cred it is taped off. */
  gate?: number | undefined;
  /** A small tag before the name: a rarity, a tier. */
  tag?: string | undefined;
  pick: () => void;
}

/** A run of rows under one painted header: the rack, the night market, under the counter. */
export interface BoardSection {
  id: string;
  title: string;
  note?: string;
  rows: readonly BoardRow[];
}

/** Which shop the board hangs in: the gun counter's felt letter board, or the car lot's enamel sign. */
export type BoardLook = "pawn" | "lot" | "house";

/** Why a row can't be bought right now, or null when it can. */
export function rowBlock(row: BoardRow, cash: number, cred: number): "owned" | "cred" | "cash" | null {
  if (row.owned === true) return "owned";
  if (row.gate !== undefined && cred < row.gate) return "cred";
  if (cash < row.price) return "cash";
  return null;
}

const LOOK: Record<BoardLook, { board: string; felt: string; edge: string }> = {
  pawn: { board: "#5b3a22", felt: "#1d1a16", edge: "#2a170b" },
  lot: { board: "#14505c", felt: "#0c2a31", edge: HH.cream },
  house: { board: "#2c5a3c", felt: "#13261a", edge: HH.cream },
};

/**
 * A shop's price board: the counter's name on a sign, the stock in painted sections with a price on
 * each line, the courier's cash on a pocket stub, and the keys. Arrows or the pad pick a row, Enter or A
 * buys it, Escape or B leaves; every row is also a button for mouse and touch. Rows that can't be
 * bought stay reachable so the board can say why.
 */
export function PriceBoard({ look, kicker, title, sub, sections, cash, cred, onLeave, aside }: {
  look: BoardLook;
  kicker: string;
  title: string;
  sub?: string;
  sections: readonly BoardSection[];
  cash: number;
  cred: number;
  onLeave: () => void;
  aside?: string | null;
}) {
  useScreenTouch();
  const sound = useMenuSound();
  const { width, height } = useRuneViewport();
  const compact = useRoom() !== "wide";
  const [active, setActive] = useState<string | null>(null);
  const rows = sections.flatMap((section) => section.rows);
  const focused = rows.find((row) => row.id === active) ?? null;
  const colors = LOOK[look];
  const pick = (row: BoardRow) => {
    const block = rowBlock(row, cash, cred);
    if (block === "owned") { sound.play("back"); return; }
    // A blocked buy still goes to the counter, so the shop's own refusal is what the courier hears.
    sound.play(block === null ? "confirm" : "back");
    row.pick();
  };
  const boardWidth = Math.min(620, width - 24);
  return (
    <Scrim back={onLeave} label={title} role="dialog">
      <RuneView width={boardWidth} maxHeight={height - 24} padding={compact ? 12 : 18} gap={10} fill={colors.board} border={{ width: 3, color: colors.edge }} radius={6}
        shadow={{ x: 8, y: 10, blur: 0, color: "#00000088" }}>
        <RuneView gap={2}>
          <Label color={HH.amber} text={kicker.toUpperCase()} />
          <Text family={DISPLAY} size={compact ? 32 : 42} tracking={1} color={HH.cream} text={title} />
          {sub === undefined ? null : <Text size={14} color="#e9dcc0" text={sub} />}
        </RuneView>
        <RuneView scroll height={Math.max(160, height - (compact ? 330 : 340))} gap={10} padding={10} fill={colors.felt} radius={4}>
          {sections.map((section) => section.rows.length === 0 ? null : (
            <RuneView key={section.id} gap={4}>
              <Row justify="between"><Heading size={20} color={HH.amber} text={section.title} />{section.note === undefined ? null : <Label text={section.note} />}</Row>
              {section.rows.map((row) => {
                const block = rowBlock(row, cash, cred);
                const dim = block === "owned" || block === "cred";
                return (
                  <RuneAction key={row.id} label={row.name} run={() => pick(row)} onFocus={() => setActive(row.id)} gap={2} padding={[6, 8, 6, 8]} radius={3}
                    hover="#ffffff14" press="#00000040" opacity={dim ? 0.62 : 1}>
                    <Row justify="between" gap={10}>
                      <Row gap={6} grow={1} shrink>
                        {row.tag === undefined ? null : <RuneView padding={[1, 5, 0, 5]} fill={HH.amber} radius={2}><Text size={11} weight={700} color={HH.night} text={row.tag} /></RuneView>}
                        <Text weight={700} shrink color={HH.cream} text={row.name} />
                        {row.count === undefined || row.count <= 0 ? null : <Text color={HH.mint} text={`×${row.count}`} />}
                      </Row>
                      {block === "owned" ? <RuneView padding={[1, 6, 0, 6]} border={{ width: 2, color: HH.mint }}><Text family={DISPLAY} size={14} color={HH.mint} text="OWNED" /></RuneView> : null}
                      {block === "cred" ? <RuneView padding={[1, 6, 0, 6]} fill="#e8c43a"><Text family={DISPLAY} size={14} color={HH.night} text={`CRED ${row.gate}`} /></RuneView> : null}
                      <Text family={DISPLAY} size={20} color={block === "cash" ? HH.coral : HH.amber} text={row.price <= 0 ? "Free" : money(row.price)} />
                    </Row>
                    {row.line === undefined ? null : <Text size={13} color="#c9bfa8" text={row.line} />}
                  </RuneAction>
                );
              })}
            </RuneView>
          ))}
        </RuneView>
        <RuneView layout={compact ? "stack" : "row"} gap={10} items={compact ? "stretch" : "center"}>
          <RuneView padding={[6, 10, 6, 10]} fill={HH.paper} radius={3} gap={0} role="status">
            <Label color="#5a4a30" text="In your pocket" />
            <Text family={DISPLAY} size={24} color={HH.night} text={money(cash)} />
            <Text size={12} color="#5a4a30" text={`Street cred ${cred}`} />
          </RuneView>
          <RuneView grow={1} shrink gap={2}>
            <Text size={14} color={HH.cream} text={whyLine(focused, cash, cred)} />
            {aside === undefined || aside === null ? null : <Label text={aside} />}
          </RuneView>
          <Button tone="coral" onPress={onLeave}>Leave</Button>
        </RuneView>
        {compact ? null : <KeyLegend items={[{ keys: ["↑", "↓"], label: "choose" }, { keys: ["Enter"], label: "buy" }, { keys: ["Esc"], label: "leave" }]} />}
      </RuneView>
    </Scrim>
  );
}

/** The clerk's line for the highlighted row. */
export function whyLine(row: BoardRow | null, cash: number, cred: number): string {
  if (row === null) return "Pick a line, or walk out the door.";
  const block = rowBlock(row, cash, cred);
  if (block === "owned") return `${row.name}: already yours.`;
  if (block === "cred") return `Nobody here sells that to a cred ${cred} courier. Come back at cred ${row.gate}.`;
  if (block === "cash") return `${money(row.price - cash)} short for the ${row.name}.`;
  return row.price <= 0 ? `${row.name}. Enter.` : `${row.name} for ${money(row.price)}. Enter to buy.`;
}
