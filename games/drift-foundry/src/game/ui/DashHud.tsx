import type { CSSProperties, ReactNode } from "react";
import { GameFrame, type GameMaterial } from "@jgengine/react/gameFrame";
import { GameIcon, type GameIconName } from "@jgengine/react/gameIcons";
import { HudFade } from "@jgengine/react/hudFade";
import type { RaceSnapshot } from "../race/standings";
import type { DriftFoundryPartDef, PartSlotId } from "../parts/catalog";
import { PART_SLOTS } from "../parts/catalog";
import { ROUTE_GATES, type RouteGate } from "../route/gates";
import { PartIcon } from "./components/PartIcon";

/*
 * Row Six from the driver's seat. The buggy's dash is a welded gauge cluster bottom-left, the race
 * tower hangs top-left like a pit-lane timing board, the next barrier is a painted gate sign over the
 * road, the compactor is a hazard-striped crusher bar behind you, and the corridor is a steel ruler
 * with the barriers punched into it.
 */

const YELLOW = "#f2c230";
const TEAL = "#5de0ce";
const ROUTE_LENGTH = 470;

/*
 * Frames here paint their rim as a clipped backing plate (`fd-rimmed` in style.css) rather than the
 * frame's stack of drop-shadow filters: a filter over the moving road is re-run every frame.
 */
export const plate = (rim: string): { edge: "none"; shadow: false; style: CSSProperties } => ({ edge: "none", shadow: false, style: { "--fd-rim": rim } as CSSProperties });

