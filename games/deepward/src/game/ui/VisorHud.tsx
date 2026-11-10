import { useRef, type CSSProperties, type ReactNode } from "@jgengine/core/ui/jsx";
import { GameIcon } from "@jgengine/core/ui/icons/gameIcons.view";
import { KitButton, KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";
import { HudFade } from "@jgengine/core/hud/hudLayout.view";
import { LiveText, useFrameBind } from "@jgengine/core/ui/liveBind.view";

/*
 * The diver's helmet. Everything in a dive is read off the visor glass: the dive computer on the
 * left wrist edge, the depth strip on the brow, the kit counter on the right. Each readout dims when
 * it has nothing new to say and holds bright (and red) when the air is going.
 *
 * Values that move every tick (air, suit, the body, the rail distance, ammo, the load) arrive as
 * getters and are written straight to their own text, arc, cell or bar node; a panel re-renders only
 * when what it is showing changes shape (sealed tank, a reload starting, the cache filling up).
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

/** A reading's colour as an index, so a live binding can key on value and colour as one number. */
type Tone = 0 | 1 | 2;
const TONES = [TEAL, AMBER, RED] as const;
/** A meter's tone from its shown value: red at 15 and under, amber to 35, teal above. */
const meterTone = (value: number): Tone => value <= 15 ? 2 : value <= 35 ? 1 : 0;
/** The suit's tone from its shown integrity. */
const suitTone = (value: number): Tone => value <= 35 ? 2 : value <= 60 ? 1 : 0;

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

const DIAL_R = 46, DIAL_C = 2 * Math.PI * DIAL_R, DIAL_SWEEP = 0.75;
const DIAL_TICKS = Array.from({ length: 11 }, (_, i) => {
  const a = (135 + i * 27) * (Math.PI / 180);
  const inner = i % 5 === 0 ? 34 : 37;
  return <line key={i} x1={60 + Math.cos(a) * inner} y1={60 + Math.sin(a) * inner} x2={60 + Math.cos(a) * 40} y2={60 + Math.sin(a) * 40} />;
});

/** A 270° dial: the arc is what remains, ticks every tenth. `steps` is the remaining fraction in 200ths. */
function Dial({ steps, tone, children }: { steps: () => number; tone: () => Tone; children: ReactNode }): ReactNode {
  const arcs = useRef<SVGGElement>(null);
  useFrameBind(arcs, () => Math.max(0, Math.min(200, steps())) * 4 + tone(), (key, group) => {
    const shown = Math.floor(key / 4);
    const dash = `${DIAL_C * DIAL_SWEEP * (shown / 200)} ${DIAL_C}`, stroke = TONES[key % 4 as Tone];
    for (const arc of Array.from(group.children)) {
      arc.setAttribute("stroke-dasharray", dash);
      arc.setAttribute("stroke", stroke);
    }
  });
  return (
    <div className="dw-dial">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="56" className="dw-dial-bezel" />
        <circle cx="60" cy="60" r={DIAL_R} className="dw-dial-track" strokeDasharray={`${DIAL_C * DIAL_SWEEP} ${DIAL_C}`} transform="rotate(135 60 60)" />
        <g ref={arcs}>
          <circle cx="60" cy="60" r={DIAL_R} className="dw-dial-glow" transform="rotate(135 60 60)" />
          <circle cx="60" cy="60" r={DIAL_R} className="dw-dial-arc" transform="rotate(135 60 60)" />
        </g>
        <g className="dw-dial-ticks">{DIAL_TICKS}</g>
      </svg>
      <div className="dw-dial-read">{children}</div>
    </div>
  );
}

const CELL_KEYS = Array.from({ length: 10 }, (_, i) => i);

/** Ten cells of a 0–100 meter, lit to the shown value in the colour that value reads as. */
function Cells({ value, tone }: { value: () => number; tone: (shown: number) => Tone }): ReactNode {
  const cells = useRef<HTMLSpanElement>(null);
  useFrameBind(cells, () => Math.ceil(Math.max(0, value())), (shown, row) => {
    const lit = Math.ceil(shown / 10), color = TONES[tone(shown)];
    Array.from(row.children).forEach((cell, i) => {
      const style = (cell as HTMLElement).style;
      style.background = i < lit ? color : "";
      style.boxShadow = i < lit ? `0 0 6px ${color}` : "";
    });
  });
  return <span ref={cells} className="dw-cells" aria-hidden="true">{CELL_KEYS.map(i => <i key={i} />)}</span>;
}

/** A whole-number reading in the colour its value reads as; `as` is the element it is. */
function Figure({ value, tone, as: Tag = "b" }: { value: () => number; tone: (shown: number) => Tone; as?: "b" | "strong" }): ReactNode {
  const figure = useRef<HTMLElement>(null);
  const shown = (): number => Math.ceil(value());
  useFrameBind(figure, shown, (current, element) => {
    element.textContent = String(current);
    element.style.color = TONES[tone(current)];
  });
  return <Tag ref={figure}>{shown()}</Tag>;
}

export interface DiveComputerProps {
  /** Seconds of air left, read every frame. */
  oxygen: () => number;
  /** Suit integrity 0–100, read every frame. */
  health: () => number;
  /** Metres back to the rail, read every frame. */
  rail: () => number;
  tank: number;
  sealed: boolean;
  low: boolean;
  hurt: boolean;
  /** The body below receiving: food and water 0–100, read every frame. */
  body?: { food: () => number; water: () => number };
  seal?: { mark: number; pressure: number; crushing: boolean };
  belt?: { ration: number; water: number; lure: number; lamp: boolean };
}

/** The wrist dive computer: air dial, suit cells and the bearing back to the rail. */
export function DiveComputer({ oxygen, health, rail, tank, sealed, low, hurt, body, seal, belt }: DiveComputerProps): ReactNode {
  // Low air is 25 seconds and under; the whole number shown crosses it at the same moment.
  const airTone = (shown: number): Tone => shown <= 25 ? 2 : shown / tank < 0.5 ? 1 : 0;
  return (
    <HudFade
      watch={() => [Math.floor(oxygen() / 15), Math.ceil(health() / 10), Math.round(rail() / 8), Math.ceil((body?.food() ?? 0) / 10), Math.ceil((body?.water() ?? 0) / 10), seal?.crushing, belt?.ration, belt?.water, belt?.lure, belt?.lamp]}
      hold={() => low || hurt || health() <= 35 || seal?.crushing === true || (body !== undefined && Math.min(body.food(), body.water()) <= 15)}
      idleMs={4000} dimTo={0.6}>
      <section className="dw-computer" aria-label="Dive computer" data-low={low ? "" : undefined}>
        <KitPanel material="hull" cut="chamfer" depth={14} tint="#1b2c33" {...plate(low ? RED : "#04090b")} className="dw-rimmed" padding="10px 14px 10px 10px">
          <div className="dw-computer-face">
            <Dial steps={() => Math.round((oxygen() / tank) * 200)} tone={() => airTone(Math.ceil(oxygen()))}>
              <Figure as="strong" value={oxygen} tone={airTone} />
              <LiveText as="small" get={() => oxygen() === 0 ? "NO AIR" : "SEC AIR"} />
            </Dial>
            <div className="dw-computer-side">
              <span className="dw-tag">{sealed ? "Sealed tank" : "Issue tank"}</span>
              <LiveText className="dw-computer-alarm" role={low ? "alert" : undefined} get={() => oxygen() === 0 ? "Suit bleeding" : low ? "Turn back" : " "} />
              <div className="dw-computer-row"><span className="dw-tag">Suit</span><Cells value={health} tone={suitTone} /><Figure value={health} tone={suitTone} /></div>
              {body !== undefined && <>
                <div className="dw-computer-row"><span className="dw-tag">Food</span><Cells value={body.food} tone={meterTone} /><Figure value={body.food} tone={meterTone} /></div>
                <div className="dw-computer-row"><span className="dw-tag">Water</span><Cells value={body.water} tone={meterTone} /><Figure value={body.water} tone={meterTone} /></div>
              </>}
              {seal !== undefined && <div className="dw-computer-row"><span className="dw-tag">Seal Mk {seal.mark}</span><b style={{ color: seal.crushing ? RED : TEAL }}>P{seal.pressure}{seal.crushing ? "!" : ""}</b></div>}
              {belt !== undefined && belt.ration + belt.water + belt.lure > 0 && <div className="dw-computer-row"><span className="dw-tag">Belt</span><b>{belt.ration}<small>F</small> {belt.water}<small>W</small> {belt.lure}<small>L</small></b></div>}
              <div className="dw-computer-row dw-computer-rail"><GameIcon name="flag" size={15} color={low ? RED : AMBER} /><span className="dw-tag">Rail</span><b><LiveText get={() => Math.round(rail())} /><small>m</small></b></div>
            </div>
          </div>
        </KitPanel>
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
    <HudFade watch={() => room} idleMs={4500} dimTo={0.3}>
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
  capacity: number | null;
  /** Whether a reload is running; its seconds left come from `reloadLeft`. */
  reloading: boolean;
  /** Whether the cache is at its weight limit. */
  full: boolean;
  capacityWeight: number;
  /** Rounds in the hand (null for none), read every frame. */
  loaded: () => number | null;
  reserve: () => number;
  /** Seconds left on the reload, read every frame. */
  reloadLeft: () => number;
  items: () => number;
  mass: () => number;
  onCache: () => void;
}

/** The right edge: what is in the hand and what is on the back. The load half opens the cache. */
export function KitCounter({ weapon, capacity, reloading, full, capacityWeight, loaded, reserve, reloadLeft, items, mass, onCache }: KitCounterProps): ReactNode {
  const short = weapon.includes("/") ? weapon.split("/").pop()!.trim() : weapon;
  const emptyish = (): boolean => { const rounds = loaded(); return rounds !== null && capacity !== null && rounds <= Math.max(1, Math.floor(capacity / 4)); };
  const ammo = useRef<HTMLDivElement>(null);
  useFrameBind(ammo, emptyish, (low, element) => element.toggleAttribute("data-low", low));
  const bar = useRef<HTMLElement>(null);
  useFrameBind(bar, () => Math.min(100, (mass() / capacityWeight) * 100), (width, element) => { element.style.width = `${width}%`; });
  return (
    <HudFade watch={() => [loaded(), reserve(), reloading, items(), mass()]} hold={() => reloading || emptyish()} idleMs={4000} dimTo={0.6}>
      <section className="dw-kit" aria-label="Hand and cache">
        <KitPanel material="hull" cut="chamfer" depth={14} tint="#1b2c33" {...plate("#04090b")} className="dw-rimmed" padding="12px 14px 10px 22px">
          <div className="dw-kit-hand">
            <span className="dw-tag">{short}</span>
            <div ref={ammo} className="dw-kit-ammo">
              {reloading ? <><b className="dw-kit-reload">LOAD</b><LiveText as="small" get={reloadLeft} format={left => `${left.toFixed(1)}s`} /></>
                : <><LiveText as="b" get={() => loaded() ?? "–"} /><small>/{capacity ?? "–"}</small></>}
              <span className="dw-kit-reserve"><GameIcon name="gun" size={14} color={TEAL} /><LiveText get={reserve} /></span>
            </div>
          </div>
          <button type="button" className="dw-kit-load dw-hud-btn" aria-label="Open cache / Tab" onClick={onCache} data-full={full ? "" : undefined}>
            <GameIcon name="backpack" size={18} color={full ? AMBER : TEAL} />
            <span className="dw-kit-bar" aria-hidden="true"><i ref={bar} /></span>
            <b><LiveText get={mass} /><small>/{capacityWeight}kg</small></b>
            <kbd>Tab</kbd>
          </button>
          <LiveText className="dw-kit-items" get={items} format={count => count === 0 ? "Cache empty" : `${count} carried · lost if you die`} />
        </KitPanel>
      </section>
    </HudFade>
  );
}

/** A small hull tab on the helmet edge that holds the dive. */
export function HoldTab({ onPause, disabled }: { onPause: () => void; disabled: boolean }): ReactNode {
  return (
    <HudFade watch={() => disabled} idleMs={3000} dimTo={0.6}>
      <KitButton type="button" material="hull" cut="hex" depth={10} tint="#22363f" {...plate("#04090b")} padding="7px 26px" className="dw-hold dw-hud-btn dw-rimmed" aria-label="Pause / Esc" disabled={disabled} onClick={onPause}>
        <span className="dw-hold-face"><GameIcon name="pause" size={16} color={AMBER} /><kbd>Esc</kbd></span>
      </KitButton>
    </HudFade>
  );
}

/** Marrow's radio: one line of advice on the lower glass, gone when it has been said. */
export function CommsLine({ hint, error }: { hint: string; error: string | null }): ReactNode {
  return (
    <HudFade watch={() => [hint, error]} hold={() => error !== null} idleMs={7000} dimTo={0.22}>
      <div className="dw-comms">
        <span className="dw-comms-tag"><i aria-hidden="true" />Marrow radio</span>
        <p role="status">{hint}</p>
        {error !== null && <p role="alert" className="dw-comms-error">{error}</p>}
      </div>
    </HudFade>
  );
}

/** Crosshair etched on the glass; a hit opens it out. */
export function VisorReticle({ hit }: { hit: boolean }): ReactNode {
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
  brief?: string | undefined;
  /** Marrow's base at a glance: the galley, the power balance and the body. */
  base?: { food: number; water: number; power: number; meals: number; flasks: number };
}

/** At Marrow the visor is up: the departure docket torn off the rail printer, and the keys to walk to it. */
export function Docket({ life, scrip, stash, returns, lost, standing, next, last, brief, base }: DocketProps): ReactNode {
  return (
    <aside className="dw-docket" aria-label="Marrow departure">
        <KitPanel material="paper" cut="torn" depth={9} {...plate("rgba(0,0,0,0.4)")} className="dw-rimmed" padding="14px 18px 22px">
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
      </KitPanel>
    </aside>
  );
}

/** What the diver can act on, as a brass key plate; a search is a filling bar on the glass. */
export function ActionPlate({ label, onAct }: { label: string; onAct: () => void }): ReactNode {
  return (
    <KitButton type="button" material="brass" cut="slant" depth={12} {...plate("#2a1e08")} padding="8px 22px 8px 12px" className="dw-act dw-hud-btn dw-rimmed" onClick={onAct}>
      <span className="dw-act-face"><kbd>E</kbd><span>{label}</span></span>
    </KitButton>
  );
}

/** A held search filling up; `done` is the fraction complete, read every frame. */
export function SearchBar({ done, label = "Searching" }: { done: () => number; label?: string }): ReactNode {
  const bar = useRef<HTMLElement>(null);
  useFrameBind(bar, () => Math.round(Math.max(0, Math.min(1, done())) * 1000) / 10, (width, element) => { element.style.width = `${width}%`; });
  return (
    <div className="dw-search" role="status">
      <span className="dw-tag">{label} · hold still</span>
      <span className="dw-search-bar" aria-hidden="true"><i ref={bar} /></span>
      <small><kbd>E</kbd> cancel</small>
    </div>
  );
}
