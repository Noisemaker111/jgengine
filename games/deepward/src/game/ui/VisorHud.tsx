import type { CSSProperties, ReactNode } from "react";
import { GameFrame } from "@jgengine/react/gameFrame";
import { GameIcon } from "@jgengine/react/gameIcons";
import { HudFade } from "@jgengine/react/hudFade";

/*
 * The diver's helmet. Everything in a dive is read off the visor glass: the dive computer on the
 * left wrist edge, the depth strip on the brow, the kit counter on the right. Each readout dims when
 * it has nothing new to say and holds bright (and red) when the air is going.
 */

const TEAL = "#9cddd1";
const AMBER = "#e2bd6e";
const RED = "#ff6a52";

/*
 * HUD frames draw their rim as a clipped backing plate (`dw-rimmed` in style.css) instead of the
 * frame's stack of drop-shadow filters: a filter over the moving 3D scene is re-run every frame, and
 * six filtered panels halved the dive's frame rate.
 */
const plate = (rim: string): { edge: "none"; shadow: false; style: CSSProperties } => ({ edge: "none", shadow: false, style: { "--dw-rim": rim } as CSSProperties });

/** The helmet rim, glass glare and the low-air alarm wash; nothing in it takes a pointer. */
export function Visor({ low, hurt }: { low: boolean; hurt: boolean }): ReactNode {
  return (
    <div className="dw-visor" data-low={low ? "" : undefined} data-hurt={hurt ? "" : undefined} aria-hidden="true">
      <div className="dw-visor-rim" />
      <div className="dw-visor-glare" />
      <div className="dw-visor-alarm" />
    </div>
  );
}

/** A 270° dial: the arc is what remains, ticks every tenth. */
function Dial({ fraction, color, children }: { fraction: number; color: string; children: ReactNode }): ReactNode {
  const r = 46, c = 2 * Math.PI * r, sweep = 0.75;
  const f = Math.round(Math.max(0, Math.min(1, fraction)) * 200) / 200;
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const a = (135 + i * 27) * (Math.PI / 180);
    const inner = i % 5 === 0 ? 34 : 37;
    return <line key={i} x1={60 + Math.cos(a) * inner} y1={60 + Math.sin(a) * inner} x2={60 + Math.cos(a) * 40} y2={60 + Math.sin(a) * 40} />;
  });
  return (
    <div className="dw-dial">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="56" className="dw-dial-bezel" />
        <circle cx="60" cy="60" r={r} className="dw-dial-track" strokeDasharray={`${c * sweep} ${c}`} transform="rotate(135 60 60)" />
        <circle cx="60" cy="60" r={r} className="dw-dial-glow" stroke={color} strokeDasharray={`${c * sweep * f} ${c}`} transform="rotate(135 60 60)" />
        <circle cx="60" cy="60" r={r} className="dw-dial-arc" stroke={color} strokeDasharray={`${c * sweep * f} ${c}`} transform="rotate(135 60 60)" />
        <g className="dw-dial-ticks">{ticks}</g>
      </svg>
      <div className="dw-dial-read">{children}</div>
    </div>
  );
}

/** Ten cells of suit integrity. */
function Cells({ value, max, color }: { value: number; max: number; color: string }): ReactNode {
  const lit = Math.ceil((Math.max(0, value) / max) * 10);
  return <span className="dw-cells" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} style={i < lit ? { background: color, boxShadow: `0 0 6px ${color}` } : undefined} />)}</span>;
}

export interface DiveComputerProps {
  oxygen: number;
  tank: number;
  health: number;
  rail: number;
  sealed: boolean;
  low: boolean;
  hurt: boolean;
  /** The body and the suit below receiving: food, water, the seal against this floor's pressure, the belt. */
  body?: { food: number; water: number };
  seal?: { mark: number; pressure: number; crushing: boolean };
  belt?: { ration: number; water: number; lure: number; lamp: boolean };
}

