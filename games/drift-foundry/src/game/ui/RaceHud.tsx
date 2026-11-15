/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneAction, RuneGlyph, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { PART_SLOTS } from "../parts/catalog";
import { claimedChange } from "../parts/build";
import type { DriveInput } from "../vehicle/input";
import { FLAG_ARTWORK, GEAR_ARTWORK, LEFT_ARTWORK, PAUSE_ARTWORK, RIGHT_ARTWORK, partArtwork, powerArtwork } from "./artwork";
import { FULL, GUNMETAL, HazardBand, INK, DIM, Label, PEN, ORANGE, RED, Row, STEEL, STENCIL, Stencil, TEAL, Text, YELLOW } from "./pit";

const PINK = "#ff4fa0";
import type { LiveRace, RaceHud as RaceHudModel } from "./hudModel";

/*
 * The aisle from behind the handle. The race board hangs top-left, the next wall is a hanging aisle
 * sign over the floor, the mod rack and the basket ticket sit top-right, the speed cluster is
 * bottom-left, the shutters close along the bottom, and the department is a shelf-edge rule with the
 * walls punched into it. Grabs and tricks pop over the cart. The tree is composed when something
 * changes at a moment; speed, clocks, distances, style and the shutter bar are bound to their leaves.
 */
const MAX_KMH = 140;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export interface HudProps { live: LiveRace; hud: RaceHudModel; onPause: () => void; onSettings: () => void; drive: DriveInput | undefined; touch: boolean }

export function RaceHud({ live, hud, onPause, onSettings, drive, touch }: HudProps) {
  const { width } = useRuneViewport(), phone = width < 600;
  // Every bound leaf reads the same per-write HUD; off the road it holds its last frame.
  let last = hud;
  const now = () => { const next = live.hud(); if (next !== null) last = next; return last; };
  const lower = touch ? phone ? 168 : 112 : 0;
  return <RuneView anchor="fill" onBack={onPause}>
    <Tower hud={hud} now={now} phone={phone} />
    <RuneView anchor="top-right" safe inset={phone ? 10 : 16} gap={8} items="end">
      <Row gap={6}>
        <RuneAction variant="quiet" label="Pause run" run={onPause} padding={[6, 10, 6, 10]} minHeight={38}><Row gap={6}><RuneGlyph artwork={PAUSE_ARTWORK} width={16} height={16} />{phone ? null : <Label color={YELLOW}>P</Label>}</Row></RuneAction>
        <RuneAction variant="quiet" label="Settings" run={onSettings} padding={[6, 10, 6, 10]} minHeight={38}><RuneGlyph artwork={GEAR_ARTWORK} width={18} height={18} /></RuneAction>
      </Row>
      <Rack hud={hud} phone={phone} />
      <Basket hud={hud} now={now} phone={phone} />
    </RuneView>
    <RuneView anchor="center" padding={[0, 0, phone ? 120 : 160, 0]}><Pop now={now} phone={phone} /></RuneView>
    <RuneView anchor="top" safe inset={phone ? 10 : 16} padding={phone ? [170, 0, 0, 0] : 0} gap={6} items="center"><Sign hud={hud} now={now} phone={phone} />{hud.tip === null ? null : <Tip tip={hud.tip} now={now} phone={phone} />}</RuneView>
    {hud.tag === null ? null : <RuneView anchor={phone ? "top" : "right"} safe inset={phone ? 10 : 16} padding={phone ? [252, 0, 0, 0] : 0}><SalvageTag tag={hud.tag} now={now} phone={phone} /></RuneView>}
    {phone ? <RuneView anchor="bottom" safe inset={10} padding={[0, 0, lower, 0]} gap={8} width={width - 20}>
      <Crusher hud={hud} now={now} width={width - 20} />
      <Row gap={8} items="end" width={FULL}><Dash hud={hud} now={now} width={(width - 28) * 0.42} /><Route hud={hud} now={now} width={(width - 28) * 0.58} /></Row>
    </RuneView> : <>
      <RuneView anchor="bottom-left" safe inset={16} padding={[0, 0, lower, 0]}><Dash hud={hud} now={now} width={230} /></RuneView>
      <RuneView anchor="bottom" safe inset={16} padding={[0, 0, lower, 0]}><Crusher hud={hud} now={now} width={Math.min(400, width * 0.32)} /></RuneView>
      <RuneView anchor="bottom-right" safe inset={16} padding={[0, 0, lower, 0]}><Route hud={hud} now={now} width={300} /></RuneView>
    </>}
    {touch ? <TouchPads drive={drive} phone={phone} /> : null}
  </RuneView>;
}

