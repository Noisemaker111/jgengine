import { formatSpeed } from "@jgengine/core/format/speed";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGameStore } from "@jgengine/react/hooks";
import { useActionGlyph } from "@jgengine/react/uiKitRoot";
import { vehicleById } from "../../entities/vehicles/catalog";
import { drivingStore, handrollOf } from "../../handroll";
import { KeyCap } from "../fiction/kit";

/** Label steps a dial face can count in; the face shows six of them, so every number is round. */
const STEPS = [10, 20, 25, 30, 40, 50, 60, 80, 100, 125, 150, 200];

/** The dial's full scale for a vehicle: its top speed with a little headroom, in round numbers. */
export function dialTop(topKmh: number): number {
  const need = (Math.max(60, topKmh) * 1.08) / 6;
  return (STEPS.find((step) => step >= need) ?? Math.ceil(need / 50) * 50) * 6;
}

function topKmhOf(name: string | undefined): number {
  const def = name === undefined ? undefined : vehicleById(name);
  if (def === undefined) return 220;
  return (def.dynamics.type === "ground" ? def.dynamics.tuning.topSpeed : def.dynamics.tuning.maxSpeed) * 3.6;
}

function speedoView(ctx: GameContext) {
  const id = drivingStore.read(ctx);
  if (id == null) return null;
  const t = handrollOf(ctx).telemetry();
  const name = ctx.scene.entity.get(id)?.name;
  const def = name === undefined ? undefined : vehicleById(name);
  const air = t.mode !== "aircraft" ? null : t.stalled ? "Stall" : `${Math.round(t.altitude)} m up`;
  const redline = def?.dynamics.type === "ground" ? def.dynamics.tuning.powertrain?.redlineRpm ?? 7600 : 0;
  // Revs in tenths of the redline, so the store only republishes when a lamp changes.
  const revs = t.mode === "aircraft" || redline <= 0 ? null : Math.min(10, Math.round((t.rpm / redline) * 10));
  const gear = t.mode === "aircraft" ? null : t.gear < 0 ? "R" : t.gear === 0 ? "N" : String(t.gear);
  return { label: def?.label ?? "Vehicle", top: dialTop(topKmhOf(name)), kmh: formatSpeed(t.speedMs, { unit: "kmh", decimals: 0, showUnit: false }), air, stalled: t.stalled, aircraft: t.mode === "aircraft", vtol: t.mode === "aircraft" && t.vtol, gear, revs };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The dial sweeps 240 degrees, from 0 at lower left to the top speed at lower right. */
const SWEEP = 240;
const START = -120;

/** Polar point on the dial face, angle in degrees clockwise from straight up. */
function at(angle: number, radius: number): [number, number] {
  const rad = (angle * Math.PI) / 180;
  return [70 + Math.sin(rad) * radius, 70 - Math.cos(rad) * radius];
}

function Dial({ kmh, top }: { kmh: number; top: number }) {
  const needle = START + (Math.min(kmh, top) / top) * SWEEP;
  const ticks = Array.from({ length: 13 }, (_, i) => i);
  const red = at(START + SWEEP * 0.78, 52);
  const end = at(START + SWEEP, 52);
  return (
    <svg className="hh-dial" viewBox="0 0 140 140" aria-hidden="true">
      <circle cx="70" cy="70" r="66" className="hh-dial-rim" />
      <circle cx="70" cy="70" r="60" className="hh-dial-face" />
      <path d={`M ${red[0]} ${red[1]} A 52 52 0 0 1 ${end[0]} ${end[1]}`} className="hh-dial-red" />
      {ticks.map((i) => {
        const angle = START + (SWEEP / 12) * i;
        const [x1, y1] = at(angle, i % 2 === 0 ? 46 : 50);
        const [x2, y2] = at(angle, 56);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={i % 2 === 0 ? "hh-dial-major" : "hh-dial-minor"} />;
      })}
      {ticks.filter((i) => i % 2 === 0).map((i) => {
        const [x, y] = at(START + (SWEEP / 12) * i, 35);
        const value = Math.round((top / 12) * i);
        return <text key={i} x={x} y={y + 4} className="hh-dial-num" data-long={value >= 100 ? "" : undefined}>{value}</text>;
      })}
      <g style={{ transform: `rotate(${needle}deg)`, transformOrigin: "70px 70px", transition: "transform 120ms linear" }}>
        <path d="M 67.5 78 L 70 14 L 72.5 78 Z" className="hh-dial-needle" />
      </g>
      <circle cx="70" cy="70" r="7" className="hh-dial-hub" />
    </svg>
  );
}

/** A key-and-label tag for what you can do from the driver's seat; hidden on touch, which has its own buttons. */
function SeatPrompt({ action, label }: { action: string; label: string }) {
  const glyph = useActionGlyph(action);
  if (glyph === undefined) return null;
  return (
    <span className="hh-act passive">
      <KeyCap wide={glyph.length > 2}>{glyph}</KeyCap>
      <span>{label}</span>
    </span>
  );
}

/**
 * Only while driving: the car's own dash dial (cream face, coral needle, km/h on a little LCD), the
 * badge of what you are driving, an altitude lamp that turns red on a stall in the air, and how to get out.
 */
export function Speedo() {
  const view = useGameStore(speedoView, same);
  if (view === null) return null;
  const kmh = Number(view.kmh) || 0;
  return (
    <div className="hh-dash" data-stalled={view.stalled ? "" : undefined}>
      <div className="hh-dash-gauge">
        <Dial kmh={kmh} top={view.top} />
        <span className="hh-dash-lcd">
          {view.gear === null ? null : <i className="hh-dash-gear" data-reverse={view.gear === "R" ? "" : undefined}>{view.gear}</i>}
          <b>{view.kmh}</b><small>km/h</small>
        </span>
        {view.revs === null ? null : (
          <span className="hh-dash-revs" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => <i key={i} data-on={i < (view.revs ?? 0) ? "" : undefined} data-red={i >= 8 ? "" : undefined} />)}
          </span>
        )}
        <span className="hh-dash-badge">{view.label}</span>
        {view.air === null ? null : <span className="hh-dash-lamp" data-alarm={view.stalled ? "" : undefined}>{view.air}</span>}
      </div>
      <div className="hh-dash-prompts">
        {view.vtol ? <SeatPrompt action="flightVectorToggle" label="Switch to wings" /> : null}
        <SeatPrompt action="exitVehicle" label="Get out" />
      </div>
    </div>
  );
}
