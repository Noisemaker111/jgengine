/** @jsxImportSource @jgengine/core/ui/jsx */
import { live } from "@jgengine/core/ui/liveValue";
import { RuneHudFade } from "@jgengine/core/hud/runeHud.view";
import { RuneBox, RuneCells, RuneDial, RuneText, useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { ALL, AMBER, Button, DIM, Frame, FULL, Heading, INK, RED, Row, Tag, TEAL, Text } from "./dock";

const tone = (warn: number, bad: number) => ({ colors: [TEAL, AMBER, RED] as const, warn, bad });
const number = (read: () => number, suffix = "") => live(() => `${Math.ceil(read())}${suffix}`);

export function Visor({ low, hurt }: { low: boolean; hurt: boolean }) {
  const { width, height } = useRuneViewport();
  const radius = Math.min(width, height) * .09;
  return <RuneBox pin={ALL} clip>
    <RuneBox pin={[8, 10, 8, 10]} radius={radius} border={{ width: 7, color: "#02070999" }} shadow={{ y: 0, blur: Math.min(width,height) * .16, inset: true, color: "#01090b9e" }} />
    <RuneBox pin={ALL} gradient={{ angle: 118 * Math.PI / 180, stops: [[0,"#d2faf417"],[.16,"#d2faf405"],[.24,"#d2faf400"]] }} />
    <RuneBox pin={[8,10,8,10]} radius={radius} opacity={hurt ? 1 : low ? .85 : 0} border={{ width: 2, color: "#ff6a52e6" }} shadow={{ y: 0, blur: Math.min(width,height) * .14, inset: true, color: "#ff3c286b" }} />
  </RuneBox>;
}

export interface DiveComputerProps {
  oxygen: () => number; health: () => number; rail: () => number; tank: number; sealed: boolean; low: boolean; hurt: boolean;
  body?: { food: () => number; water: () => number };
  seal?: { mark: number; pressure: number; crushing: boolean };
  belt?: { ration: number; water: number; lure: number; lamp: boolean };
}
export function DiveComputer({ oxygen, health, rail, tank, sealed, low, hurt, body, seal, belt }: DiveComputerProps) {
  const { width } = useRuneViewport();
  const narrow = width < 520;
  const readings: [string, () => number, ReturnType<typeof tone>][] = [["SUIT", health, tone(60, 35)]];
  if (body !== undefined) readings.push(["FOOD", body.food, tone(35,15)], ["WATER", body.water, tone(35,15)]);
  return <RuneHudFade idleMs={4000} dimTo={.6} watch={() => [Math.floor(oxygen()/15),Math.ceil(health()/10),Math.round(rail()/8),Math.ceil((body?.food() ?? 0)/10),Math.ceil((body?.water() ?? 0)/10)]} hold={() => low || hurt || health() <= 35 || seal?.crushing === true}><Frame><Row gap={narrow ? 8 : 12}>
    <RuneDial size={narrow ? 70 : 104} value={live(oxygen)} max={tank} tone={tone(tank * .5, 25)}><RuneText text={number(oxygen)} size={narrow ? 22 : 34} family="Share Tech Mono" color={low ? RED : INK} /><Tag size={narrow ? 8 : 9}>SEC AIR</Tag></RuneDial>
    <RuneBox gap={5} minWidth={narrow ? 92 : 150}>
      {narrow ? null : <Tag>{sealed ? "SEALED TANK" : "ISSUE TANK"}</Tag>}<Text color={RED} size={15}>{low ? "TURN BACK" : " "}</Text>
      {readings.map(([label, read, colors]) => <Row key={label} gap={6}><Tag size={narrow ? 9 : 11}>{label}</Tag><RuneCells value={live(read)} size={narrow ? 4 : 6} tone={colors} /><RuneText text={number(read)} size={18} mono color={INK} /></Row>)}
      {seal === undefined ? null : <Row><Tag>SEAL MK {seal.mark}</Tag><Text color={seal.crushing ? RED : TEAL}>P{seal.pressure}{seal.crushing ? "!" : ""}</Text></Row>}
      {belt === undefined || belt.ration + belt.water + belt.lure === 0 ? null : <Tag>{belt.ration}F {belt.water}W {belt.lure}L</Tag>}
      <Row><Tag color={AMBER}>RAIL</Tag><RuneText text={number(rail, "m")} size={18} mono color={INK} /></Row>
    </RuneBox>
  </Row></Frame></RuneHudFade>;
}
export function DepthStrip({ room }: { room: string }) {
  const split = room.split(" / ");
  return <RuneHudFade idleMs={4500} dimTo={.3} watch={() => room}><Row gap={12}><Tag color={AMBER}>DEPTH</Tag><Text size={26} family="Share Tech Mono">{split[0]}</Text><Tag size={14}>{split.slice(1).join(" / ")}</Tag></Row></RuneHudFade>;
}
export interface KitCounterProps {
  weapon: string; capacity: number | null; reloading: boolean; full: boolean; capacityWeight: number;
  loaded: () => number | null; reserve: () => number; reloadLeft: () => number; items: () => number; mass: () => number; onCache: () => void;
}
export function KitCounter({ weapon, capacity, reloading, full, capacityWeight, loaded, reserve, reloadLeft, items, mass, onCache }: KitCounterProps) {
  const { width } = useRuneViewport();
  const narrow = width < 520;
  return <RuneHudFade idleMs={4000} dimTo={.6} watch={() => [loaded(),reserve(),reloading,items(),mass()]} hold={() => reloading || (loaded() ?? 10) <= Math.max(1,(capacity ?? 4)/4)}><Frame width={narrow ? 160 : 216}><Tag>{weapon.split("/").pop()?.trim() ?? weapon}</Tag>
    <Row items="end"><RuneText size={narrow ? 30 : 40} family="Share Tech Mono" color={reloading ? AMBER : INK} text={live(() => reloading ? "LOAD" : String(loaded() ?? "–"))} /><RuneText size={18} color={DIM} text={live(() => reloading ? `${reloadLeft()}s` : `/${capacity ?? "–"}`)} /></Row>
    <RuneText text={number(reserve, " reserve")} size={16} color={DIM} align="right" />
    <Button onPress={onCache} fill="#00000000" color={INK} padding={2} border={{ width: 0, color: TEAL }} label="Open carried cache"><RuneText text={live(() => `${Math.ceil(mass())}/${capacityWeight}kg`)} size={16} mono color={full ? AMBER : INK} /></Button>
    {narrow ? null : <RuneText text={live(() => `${items()} carried · lost if you die`)} size={12} color={DIM} />}
  </Frame></RuneHudFade>;
}
export function HoldTab({ onPause, disabled }: { onPause: () => void; disabled: boolean }) { return <Button onPress={onPause} disabled={disabled}>Hold / Esc</Button>; }
export function CommsLine({ hint, error }: { hint: string; error: string | null }) {
  const { width } = useRuneViewport();
  return <RuneBox width={Math.min(460, width * .92)} fill="#030c0eb8" padding={[6,14,8,14]} gap={3}><Tag color={AMBER} align="center">HALLOWAY / LINE 06</Tag><Text align="center" color={error ? "#ffb193" : "#e6f3ee"}>{error || hint}</Text></RuneBox>;
}
export function VisorReticle({ hit }: { hit: boolean }) {
  const { width, height } = useRuneViewport();
  const color = hit ? AMBER : "#e8fbf5d9";
  return <RuneBox pin={[width / 2 - 20, height / 2 - 20, null, null]} width={40} height={40}>
    <RuneBox pin={[18,18,null,null]} width={4} height={4} radius={2} fill={color} />
    <RuneBox pin={[0,19,null,null]} width={10} height={2} fill={color} /><RuneBox pin={[null,19,0,null]} width={10} height={2} fill={color} />
    <RuneBox pin={[19,0,null,null]} width={2} height={10} fill={color} /><RuneBox pin={[19,null,null,0]} width={2} height={10} fill={color} />
  </RuneBox>;
}
export interface DocketProps {
  life: number; scrip: number; stash: number; returns: number; lost: number; standing: string; next: string;
  brief?: string | undefined; last?: { kind: string; reason: string } | null;
  base?: { food: number; water: number; power: number; meals: number; flasks: number };
}
export function Docket({ life, scrip, stash, returns, lost, standing, next, last, brief, base }: DocketProps) {
  const { width, height } = useRuneViewport();
  const compact = height < 560;
  const stats = [["SCRIP", scrip], ["STASH", stash], ["RETURNS", returns], ["LOST", lost], ["FOOD", base?.food ?? 0], ["WATER", base?.water ?? 0], ["GALLEY", `${base?.meals ?? 0}/${base?.flasks ?? 0}`], ["POWER", base?.power ?? 0]];
  return <Frame paper width={width < 700 ? 250 : 292}>
    <Tag color="#6b5536">MARROW · LINE 06 · LIFE {String(life).padStart(2,"0")}</Tag><Heading color="#20180e" size={width < 700 ? 19 : 23}>Rail departure / 06</Heading>
    {compact ? null : <Text color="#4a3a26">{brief ?? "Ride to Bellwether. Fill the cache. Ride back before the air runs out."}</Text>}
    {[stats.slice(0,4), stats.slice(4)].map((row, i) => <Row key={i} justify="between">{row.map(([label, value]) => <RuneBox key={label} gap={2}><Tag color="#6b5536" size={10}>{label}</Tag><Text size={compact ? 18 : 22} family="Share Tech Mono" color="#20180e">{value}</Text></RuneBox>)}</Row>)}
    <Text color="#3a2d1d" size={13}>NEXT {next}</Text>{compact ? null : <Text color="#3a2d1d" size={13}>STANDING {standing}</Text>}
    {last == null ? null : <Text color={last.kind === "lost" ? "#a3322a" : "#1f6b4f"} size={12}>{last.kind === "lost" ? "REPRINTED" : "RETURNED"} {last.reason}</Text>}{compact ? null : <Tag color="#5a4630" size={10}>WASD move · E use · Tab cache</Tag>}
  </Frame>;
}
export function ActionPlate({ label, onAct }: { label: string; onAct: () => void }) { return <Button onPress={onAct} padding={[8,22,8,12]}><Text size={17} weight={700} color="#1d1405">E / {label}</Text></Button>; }
export function SearchBar({ done, label = "Searching" }: { done: () => number; label?: string }) {
  const { width } = useRuneViewport();
  const size = Math.min(380, width * .7);
  return <RuneBox width={size} gap={5} fill="#030c0eb8" padding={8}><Tag>{label} · hold still</Tag><RuneBox height={8} width={FULL} fill="#9cddd124"><RuneBox height={8} width={live(() => size * Math.max(0, Math.min(1, done())))} fill={AMBER} /></RuneBox><Tag size={10}>E cancel</Tag></RuneBox>;
}