/** The wrist dive computer: air dial, suit cells and the bearing back to the rail. */
export function DiveComputer({ oxygen, tank, health, rail, sealed, low, hurt, body, seal, belt }: DiveComputerProps): ReactNode {
  const meter = (value: number) => value <= 15 ? RED : value <= 35 ? AMBER : TEAL;
  const fraction = oxygen / tank;
  const color = low ? RED : fraction < 0.5 ? AMBER : TEAL;
  const suit = health <= 35 ? RED : health <= 60 ? AMBER : TEAL;
  return (
    <HudFade watch={[Math.floor(oxygen / 15), Math.ceil(health / 10), Math.round(rail / 8), Math.ceil((body?.food ?? 0) / 10), Math.ceil((body?.water ?? 0) / 10), seal?.crushing, belt?.ration, belt?.water, belt?.lure, belt?.lamp]} hold={low || hurt || health <= 35 || seal?.crushing === true || (body !== undefined && Math.min(body.food, body.water) <= 15)} idleMs={4000} dimTo={0.6}>
      <section className="dw-computer" aria-label="Dive computer" data-low={low ? "" : undefined}>
        <GameFrame material="hull" cut="chamfer" depth={14} tint="#1b2c33" {...plate(low ? RED : "#04090b")} className="dw-rimmed" padding="10px 14px 10px 10px">
          <div className="dw-computer-face">
            <Dial fraction={fraction} color={color}>
              <strong style={{ color }}>{Math.ceil(oxygen)}</strong>
              <small>{oxygen === 0 ? "NO AIR" : "SEC AIR"}</small>
            </Dial>
            <div className="dw-computer-side">
              <span className="dw-tag">{sealed ? "Sealed tank" : "Issue tank"}</span>
              <span className="dw-computer-alarm" role={low ? "alert" : undefined}>{oxygen === 0 ? "Suit bleeding" : low ? "Turn back" : " "}</span>
              <div className="dw-computer-row"><span className="dw-tag">Suit</span><Cells value={health} max={100} color={suit} /><b style={{ color: suit }}>{Math.ceil(health)}</b></div>
              {body !== undefined && <>
                <div className="dw-computer-row"><span className="dw-tag">Food</span><Cells value={body.food} max={100} color={meter(body.food)} /><b style={{ color: meter(body.food) }}>{Math.ceil(body.food)}</b></div>
                <div className="dw-computer-row"><span className="dw-tag">Water</span><Cells value={body.water} max={100} color={meter(body.water)} /><b style={{ color: meter(body.water) }}>{Math.ceil(body.water)}</b></div>
              </>}
              {seal !== undefined && <div className="dw-computer-row"><span className="dw-tag">Seal Mk {seal.mark}</span><b style={{ color: seal.crushing ? RED : TEAL }}>P{seal.pressure}{seal.crushing ? "!" : ""}</b></div>}
              {belt !== undefined && belt.ration + belt.water + belt.lure > 0 && <div className="dw-computer-row"><span className="dw-tag">Belt</span><b>{belt.ration}<small>F</small> {belt.water}<small>W</small> {belt.lure}<small>L</small></b></div>}
              <div className="dw-computer-row dw-computer-rail"><GameIcon name="flag" size={15} color={low ? RED : AMBER} /><span className="dw-tag">Rail</span><b>{Math.round(rail)}<small>m</small></b></div>
            </div>
          </div>
        </GameFrame>
      </section>
    </HudFade>
  );
}

/** The brow strip: how deep this room sits on the line, ruled like a depth gauge. */
export function DepthStrip({ room }: { room: string }): ReactNode {
  const match = /^(\d+)\s*\/\s*(.*)$/.exec(room);
  const depth = match === null ? "00" : match[1]!.padStart(2, "0");
  const name = match === null ? room : match[2]!;
  return (
    <HudFade watch={[room]} idleMs={4500} dimTo={0.3}>
      <div className="dw-depth" aria-label={`Depth ${depth}, ${name}`}>
        <span className="dw-depth-rule" aria-hidden="true" />
        <span className="dw-depth-mark"><small>DEPTH</small><b>{depth}</b></span>
        <span className="dw-depth-room">{name}</span>
        <span className="dw-depth-rule" aria-hidden="true" />
      </div>
    </HudFade>
  );
}