type Now = () => RaceHudModel;

/** The race board: place, lap and the field in order. */
function Tower({ hud, now, phone }: { hud: RaceHudModel; now: Now; phone: boolean }) {
  const { race, event } = hud;
  return <RuneView anchor="top-left" safe inset={phone ? 10 : 16} width={phone ? 150 : 230}>
    <RuneView variant="hud" gap={4} label="Race position">
      <Row justify="between" width={FULL} items="end">
        <Row gap={2} items="end"><Label color={YELLOW}>P</Label><Stencil size={phone ? 28 : 38} color={YELLOW}>{String(race.place)}</Stencil><Label>/{race.total}</Label></Row>
        <RuneView items="end" gap={0}><Label color={INK}>LAP {race.lap}/{race.laps}</Label>
          <Text family={STENCIL} size={phone ? 15 : 18} color={TEAL} text={bind(() => `${now().race.lapTime.toFixed(1)}s`)} /></RuneView>
      </Row>
      {race.standings.map(entry => <Row key={entry.id} gap={8} padding={[2, 6, 2, 0]} fill={entry.id === "player" ? YELLOW : "#00000000"}>
        <RuneView width={22} items="center" fill={entry.id === "player" ? "#141414" : STEEL}><Text family={STENCIL} size={14} color={entry.id === "player" ? YELLOW : INK}>{String(entry.place)}</Text></RuneView>
        <Text size={phone ? 14 : 16} color={entry.id === "player" ? "#141414" : INK}>{entry.name}</Text>
      </Row>)}
      {phone ? null : <RuneView gap={1} padding={[4, 0, 0, 0]}>
        <Label color={YELLOW}>{event.label.toUpperCase()}</Label>
        <Text size={14} color={DIM}>{event.next === null ? "all medals held" : `${event.next.medal}: ${event.next.text}`}</Text>
        {hud.ghost === null ? null : <Text size={14} family={STENCIL} color={bind(() => (now().ghost?.aheadMetres ?? -1) >= 0 ? TEAL : RED)} text={bind(() => {
          const ghost = now().ghost;
          return ghost === null ? "" : `GHOST ${ghost.best.toFixed(1)}s${ghost.aheadMetres === null ? "" : ` · ${ghost.aheadMetres >= 0 ? "+" : "−"}${Math.abs(ghost.aheadMetres)} m`}`;
        })} />}
      </RuneView>}
    </RuneView>
  </RuneView>;
}

/** The next wall as a hanging aisle sign over the floor. */
function Sign({ hud, now, phone }: { hud: RaceHudModel; now: Now; phone: boolean }) {
  const { tone, call, sub } = hud.sign;
  const tint = tone === "launch" ? TEAL : tone === "stop" ? "#e2452e" : YELLOW;
  return <RuneView width={phone ? 250 : 460} fill={tint} border={{ width: 3, color: "#151515" }} role="status" label={call}>
    <HazardBand height={phone ? 6 : 9} blocks={phone ? 14 : 22} />
    <RuneView padding={phone ? [4, 10, 6, 10] : [6, 16, 8, 16]} gap={1} items="center">
      <Text family={STENCIL} size={phone ? 12 : 14} tracking={2} color="#141414" text={bind(() => now().sign.eyebrow)} />
      <Stencil size={phone ? 16 : 24} color="#141414" align="center">{call}</Stencil>
      {phone ? null : <Text size={15} color="#141414" align="center">{sub}</Text>}
    </RuneView>
  </RuneView>;
}

/** The shopping tip hung under the sign: the next shelf grab and which way, or the power-up F fires. */
function Tip({ tip, now, phone }: { tip: NonNullable<RaceHudModel["tip"]>; now: Now; phone: boolean }) {
  return <RuneView variant="hud" width={phone ? 250 : 460} items="center" border={{ width: 2, color: tip.kind === "power" ? PINK : tip.kind === "mod" ? TEAL : YELLOW }} label="Shopping tip">
    <Text size={phone ? 12 : 15} align="center" color={tip.kind === "power" ? PINK : tip.kind === "mod" ? TEAL : YELLOW} text={bind(() => now().tip?.text ?? tip.text)} />
  </RuneView>;
}

