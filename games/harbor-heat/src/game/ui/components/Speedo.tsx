/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo, useRef } from "@jgengine/core/ui/jsx";
import { formatSpeed } from "@jgengine/core/format/speed";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useActionGlyph } from "@jgengine/core/ui/kit/uiKitRoot.view";
import { LiveText, useFrameBind } from "@jgengine/core/ui/liveBind.view";
import { vehicleById } from "../../entities/vehicles/catalog";
import { drivingStore, streetPlayOf, type VehicleTelemetry } from "../../streetPlay";
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
  return (def.dynamics.type === "ground" ? def.dynamics.tuning.engine.topSpeed : def.dynamics.topSpeed) * 3.6;
}

/** What the dash is: re-rendered only when you change vehicle, mode or stall. Speed, gear and revs are live. */
function dashOf(ctx: GameContext) {
  const id = drivingStore.read(ctx);
  if (id == null) return null;
  const t = streetPlayOf(ctx).telemetry();
  const name = ctx.scene.entity.get(id)?.name;
  const def = name === undefined ? undefined : vehicleById(name);
  const redline = def?.dynamics.type === "ground" ? def.dynamics.tuning.engine.gearbox?.redlineRpm ?? 7600 : 0;
  const aircraft = t.mode === "aircraft";
  return { label: def?.label ?? "Vehicle", top: dialTop(topKmhOf(name)), redline: aircraft ? 0 : redline, stalled: t.stalled, aircraft, vtol: aircraft && t.vtol };
}

/** The dial sweeps 240 degrees, from 0 at lower left to the top speed at lower right. */
const SWEEP = 240;
const START = -120;
const TICKS = Array.from({ length: 13 }, (_, i) => i);
const LAMPS = Array.from({ length: 10 }, (_, i) => i);

/** Polar point on the dial face, angle in degrees clockwise from straight up. */
function at(angle: number, radius: number): [number, number] {
  const rad = (angle * Math.PI) / 180;
  return [70 + Math.sin(rad) * radius, 70 - Math.cos(rad) * radius];
}

const kmhOf = (t: VehicleTelemetry): number => Number(formatSpeed(t.speedMs, { unit: "kmh", decimals: 0, showUnit: false })) || 0;

function Dial({ telemetry, top }: { telemetry: () => VehicleTelemetry; top: number }) {
  const needle = useRef<SVGGElement>(null);
  useFrameBind(needle, () => START + (Math.min(kmhOf(telemetry()), top) / top) * SWEEP, (angle, element) => { element.style.transform = `rotate(${angle}deg)`; });
  const red = at(START + SWEEP * 0.78, 52);
  const end = at(START + SWEEP, 52);
  return (
    <svg className="hh-dial" viewBox="0 0 140 140" aria-hidden="true">
      <circle cx="70" cy="70" r="66" className="hh-dial-rim" />
      <circle cx="70" cy="70" r="60" className="hh-dial-face" />
      <path d={`M ${red[0]} ${red[1]} A 52 52 0 0 1 ${end[0]} ${end[1]}`} className="hh-dial-red" />
      {TICKS.map((i) => {
        const angle = START + (SWEEP / 12) * i;
        const [x1, y1] = at(angle, i % 2 === 0 ? 46 : 50);
        const [x2, y2] = at(angle, 56);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={i % 2 === 0 ? "hh-dial-major" : "hh-dial-minor"} />;
      })}
      {TICKS.filter((i) => i % 2 === 0).map((i) => {
        const [x, y] = at(START + (SWEEP / 12) * i, 35);
        const value = Math.round((top / 12) * i);
        return <text key={i} x={x} y={y + 4} className="hh-dial-num" data-long={value >= 100 ? "" : undefined}>{value}</text>;
      })}
      <g ref={needle} style={{ transformOrigin: "70px 70px", transition: "transform 120ms linear" }}>
        <path d="M 67.5 78 L 70 14 L 72.5 78 Z" className="hh-dial-needle" />
      </g>
      <circle cx="70" cy="70" r="7" className="hh-dial-hub" />
    </svg>
  );
}

/** The gear letter on the LCD, red in reverse. */
function Gear({ telemetry }: { telemetry: () => VehicleTelemetry }) {
  const gear = useRef<HTMLElement>(null);
  const shown = (): string => { const g = telemetry().gear; return g < 0 ? "R" : g === 0 ? "N" : String(g); };
  useFrameBind(gear, shown, (text, element) => {
    element.textContent = text;
    element.toggleAttribute("data-reverse", text === "R");
  });
  return <i ref={gear} className="hh-dash-gear">{shown()}</i>;
}

/** Ten rev lamps in tenths of the redline; the last two are red. */
function Revs({ telemetry, redline }: { telemetry: () => VehicleTelemetry; redline: number }) {
  const lamps = useRef<HTMLSpanElement>(null);
  useFrameBind(lamps, () => Math.min(10, Math.round((telemetry().rpm / redline) * 10)), (lit, row) => {
    Array.from(row.children).forEach((lamp, i) => lamp.toggleAttribute("data-on", i < lit));
  });
  return (
    <span ref={lamps} className="hh-dash-revs" aria-hidden="true">
      {LAMPS.map((i) => <i key={i} data-red={i >= 8 ? "" : undefined} />)}
    </span>
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
 * The needle, the km/h, the gear, the revs and the altitude write their own nodes every frame.
 */
export function Speedo() {
  const ctx = useGameContext();
  const dash = useGameStore(dashOf);
  // One telemetry read per store version, shared by every live part of the dash.
  const telemetry = useMemo(() => {
    let version = -1;
    let latest: VehicleTelemetry | null = null;
    return (): VehicleTelemetry => {
      const now = ctx.version();
      if (latest === null || now !== version) { version = now; latest = streetPlayOf(ctx).telemetry(); }
      return latest;
    };
  }, [ctx]);
  if (dash === null) return null;
  return (
    <div className="hh-dash" data-stalled={dash.stalled ? "" : undefined}>
      <div className="hh-dash-gauge">
        <Dial telemetry={telemetry} top={dash.top} />
        <span className="hh-dash-lcd">
          {dash.aircraft ? null : <Gear telemetry={telemetry} />}
          <LiveText as="b" get={() => kmhOf(telemetry())} /><small>km/h</small>
        </span>
        {dash.redline <= 0 ? null : <Revs telemetry={telemetry} redline={dash.redline} />}
        <span className="hh-dash-badge">{dash.label}</span>
        {dash.aircraft ? <LiveText className="hh-dash-lamp" data-alarm={dash.stalled ? "" : undefined} get={() => { const t = telemetry(); return t.stalled ? "Stall" : `${Math.round(t.altitude)} m up`; }} /> : null}
      </div>
      <div className="hh-dash-prompts">
        {dash.vtol ? <SeatPrompt action="flightVectorToggle" label="Switch to wings" /> : null}
        <SeatPrompt action="exitVehicle" label="Get out" />
      </div>
    </div>
  );
}