export interface KitCounterProps {
  weapon: string;
  loaded: number | null;
  capacity: number | null;
  reserve: number;
  reloading: number | null;
  items: number;
  mass: number;
  capacityWeight: number;
  onCache: () => void;
}

/** The right edge: what is in the hand and what is on the back. The load half opens the cache. */
export function KitCounter({ weapon, loaded, capacity, reserve, reloading, items, mass, capacityWeight, onCache }: KitCounterProps): ReactNode {
  const short = weapon.includes("/") ? weapon.split("/").pop()!.trim() : weapon;
  const emptyish = loaded !== null && capacity !== null && loaded <= Math.max(1, Math.floor(capacity / 4));
  const full = mass >= capacityWeight;
  return (
    <HudFade watch={[loaded, reserve, reloading === null, items, mass]} hold={reloading !== null || emptyish} idleMs={4000} dimTo={0.6}>
      <section className="dw-kit" aria-label="Hand and cache">
        <GameFrame material="hull" cut="chamfer" depth={14} tint="#1b2c33" {...plate("#04090b")} className="dw-rimmed" padding="12px 14px 10px 22px">
          <div className="dw-kit-hand">
            <span className="dw-tag">{short}</span>
            <div className="dw-kit-ammo" data-low={emptyish ? "" : undefined}>
              {reloading !== null ? <><b className="dw-kit-reload">LOAD</b><small>{reloading.toFixed(1)}s</small></>
                : <><b>{loaded ?? "–"}</b><small>/{capacity ?? "–"}</small></>}
              <span className="dw-kit-reserve"><GameIcon name="gun" size={14} color={TEAL} />{reserve}</span>
            </div>
          </div>
          <button type="button" className="dw-kit-load dw-hud-btn" aria-label="Open cache / Tab" onClick={onCache} data-full={full ? "" : undefined}>
            <GameIcon name="backpack" size={18} color={full ? AMBER : TEAL} />
            <span className="dw-kit-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (mass / capacityWeight) * 100)}%` }} /></span>
            <b>{mass}<small>/{capacityWeight}kg</small></b>
            <kbd>Tab</kbd>
          </button>
          <span className="dw-kit-items">{items === 0 ? "Cache empty" : `${items} carried · lost if you die`}</span>
        </GameFrame>
      </section>
    </HudFade>
  );
}

/** A small hull tab on the helmet edge that holds the dive. */
export function HoldTab({ onPause, disabled }: { onPause: () => void; disabled: boolean }): ReactNode {
  return (
    <HudFade watch={[disabled]} idleMs={3000} dimTo={0.6}>
      <GameFrame as="button" type="button" material="hull" cut="hex" depth={10} tint="#22363f" {...plate("#04090b")} padding="7px 26px" className="dw-hold dw-hud-btn dw-rimmed" aria-label="Pause / Esc" disabled={disabled} onClick={onPause}>
        <span className="dw-hold-face"><GameIcon name="pause" size={16} color={AMBER} /><kbd>Esc</kbd></span>
      </GameFrame>
    </HudFade>
  );
}

/** Marrow's radio: one line of advice on the lower glass, gone when it has been said. */
export function RadioLine({ hint, error }: { hint: string; error: string | null }): ReactNode {
  return (
    <HudFade watch={[hint, error]} hold={error !== null} idleMs={7000} dimTo={0.22}>
      <div className="dw-comms">
        <span className="dw-comms-tag"><i aria-hidden="true" />Marrow radio</span>
        <p role="status">{hint}</p>
        {error !== null && <p role="alert" className="dw-comms-error">{error}</p>}
      </div>
    </HudFade>
  );
}