/** Four sockets on the handle: what mods are fitted. */
function Rack({ hud, phone }: { hud: RaceHudModel; phone: boolean }) {
  const count = PART_SLOTS.filter((slot) => hud.installed[slot] !== null).length;
  return <RuneView variant="hud" gap={4} label={`Mods ${count} of 4`} items="end">
    {phone ? null : <Label color={YELLOW}>MODS {count}/4</Label>}
    <Row gap={phone ? 4 : 6}>{PART_SLOTS.map(slot => <RuneView key={slot} items="center" gap={1} width={phone ? 30 : 40} padding={[3, 0, 3, 0]} fill={hud.installed[slot] === null ? "#00000040" : STEEL} tooltip={`${slot}: ${hud.installed[slot]?.label ?? "empty"}`}>
      <RuneGlyph artwork={partArtwork(hud.installed[slot]?.id ?? null)} width={phone ? 20 : 24} height={phone ? 20 : 24} />
      {phone ? null : <Label size={10}>{slot === "engine" ? "PUSH" : slot === "front" ? "BMPR" : slot === "wheels" ? "CSTR" : "BSKT"}</Label>}
    </RuneView>)}</Row>
  </RuneView>;
}

const FEEL_TEXT: Record<RaceHudModel["basket"]["feel"], { text: string; color: string }> = {
  empty: { text: "EMPTY · LIGHT AND LIVELY", color: DIM },
  twitchy: { text: "TWITCHY · ADD SOMETHING HEAVY", color: RED },
  balanced: { text: "BALANCED", color: TEAL },
  heavy: { text: "HEAVY · MOMENTUM", color: YELLOW },
  loaded: { text: "LOADED · SLOW OFF THE LINE", color: ORANGE },
};

/** The basket ticket: items against capacity, the till total, how the load handles, the child seat's power-ups. */
function Basket({ hud, now, phone }: { hud: RaceHudModel; now: Now; phone: boolean }) {
  const { items, capacity, feel, powerUps, chassis, squeaky } = hud.basket;
  const tone = FEEL_TEXT[feel];
  return <RuneView variant="hud" gap={4} label="Basket" items="end" width={phone ? 168 : 230}>
    <Row justify="between" width={FULL}><Label color={YELLOW}>{`BASKET ${items}/${capacity}`}</Label><Text family={STENCIL} size={phone ? 16 : 20} color={INK} text={bind(() => `$${Math.round(now().basket.value)}`)} /></Row>
    <RuneView height={8} width={FULL} fill="#0b1530"><RuneView height={8} width={{ fraction: clamp01(items / Math.max(1, capacity)) }} fill={tone.color} /></RuneView>
    <Text size={phone ? 12 : 14} color={tone.color}>{tone.text}</Text>
    {phone ? null : <Text size={13} color={DIM} text={bind(() => `${now().basket.weight.toFixed(1)} kg · ${chassis}${squeaky ? " · squeaky" : ""}`)} />}
    <Row gap={4}>{[0, 1].map(i => { const power = powerUps[i]; return <RuneView key={i} width={phone ? 30 : 38} height={phone ? 30 : 38} items="center" justify="center" fill={power === undefined ? "#00000040" : STEEL} border={{ width: i === 0 && power !== undefined ? 2 : 1, color: i === 0 && power !== undefined ? YELLOW : "#0b1530" }} tooltip={power?.label ?? "empty seat"}>
      {power === undefined ? null : <RuneGlyph artwork={powerArtwork(power.id)} width={phone ? 22 : 28} height={phone ? 22 : 28} />}
    </RuneView>; })}{phone || powerUps.length === 0 ? null : <Label size={11} color={YELLOW}>F</Label>}</Row>
  </RuneView>;
}

/** The newest grab or trick, popped over the cart in signage letters, and the live style total. */
function Pop({ now, phone }: { now: Now; phone: boolean }) {
  return <RuneView items="center" gap={2}>
    <Text family={STENCIL} size={phone ? 18 : 26} align="center" color={bind(() => now().pop?.kind === "style" ? PINK : YELLOW)} text={bind(() => now().pop?.label ?? "")} />
    <Text family={STENCIL} size={phone ? 13 : 16} align="center" color={INK} text={bind(() => {
      const { points, combo } = now().style;
      return points === 0 ? "" : `STYLE ${points}${combo > 1 ? ` · ×${combo}` : ""}`;
    })} />
  </RuneView>;
}