/** Speed on a 240° dial: the needle is its own layer and turns on the compositor. */
export function Tach({ kmh, redline, airborne, bent, armor }: { kmh: number; redline: number; airborne: boolean; bent: boolean; armor: boolean }): ReactNode {
  const MAX = 140, START = 150, SWEEP = 240;
  const speed = Math.max(0, Math.round(kmh));
  const at = (v: number) => START + (SWEEP * Math.min(MAX, Math.max(0, v))) / MAX;
  const polar = (deg: number, r: number) => [100 + Math.cos((deg * Math.PI) / 180) * r, 100 + Math.sin((deg * Math.PI) / 180) * r] as const;
  const arc = (from: number, to: number, r: number) => {
    const [x1, y1] = polar(at(from), r), [x2, y2] = polar(at(to), r);
    const large = at(to) - at(from) > 180 ? 1 : 0;
    return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  const red = Math.min(MAX, Math.max(20, Math.round(redline)));
  const ticks: ReactNode[] = [];
  for (let v = 0; v <= MAX; v += 10) {
    const major = v % 20 === 0;
    const [x1, y1] = polar(at(v), major ? 66 : 71), [x2, y2] = polar(at(v), 78);
    ticks.push(<line key={v} x1={x1} y1={y1} x2={x2} y2={y2} className={major ? "fd-tach-major" : "fd-tach-minor"} data-red={v >= red ? "" : undefined} />);
    if (major) {
      const [tx, ty] = polar(at(v), 54);
      ticks.push(<text key={`n${v}`} x={tx} y={ty + 4} className="fd-tach-num" data-red={v >= red ? "" : undefined}>{v}</text>);
    }
  }
  return (
    <div className="fd-tach" role="img" aria-label={`${speed} kilometres an hour`}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <linearGradient id="fd-bezel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8c9499" />
            <stop offset="0.45" stopColor="#3b4245" />
            <stop offset="1" stopColor="#15191b" />
          </linearGradient>
          <radialGradient id="fd-face" cx="0.5" cy="0.42" r="0.6">
            <stop offset="0" stopColor="#24282a" />
            <stop offset="1" stopColor="#070808" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="98" fill="#050606" />
        <circle cx="100" cy="100" r="95" fill="url(#fd-bezel)" />
        <circle cx="100" cy="100" r="86" fill="url(#fd-face)" />
        <path d={arc(red, MAX, 82)} className="fd-tach-redline" />
        {speed > 0 ? <path d={arc(0, Math.min(speed, MAX), 82)} className="fd-tach-lit" /> : null}
        {ticks}
        <text x="100" y="80" className="fd-tach-brand">ROW SIX</text>
      </svg>
      <div className="fd-tach-needle" style={{ transform: `rotate(${at(speed).toFixed(1)}deg)` }} aria-hidden="true">
        <svg viewBox="0 0 200 200"><path d="M92 97 L176 99.2 L176 100.8 L92 103 Z" /><circle cx="100" cy="100" r="9" /></svg>
      </div>
      <div className="fd-tach-read">
        <b>{speed}</b>
        <small>km/h</small>
      </div>
      <div className="fd-tach-lamps">
        <Lamp on={airborne} tone="teal" label="Air" />
        <Lamp on={bent} tone="red" label="Bent" />
        <Lamp on={armor} tone="yellow" label="Armor" />
      </div>
    </div>
  );
}

function Lamp({ on, tone, label }: { on: boolean; tone: "teal" | "red" | "yellow"; label: string }): ReactNode {
  return <span className="fd-lamp" data-tone={tone} data-on={on ? "" : undefined}><i aria-hidden="true" />{label}</span>;
}

/** The pit-lane timing board: place, lap and the field in order. */
export function TimingTower({ race, event, ghost }: { race: RaceSnapshot; event?: { label: string; next: { medal: string; text: string } | null }; ghost?: { best: number; aheadMetres: number | null } | null }): ReactNode {
  return (
    <HudFade watch={[race.place, race.lap, race.standings.map((entry) => entry.id).join()]} idleMs={5000} dimTo={0.55} className="fd-tower-wrap">
      <section className="fd-tower" aria-label="Race position">
        <header className="fd-tower-head">
          <span className="fd-tower-pos"><small>P</small>{race.place}<em>/{race.total}</em></span>
          <span className="fd-tower-lap"><span>LAP {race.lap}/{race.laps}</span><em>{race.lapTime.toFixed(1)}s</em></span>
        </header>
        <ol className="fd-tower-field">
          {race.standings.map((entry) => (
            <li key={entry.id} data-you={entry.id === "player" ? "" : undefined}><b>{entry.place}</b><span>{entry.name}</span></li>
          ))}
        </ol>
        {event === undefined ? null : (
          <footer className="fd-tower-event" data-medal={event.next?.medal}>
            <span>{event.label}</span>
            <em>{event.next === null ? "all medals held" : `${event.next.medal}: ${event.next.text}`}</em>
            {ghost == null ? null : (
              <strong className="fd-tower-ghost" data-ahead={ghost.aheadMetres !== null && ghost.aheadMetres >= 0 ? "" : undefined}>
                GHOST {ghost.best.toFixed(1)}s{ghost.aheadMetres === null ? "" : ` · ${ghost.aheadMetres >= 0 ? "+" : "−"}${Math.abs(ghost.aheadMetres)} m`}
              </strong>
            )}
          </footer>
        )}
      </section>
    </HudFade>
  );
}

/** The next barrier as a painted gate sign hung over the road. */
export function GateSign({ eyebrow, call, sub, tone }: { eyebrow: string; call: string; sub: string; tone: "plow" | "jump" | "launch" | "stop" | "home" }): ReactNode {
  const tint = tone === "launch" ? TEAL : tone === "stop" ? "#e2452e" : YELLOW;
  return (
    <HudFade watch={[call, eyebrow.replace(/\d+ ?m$/, "")]} hold={tone === "launch" || tone === "stop"} idleMs={6000} dimTo={0.7} className="fd-sign-wrap">
      <GameFrame material="enamel" cut="chamfer" depth={10} tint={tint} {...plate("#151515")} padding="0" className="fd-rimmed fd-sign" data-tone={tone}>
        <span className="fd-sign-band" aria-hidden="true" />
        <span className="fd-sign-body" role="status">
          <span className="fd-sign-eyebrow">{eyebrow}</span>
          <b className="fd-sign-call">{call}</b>
          <span className="fd-sign-sub">{sub}</span>
        </span>
      </GameFrame>
    </HudFade>
  );
}

/** The compactor behind you: the striped jaw grows across the bar as it closes. */
export function CrusherBar({ gap, surge }: { gap: number; surge: boolean }): ReactNode {
  const metres = Math.max(0, Math.round(gap));
  const danger = gap < 22;
  const closed = Math.round((1 - Math.min(60, Math.max(0, gap)) / 60) * 1000) / 10;
  return (
    <HudFade watch={[Math.round(gap / 6), danger, surge]} hold={danger || surge} idleMs={4000} dimTo={0.5} className="fd-crusher-wrap">
      <div className="fd-crusher" data-danger={danger ? "" : undefined} aria-label={`Compactor ${metres} metres behind`}>
        <span className="fd-crusher-label">COMPACTOR{surge ? <em> surge</em> : null}</span>
        <span className="fd-crusher-track" aria-hidden="true">
          <span className="fd-crusher-jaw" style={{ transform: `translateX(${(closed - 100).toFixed(1)}%)` }} />
          <span className="fd-crusher-car" />
        </span>
        <span className="fd-crusher-gap"><b>{metres}m</b> BEHIND</span>
      </div>
    </HudFade>
  );
}

/** The corridor as a steel rule: barriers punched in, the buggy riding along it, the haul at stake. */
export function RouteRule({ z, cleared, next, atRisk, length = ROUTE_LENGTH, gates = ROUTE_GATES }: { z: number; cleared: ReadonlySet<string>; next: string; atRisk: number; length?: number; gates?: readonly RouteGate[] }): ReactNode {
  const along = Math.round((Math.min(length, Math.max(0, z)) / length) * 1000) / 10;
  return (
    <HudFade watch={[cleared.size, next.replace(/\d+m/, ""), atRisk]} idleMs={5000} dimTo={0.55} className="fd-route-wrap">
      <section className="fd-route" aria-label="Corridor">
        <header className="fd-route-head"><span><b>{gates.filter((gate) => cleared.has(gate.id)).length}</b>/{gates.length} barriers</span><span>{Math.floor(along)}%</span></header>
        <div className="fd-route-rule" aria-hidden="true">
          {gates.map((gate) => (
            <i key={gate.id} className="fd-route-gate" data-cleared={cleared.has(gate.id) ? "" : undefined} data-kind={gate.requirement} data-shortcut={gate.route === "main" ? undefined : ""} style={{ left: `${(gate.atZ / length) * 100}%` }} />
          ))}
          <span className="fd-route-ride" style={{ transform: `translateX(${along}%)` }}><span className="fd-route-car" /></span>
          <span className="fd-route-flag"><GameIcon name="flag" size={14} color={YELLOW} /></span>
        </div>
        <p className="fd-route-next">{next}</p>
        <p className="fd-route-risk"><b>{atRisk} cr AT RISK</b></p>
      </section>
    </HudFade>
  );
}

/** Four sockets on the dash: what is bolted on. */
export function BuildRack({ installed }: { installed: Readonly<Record<PartSlotId, DriftFoundryPartDef | null>> }): ReactNode {
  const count = PART_SLOTS.filter((slot) => installed[slot] !== null).length;
  return (
    <HudFade watch={PART_SLOTS.map((slot) => installed[slot]?.id ?? null)} idleMs={5000} dimTo={0.5} className="fd-rack-wrap">
      <section className="fd-rack" aria-label={`Build ${count} of 4`}>
        <span className="fd-rack-label">BUILD {count}/4</span>
        <span className="fd-rack-sockets">
          {PART_SLOTS.map((slot) => (
            <span key={slot} className="fd-socket" data-empty={installed[slot] === null ? "" : undefined} title={`${slot}: ${installed[slot]?.label ?? "empty"}`}>
              <PartIcon partId={installed[slot]?.id ?? null} />
              <small>{slot === "engine" ? "ENG" : slot === "front" ? "FRT" : slot === "wheels" ? "WHL" : "FRM"}</small>
            </span>
          ))}
        </span>
      </section>
    </HudFade>
  );
}

/** A manila parts tag tied on when a swap is coming up. */
export function SalvageTag({ children }: { children: ReactNode }): ReactNode {
  return (
    <GameFrame as="aside" material="paper" cut="ticket" depth={10} {...plate("rgba(40,26,10,0.55)")} padding="12px 16px 12px 20px" className="fd-rimmed fd-tag" aria-label="Salvage decision">
      {children}
    </GameFrame>
  );
}

/** A steel tab on the dash rail. */
export function DashTab({ icon, label, keyCap, onPress, material = "steel" }: { icon: GameIconName; label: string; keyCap?: string; onPress: () => void; material?: GameMaterial }): ReactNode {
  return (
    <GameFrame as="button" type="button" material={material} cut="slant" depth={9} tint="#3d4448" {...plate("#0b0d0e")} padding="7px 18px 7px 14px" className="fd-rimmed fd-hud-btn fd-tab" aria-label={label} onClick={onPress}>
      <span className="fd-tab-face"><GameIcon name={icon} size={16} color={YELLOW} />{keyCap === undefined ? null : <kbd>{keyCap}</kbd>}</span>
    </GameFrame>
  );
}