/** Crosshair etched on the glass; a hit opens it out. */
export function Reticle({ hit }: { hit: boolean }): ReactNode {
  return (
    <svg className="dw-sight" data-hit={hit ? "" : undefined} viewBox="0 0 40 40" aria-hidden="true">
      <g className="dw-sight-under"><circle cx="20" cy="20" r="1.6" /><path d={hit ? "M20 3v8M20 29v8M3 20h8M29 20h8" : "M20 9v6M20 25v6M9 20h6M25 20h6"} /></g>
      <circle cx="20" cy="20" r="1.6" />
      <path d={hit ? "M20 3v8M20 29v8M3 20h8M29 20h8" : "M20 9v6M20 25v6M9 20h6M25 20h6"} />
    </svg>
  );
}

export interface DocketProps {
  life: number;
  scrip: number;
  stash: number;
  returns: number;
  lost: number;
  standing: string;
  next: string;
  last: { kind: "extracted" | "lost"; reason: string } | null;
  /** Halloway's current line from Marrow's world, in place of the stock brief. */
  brief?: string;
  /** Marrow's base at a glance: the galley, the power balance and the body. */
  base?: { food: number; water: number; power: number; meals: number; flasks: number };
}

/** At Marrow the visor is up: the departure docket torn off the rail printer, and the keys to walk to it. */
export function Docket({ life, scrip, stash, returns, lost, standing, next, last, brief, base }: DocketProps): ReactNode {
  return (
    <aside className="dw-docket" aria-label="Marrow departure">
        <GameFrame material="paper" cut="torn" depth={9} {...plate("rgba(0,0,0,0.4)")} className="dw-rimmed" padding="14px 18px 22px">
          <span className="dw-docket-line"><span>Marrow · line 06</span><span>Life {String(life).padStart(2, "0")}</span></span>
          <h2>Rail departure / 06</h2>
          <p className="dw-docket-brief">{brief ?? "Ride to Bellwether. Fill the cache. Ride back before the air runs out."}</p>
          <dl>
            <div><dt>Scrip</dt><dd>{scrip}</dd></div>
            <div><dt>Stash</dt><dd>{stash}</dd></div>
            <div><dt>Returns</dt><dd>{returns}</dd></div>
            <div><dt>Lost</dt><dd>{lost}</dd></div>
            {base !== undefined && <>
              <div><dt>Food</dt><dd>{Math.ceil(base.food)}</dd></div>
              <div><dt>Water</dt><dd>{Math.ceil(base.water)}</dd></div>
              <div><dt>Galley</dt><dd>{Math.floor(base.meals)}/{Math.floor(base.flasks)}</dd></div>
              <div><dt>Power</dt><dd>{base.power}</dd></div>
            </>}
          </dl>
          <p className="dw-docket-next"><b>Next</b> {next}</p>
          <p className="dw-docket-standing"><b>Standing</b> {standing}</p>
          {last !== null && <p className="dw-docket-last" data-kind={last.kind}><span className="dw-stamp">{last.kind === "extracted" ? "Returned" : "Reprinted"}</span>{last.reason}</p>}
          <p className="dw-docket-keys" aria-hidden="true"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk <kbd>E</kbd> use <kbd>F</kbd> lamp <kbd>Q</kbd> eat <kbd>G</kbd> lure <kbd>C</kbd> scan <kbd>Esc</kbd> hold</p>
      </GameFrame>
    </aside>
  );
}

/** What the diver can act on, as a brass key plate; a search is a filling bar on the glass. */
export function ActionPlate({ label, onAct }: { label: string; onAct: () => void }): ReactNode {
  return (
    <GameFrame as="button" type="button" material="brass" cut="slant" depth={12} {...plate("#2a1e08")} padding="8px 22px 8px 12px" className="dw-act dw-hud-btn dw-rimmed" onClick={onAct}>
      <span className="dw-act-face"><kbd>E</kbd><span>{label}</span></span>
    </GameFrame>
  );
}

export function SearchBar({ remaining, total, label = "Searching" }: { remaining: number; total: number; label?: string }): ReactNode {
  return (
    <div className="dw-search" role="status">
      <span className="dw-tag">{label} · hold still</span>
      <span className="dw-search-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, ((total - remaining) / total) * 100)}%` }} /></span>
      <small><kbd>E</kbd> cancel</small>
    </div>
  );
}