/** A shelf price tag hung on when a mod swap is coming up. */
function SalvageTag({ tag, now, phone }: { tag: NonNullable<RaceHudModel["tag"]>; now: Now; phone: boolean }) {
  const { offered, replacing, armed } = tag;
  const speedDelta = (claimedChange(offered, "topSpeed") - claimedChange(replacing, "topSpeed")) * 3.6;
  return <RuneView width={phone ? 300 : 280} fill="#fff6c9" color={PEN} border={{ width: 2, color: "#1f2430" }} padding={[10, 14, 10, 14]} gap={4} label="Mod decision" radius={6}>
    <Row gap={6}><Text family={STENCIL} size={16} color={ORANGE} text={bind(() => `${now().tag?.metres ?? tag.metres}m`)} /><Label color={PEN}>{offered.slot.toUpperCase()}</Label></Row>
    <Text family={STENCIL} size={17} color={PEN}>{`${offered.label} or keep ${replacing.label}?`}</Text>
    {phone ? null : <Text size={15} color={PEN}>{offered.blurb}</Text>}
    <Text size={15} color={PEN}>{`Speed ${speedDelta > 0 ? "+" : ""}${speedDelta.toFixed(0)} km/h · steering ${(claimedChange(offered, "turnRate") - claimedChange(replacing, "turnRate")).toFixed(1)}`}</Text>
    {offered.slot === "frame" && (offered.grants?.armor ?? 0) > 0 ? <Text size={14} color={PEN}>{armed ? "Shutter protection already armed: this swap adds no extra save." : "This swap restores protection against one shutter clip."}</Text> : null}
    <Label color={PEN}>{phone ? "SWAP pad: hold to swap · pass to keep" : "E hold to swap while passing · pass freely to keep"}</Label>
  </RuneView>;
}

/** The speed cluster: a stencilled readout over a lit bar with the redline painted in. */
function Dash({ hud, now, width }: { hud: RaceHudModel; now: Now; width: number }) {
  const { redline, airborne, bent, armor } = hud.dash;
  const { riding, boosting } = hud;
  const red = clamp01(Math.max(20, Math.round(redline)) / MAX_KMH);
  const kmh = () => Math.max(0, Math.round(now().dash.kmh));
  const lamp = (on: boolean, color: string, label: string) => <Row key={label} gap={3}><RuneView width={8} height={8} radius={4} fill={on ? color : "#30363a"} /><Label size={11} color={on ? color : DIM}>{label}</Label></Row>;
  return <RuneView variant="hud" width={width} gap={5} label="Speed">
    <Row gap={6} items="end"><Text family={STENCIL} size={width < 200 ? 30 : 44} color={INK} text={bind(() => String(kmh()))} /><Label>KM/H</Label></Row>
    <RuneView height={10} width={FULL} fill="#0c0e0f">
      <RuneView pin={[null, 0, 0, 0]} width={{ fraction: 1 - red }} fill="#7a1d12" />
      <RuneView height={10} width={bind(() => ({ fraction: clamp01(kmh() / MAX_KMH) }))} fill={bind(() => kmh() >= redline ? RED : YELLOW)} />
    </RuneView>
    <Row gap={8}>{lamp(airborne, TEAL, "AIR")}{lamp(riding, PINK, "RIDE")}{lamp(boosting, ORANGE, "BOOST")}{lamp(bent, RED, "BENT")}{lamp(armor, YELLOW, "ARMOR")}</Row>
  </RuneView>;
}

/** The shutters behind you: the striped scrubber bar grows across as they close. */
function Crusher({ hud, now, width }: { hud: RaceHudModel; now: Now; width: number }) {
  const { danger, surge } = hud.crusher;
  const metres = () => Math.max(0, Math.round(now().crusher.gap));
  const closed = () => 1 - Math.min(60, Math.max(0, now().crusher.gap)) / 60;
  return <RuneView variant="hud" width={width} gap={4} border={{ width: 2, color: danger ? RED : "#0b1530" }} label="Shutters">
    <Row justify="between" width={FULL}>
      <Label color={danger ? RED : INK}>{surge ? "SHUTTERS · SCRUBBER SURGE" : "SHUTTERS CLOSING"}</Label>
      <Row gap={4}><Text family={STENCIL} size={16} color={danger ? RED : YELLOW} text={bind(() => `${metres()}m`)} /><Label>BEHIND</Label></Row>
    </Row>
    <RuneView height={12} width={FULL} fill="#0b1530" clip>
      <RuneView layout="row" height={12} width={bind(() => ({ fraction: clamp01(closed()) }))} clip>{Array.from({ length: 24 }, (_, i) => <RuneView key={i} width={8} height={12} fill={i % 2 === 0 ? (danger ? RED : YELLOW) : "#141414"} />)}</RuneView>
      <RuneView pin={[null, 2, 4, null]} width={10} height={8} fill={TEAL} />
    </RuneView>
  </RuneView>;
}

