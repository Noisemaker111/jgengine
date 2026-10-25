import { useEffect, useMemo, type ReactNode } from "react";
import { useDisplayProfile } from "@jgengine/react/display";
import { GameCursor } from "@jgengine/react/gameCursor";
import { GameFrame } from "@jgengine/react/gameFrame";
import { useViewportScrollLock } from "@jgengine/react/gameMenu";
import { useMenuNav } from "@jgengine/react/menuNav";
import { HH, KeyLegend, money, navItem, useMenuSound, useMoveTick, useScreenTouch } from "./kit";

/**
 * One thing on the board: a gun, a box of shells, a car, an engine upgrade. `owned` and `gate` are
 * read from the game, so the same row draws a fresh item, one already in your pocket and one your
 * street cred has not reached yet.
 */
export interface BoardRow {
  id: string;
  name: string;
  /** One short line under the name: what it does, how much is in the box. */
  line?: string;
  /** Cash price. */
  price: number;
  /** Already yours: drawn with the OWNED stamp, and picking it does nothing. */
  owned?: boolean;
  /** Owned as a stack: `×3` beside the name. Picking it still buys another. */
  count?: number;
  /** Street cred level the row needs; above the player's cred it is taped off. */
  gate?: number;
  /** A small tag before the name: a rarity, a tier. */
  tag?: string;
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

/**
 * A shop's price board: the counter's name on a sign, the stock in painted sections with a dotted
 * leader to each price, the courier's cash on a pocket stub, and the keys. Up/down (or the d-pad)
 * picks a row, Enter (or A) buys it, Escape (or B) leaves; every row is also a button for mouse and
 * touch. Rows that can't be bought stay reachable so the board can say why.
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
  /** Anything the shop adds beside the stub: a lap record, a closing time. */
  aside?: ReactNode;
}) {
  const compact = useDisplayProfile().compact;
  const sound = useMenuSound();
  useViewportScrollLock(true);
  useScreenTouch();
  const rows = useMemo(() => sections.flatMap((section) => section.rows), [sections]);
  const ids = useMemo(() => [...rows.map((row) => row.id), "leave"], [rows]);
  const pick = (id: string) => {
    if (id === "leave") {
      sound.play("back");
      onLeave();
      return;
    }
    const row = rows.find((candidate) => candidate.id === id);
    if (row === undefined) return;
    const block = rowBlock(row, cash, cred);
    if (block === "owned") {
      sound.play("back");
      return;
    }
    // A blocked buy still goes to the counter, so the shop's own refusal is what the courier hears.
    sound.play(block === null ? "confirm" : "back");
    row.pick();
  };
  const leave = () => {
    sound.play("back");
    onLeave();
  };
  const nav = useMenuNav({ ids, onConfirm: pick, onBack: leave });
  useMoveTick(nav.activeId);
  const active = rows.find((row) => row.id === nav.activeId) ?? null;
  useEffect(() => {
    if (nav.activeId === null) return;
    document.querySelector(`[data-hh-row="${CSS.escape(nav.activeId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [nav.activeId]);
  return (
    <div className={`hh-counter ${compact ? "compact" : ""}`} data-look={look} role="presentation">
      <GameFrame material={look === "pawn" ? "wood" : "enamel"} tint={look === "pawn" ? "#5b3a22" : look === "house" ? "#2c5a3c" : "#14505c"} cut={look === "pawn" ? "box" : "chamfer"} depth={14} edge={look === "pawn" ? "#2a170b" : HH.cream} edgeWidth={look === "pawn" ? 3 : 3} padding="0" className="hh-board" role="dialog" aria-label={title}>
        <header className="hh-board-head">
          <span className="hh-board-kicker">{kicker}</span>
          <h2 className="hh-board-title">{title}</h2>
          {sub === undefined ? null : <span className="hh-board-sub">{sub}</span>}
        </header>
        <div className="hh-board-felt">
          <nav className="hh-board-list" aria-label={`${title} stock`} {...nav.containerProps}>
            {sections.map((section) => section.rows.length === 0 ? null : (
              <section key={section.id} className="hh-board-section">
                <h3 className="hh-board-rack"><span>{section.title}</span>{section.note === undefined ? null : <small>{section.note}</small>}</h3>
                {section.rows.map((row) => {
                  const block = rowBlock(row, cash, cred);
                  return (
                    <button
                      key={row.id}
                      type="button"
                      className="hh-board-row"
                      data-hh-row={row.id}
                      data-block={block ?? undefined}
                      {...navItem(nav.itemProps(row.id))}
                      onClick={() => { nav.setActive(row.id); pick(row.id); }}
                    >
                      <span className="hh-board-name">
                        {row.tag === undefined ? null : <i className="hh-board-tag">{row.tag}</i>}
                        <b>{row.name}</b>
                        {row.count === undefined || row.count <= 0 ? null : <em className="hh-board-count">×{row.count}</em>}
                      </span>
                      <span className="hh-board-dots" aria-hidden="true" />
                      <span className="hh-board-price">{row.price <= 0 ? "Free" : money(row.price)}</span>
                      {row.line === undefined ? null : <small className="hh-board-line">{row.line}</small>}
                      {block === "owned" ? <i className="hh-board-stamp">Owned</i> : null}
                      {block === "cred" ? <i className="hh-board-tape">Cred {row.gate}</i> : null}
                    </button>
                  );
                })}
              </section>
            ))}
            <GameCursor variant="chevron" color={look === "pawn" ? HH.amber : HH.amber} gap={4} thickness={3} arm={10} />
          </nav>
        </div>
        <footer className="hh-board-foot">
          <span className="hh-stub" aria-live="polite">
            <small>In your pocket</small>
            <b>{money(cash)}</b>
            <span>Street cred {cred}</span>
          </span>
          <span className="hh-board-why" role="status">{whyLine(active, cash, cred)}</span>
          {aside === undefined || aside === null ? null : <span className="hh-board-aside">{aside}</span>}
          <GameFrame
            as="button"
            material="enamel"
            tint={HH.coral}
            cut="slant"
            depth={10}
            edge={HH.night}
            edgeWidth={2}
            padding="7px 18px 6px"
            className="hh-board-leave"
            data-hh-row="leave"
            {...navItem(nav.itemProps("leave"))}
            onClick={leave}
          >
            Leave
          </GameFrame>
        </footer>
        {compact ? null : (
          <div className="hh-board-keys">
            <KeyLegend items={[{ keys: ["↑", "↓"], label: "choose" }, { keys: ["Enter"], label: "buy" }, { keys: ["Esc"], label: "leave" }]} />
          </div>
        )}
      </GameFrame>
    </div>
  );
}

/** The clerk's line for the highlighted row. */
function whyLine(row: BoardRow | null, cash: number, cred: number): string {
  if (row === null) return "Walk out the door.";
  const block = rowBlock(row, cash, cred);
  if (block === "owned") return `${row.name}: already yours.`;
  if (block === "cred") return `Nobody here sells that to a cred ${cred} courier. Come back at cred ${row.gate}.`;
  if (block === "cash") return `${money(row.price - cash)} short for the ${row.name}.`;
  return row.price <= 0 ? `${row.name}. Enter.` : `${row.name} for ${money(row.price)}. Enter to buy.`;
}