/** The department as a shelf-edge rule: walls punched in, the cart riding along it, the haul at stake. */
function Route({ hud, now, width }: { hud: RaceHudModel; now: Now; width: number }) {
  const { gates, length, cleared, clearedIds, atRisk } = hud.route;
  const rule = width - 20 - 16;
  const along = () => clamp01(now().route.z / length);
  return <RuneView variant="hud" width={width} gap={4} label="Aisle">
    <Row justify="between" width={FULL}><Label color={INK}>{`${cleared}/${gates.length} WALLS`}</Label><Text family={STENCIL} size={14} color={YELLOW} text={bind(() => `${Math.floor(along() * 100)}%`)} /></Row>
    <Row gap={2}>
      <RuneView width={rule} height={14} fill={STEEL}>
        {gates.map(gate => <RuneView key={gate.id} pin={[Math.round(gate.atZ / length * rule) - 2, 0, null, null]} width={4} height={14} fill={clearedIds.has(gate.id) ? "#4a5576" : gate.requirement === "jump" ? PINK : YELLOW} />)}
        <RuneView pin={[0, 3, null, null]} width={10} height={8} fill={INK} border={{ width: 1, color: "#141414" }} x={bind(() => along() * (rule - 10))} />
      </RuneView>
      <RuneGlyph artwork={FLAG_ARTWORK} width={14} height={14} />
    </Row>
    <Text size={14} color={DIM} text={bind(() => now().route.next)} />
    <Text family={STENCIL} size={15} color={YELLOW}>{`$${atRisk} AT RISK`}</Text>
  </RuneView>;
}

/** Touch pedals: each pad holds its action while a finger is down on it. */
function TouchPads({ drive, phone }: { drive: DriveInput | undefined; phone: boolean }) {
  const pad = (action: string, label: string, width: number, height: number, fill: string, color: string, art?: string) =>
    <RuneAction key={action} label={label} width={width} height={height} fill={fill} color={color} border={{ width: 2, color: "#0b1530" }} items="center" justify="center" press="#00000040"
      onDrag={gesture => { if (gesture.phase === "down" && !gesture.cancelled) drive?.press(action); else if (gesture.phase === "up" || gesture.cancelled) drive?.release(action); }}>
      {art === undefined ? <Text family={STENCIL} size={label === "GO" ? 18 : 13}>{label}</Text> : <RuneGlyph artwork={art} width={28} height={28} />}
    </RuneAction>;
  const act = phone ? 52 : 56, tall = phone ? 54 : 64;
  return <RuneView anchor="bottom" safe inset={12} width={{ fraction: 1 }} layout="row" justify="between" items="end">
    <Row gap={8}>{pad("steerLeft", "Steer left", 68, 68, GUNMETAL, YELLOW, LEFT_ARTWORK)}{pad("steerRight", "Steer right", 68, 68, GUNMETAL, YELLOW, RIGHT_ARTWORK)}</Row>
    <RuneView gap={6}>
      <Row gap={6}>{pad("jumpHop", "JUMP", act, 42, STEEL, INK)}{pad("usePower", "POWER", act, 42, PINK, "#141414")}{pad("rideBar", "RIDE", act, 42, STEEL, INK)}</Row>
      <Row gap={6}>{pad("salvageSwap", "SWAP", act, 36, STEEL, INK)}{pad("plowBrace", "BRACE", act, 36, STEEL, INK)}</Row>
      <Row gap={6}>{pad("brake", "BRAKE", act, tall, "#7a1d2a", INK)}{pad("throttle", "GO", act * 2 + 6, tall, YELLOW, "#141414")}</Row>
    </RuneView>
  </RuneView>;
}

