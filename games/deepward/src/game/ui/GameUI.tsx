/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useState } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneLabel, RuneRoot, RuneTransient, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind, runePulse } from "@jgengine/core/ui/rune/primitives";
import { useActionBindings } from "@jgengine/core/input/actionBindings.view";
import { allActionCodes } from "@jgengine/core/input/actionBindings";
import { useSceneSwapping } from "@jgengine/core/ui/sceneSwap.view";
import { useBrowserSuspension } from "@jgengine/core/runtime/browserLifecycle.view";
import { registerNativeRuneFont } from "@jgengine/core/ui/rune/nativeSurface.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import { useOptionalGamePhase } from "@jgengine/ui/hooks";
import { useSettings } from "@jgengine/core/settings/settings.view";
import { useGameContext } from "@jgengine/ui/provider";
import { useStore } from "@jgengine/ui/store";
import { useGameStore } from "@jgengine/ui/hooks";
import { Button, CREAM, crumbTheme, Frame, GOLD, GREEN, Heading, Meter, MUTED, RED, Row, Section, Sheet, SKY, Tag, Text } from "./dock";
import { nearby, storageChanged, viewStore } from "../controls";
import { clockText, footprint, hasGear, isDawn, lightsOn, littlesOf, roomOf, twoHanded, type Run } from "../state";
import { loadOf } from "../haul";
import { completeSets, defOf, displayName, ITEMS, kindOf, SETS, SET_IDS, tradeValue, type Item, type ItemKind } from "../loot";
import { LITTLES, LITTLE_IDS } from "../littles";
import { NIGHTS, nightOf } from "../runGen";
import { CHARTS, missing, nextGoal, packOf, RECIPES, UPGRADES, UPGRADE_IDS, wellFed, type Cost } from "../burrow";
import { ItemMark } from "./ItemMark";
import { CrumbMenu, RecordSettings } from "./menu/CrumbMenu";
import { RECORD_KEY } from "../save";
import { ZONE_NAME, type Zone } from "../../world";
import { GAME_FONTS } from "../../art/look";

type Command = (name: string, input?: unknown) => unknown;
for (const face of [GAME_FONTS.display, GAME_FONTS.body, GAME_FONTS.numeric]) if (face !== undefined) registerNativeRuneFont(resolveAssetBaseUrl(face.src));
const NO_PACK: Run["pack"] = [];

export function GameUI() {
  const ctx = useGameContext(), phase = useOptionalGamePhase(), settings = useSettings(), bindings = useActionBindings();
  const screen = useStore(viewStore, v => ({ panel: v.panel, mode: v.mode, paused: v.paused, out: v.run !== null && v.mode === "run" }));
  const swapping = useSceneSwapping(), menu = phase === "menu" || (phase === "paused" && screen.panel === null && (screen.mode === "home" || screen.mode === "run"));
  const command: Command = (name, input = {}) => ctx.game.commands.run(`deepward.${name}`, input);
  const close = () => { command("close"); };
  const notices = useMemo(() => ({ read: ctx.game.notices.list, subscribe: ctx.game.notices.subscribe }), [ctx]);
  useBrowserSuspension(() => { const v = viewStore.read(ctx); if (v.panel === null && !v.paused && (v.mode === "home" || v.mode === "run")) command("pause", { paused: true }); });
  useEffect(() => {
    const pack = bindings["crumbPack"], codes = pack === undefined ? [] : allActionCodes(pack);
    const key = (e: KeyboardEvent) => {
      if (e.repeat || settings.isOpen) return;
      const v = viewStore.read(ctx);
      if (codes.includes(e.code) && v.panel === "pack") { e.preventDefault(); e.stopImmediatePropagation(); command("pack"); }
      else if (e.code === "Escape" && v.panel === null && !v.paused && (v.mode === "home" || v.mode === "run")) { e.preventDefault(); e.stopImmediatePropagation(); command("pause"); }
    };
    const storage = (e: StorageEvent) => { if (e.key === null || e.key.startsWith(RECORD_KEY)) storageChanged(ctx); };
    window.addEventListener("keydown", key, true); window.addEventListener("storage", storage);
    return () => { window.removeEventListener("keydown", key, true); window.removeEventListener("storage", storage); };
  }, [ctx, settings.isOpen, bindings]);
  return <RuneRoot context={ctx} theme={crumbTheme}>
    <RuneView anchor="fill" hidden={menu}>
      <RuneView anchor="top-right" safe inset={18}><Button onPress={() => command("pause")}>Hold still / Esc</Button></RuneView>
      {screen.out ? <RunHud /> : screen.mode === "home" ? <HomeHud /> : null}
      <RuneView anchor="bottom" safe inset={20} gap={8} maxWidth={620} responsive={{ phone: { maxWidth: 340 } }}><Prompt command={command} /><Radio /></RuneView>
      {screen.panel === "stash" ? <StashSheet command={command} close={close} /> : screen.panel === "workbench" ? <WorkbenchSheet command={command} close={close} /> : screen.panel === "nook" ? <NookSheet command={command} close={close} /> : screen.panel === "pack" ? <PackSheet command={command} close={close} /> : screen.panel === "report" ? <ReportSheet close={close} /> : null}
      {screen.mode === "caught" ? <CaughtSheet command={command} /> : screen.mode === "saving" || screen.mode === "blocked" ? <SaveSheet command={command} /> : null}
      {swapping ? <RuneView anchor="fill" fill="#140c08" justify="center" items="center" gap={8}><Heading>Creeping on…</Heading><Text color={MUTED} text={bind(() => { const v = viewStore.read(ctx); return v.run === null ? "Home to the burrow." : roomOf(v.run).template.name; })} /></RuneView> : null}
    </RuneView>
    {menu ? <CrumbMenu key={phase} /> : null}
    {settings.isOpen ? <Sheet title="Settings" close={settings.close}><RecordSettings /></Sheet> : null}
    <RuneView anchor="top" safe inset={70} gap={6} maxWidth={560}><RuneTransient source={notices} expire={ctx.game.notices.prune}>{notice => <Frame padding={10}><Text color={notice.tone === "deny" ? RED : GOLD}>{notice.text}</Text></Frame>}</RuneTransient></RuneView>
  </RuneRoot>;
}

function RunHud() {
  const ctx = useGameContext(), view = () => viewStore.read(ctx), run = () => view().run;
  const { width } = useRuneViewport(), phone = width < 600;
  const pulse = useMemo(() => runePulse(() => run()?.health, 200), [ctx]);
  const gear = useGameStore(c => { const r = viewStore.read(c).run; return r === null ? "" : r.pack.filter(i => defOf(i).gear !== undefined).map(i => kindOf(i)).join(","); });
  return <>
    <RuneView anchor="top-left" safe inset={20} maxWidth={420} responsive={{ phone: { maxWidth: 230 } }} gap={4}>
      <Tag color={GOLD} text={bind(() => { const r = run(); if (r === null) return ""; const p = roomOf(r); return p.depth === 0 ? "THE CRACK HOME IS HERE" : `${p.depth} ROOM${p.depth === 1 ? "" : "S"} FROM THE CRACK`; })} />
      <Heading size={phone ? 20 : 26} text={bind(() => { const r = run(); return r === null ? "" : roomOf(r).template.name; })} />
      <Text color={MUTED} text={bind(() => { const r = run(); if (r === null) return ""; const p = roomOf(r); const lit = lightsOn(r, p) ? "The light is ON. " : ""; return `${lit}${p.exits.length > 0 ? `Way out here: ${p.exits.map(e => e.label).join(", ")}.` : "No way out here: go back, or find one deeper."}`; })} />
    </RuneView>
    <RuneView anchor="bottom-left" safe inset={20} responsive={{ phone: { padding: [0, 0, 150, 0] } }}>
      <Frame width={310} responsive={{ phone: { width: width - 40, padding: 12, gap: 8 } }} scale={bind(() => 1 + pulse.get() * 0.03)}>
        <Row justify="between"><Tag text={bind(() => { const r = run(); return r === null ? "" : `${LITTLES[r.little].name.toUpperCase()} ${LITTLES[r.little].title.toUpperCase()}`; })} />
          <RuneLabel value={bind(() => { const r = run(); return r === null ? "" : clockText(r); })} family="Fredoka" size={phone ? 20 : 26} color={bind(() => { const r = run(); return r !== null && r.elapsed > r.nightSeconds - 60 ? RED : GOLD; })} /></Row>
        <Meter value={bind(() => { const r = run(); return { fraction: r === null ? 0 : Math.min(1, r.elapsed / r.nightSeconds) }; })} color={bind(() => { const r = run(); return r !== null && isDawn(r) ? RED : SKY; })} height={4} />
        <Tag color={SKY} text={bind(() => { const r = run(); return r === null ? "" : NIGHTS[nightOf(r.seed)].name.toUpperCase(); })} />
        <Row justify="between"><Tag>HEALTH</Tag><RuneLabel value={bind(() => Math.ceil(run()?.health ?? 0))} format={n => `${Math.ceil(n)}`} family="Fredoka" size={20} color={bind(() => (run()?.health ?? 100) < 35 ? RED : GREEN)} /></Row>
        <Meter value={bind(() => { const r = run(); return { fraction: r === null ? 0 : Math.max(0, r.health / r.maxHealth) }; })} color={bind(() => (run()?.health ?? 100) < 35 ? RED : GREEN)} />
        <Row justify="between"><Tag>NOTICED</Tag><Tag color={bind(() => view().sneaking ? GREEN : MUTED)} text={bind(() => view().sneaking ? "SNEAKING" : view().noise > 12 ? "LOUD" : view().noise > 0 ? "FOOTSTEPS" : "STILL")} /></Row>
        <Meter value={bind(() => ({ fraction: Math.min(1, view().danger) }))} color={bind(() => view().danger > 0.6 ? RED : GOLD)} height={5} />
        <Text color={RED} text={bind(() => { const r = run(); if (r === null) return ""; if (isDawn(r)) return "DAWN: THE FAMILY IS WAKING. GET OUT!"; if (r.elapsed > r.nightSeconds - 60) return "Nearly dawn. Head for a way out."; return ""; })} />
      </Frame>
    </RuneView>
    <RuneView anchor="bottom-right" safe inset={20} responsive={{ phone: { padding: [0, 0, 64, 0] } }}>
      <Frame width={240} responsive={{ phone: { width: width - 40, layout: "row", items: "center", justify: "between", padding: 10 } }}>
        <Tag>PACK</Tag>
        <Text size={phone ? 18 : 24} family="Fredoka" text={bind(() => { const r = run(); if (r === null) return ""; const load = loadOf(r.pack, r.capacity, LITTLES[r.little]); return `${r.pack.length} things · ${load.mass}/${r.capacity}`; })} />
        <Text color={RED} text={bind(() => { const r = run(); return r !== null && twoHanded(r) ? "Two arms full: slow, no running" : ""; })} />
        {gear === "" ? null : <Row gap={4}>{gear.split(",").map(k => <ItemMark key={k} kind={k as ItemKind} size={24} />)}</Row>}
        <Button onPress={() => ctx.game.commands.run("deepward.pack", {})}>Repack / Tab</Button>
      </Frame>
    </RuneView>
    <RuneView anchor="center" padding={[150, 0, 0, 0]} maxWidth={520} responsive={{ phone: { maxWidth: 300 } }}><Text align="center" size={phone ? 16 : 20} family="Fredoka" color={RED} text={bind(() => { const r = run(); return r === null ? "" : tellOf(r); })} /></RuneView>
    <RuneView anchor="center"><Text size={22} color={bind(() => (run()?.hurt ?? 0) > 0 ? RED : "#fff3e0a0")}>·</Text></RuneView>
  </>;
}
/** The loudest tell in the room right now, so a hunter's intent is readable at a glance. */
function tellOf(run: Run): string {
  const t = run.threats;
  if (t.some(s => s.kind === "cat" && s.mode === "crouch")) return "The Cat is crouching, tail swishing. MOVE or HIDE!";
  if (t.some(s => s.kind === "cat" && s.mode === "pounce")) return "POUNCE!";
  if (t.some(s => s.kind === "kid" && s.mode === "looking")) return (t.find(x => x.kind === "kid")?.seen ?? 0) > 0.4 ? "The kid has seen you! Get out of sight!" : "The kid is sitting up, looking around. Hide!";
  if (t.some(s => s.kind === "dog" && s.mode === "awake")) return "The dog is awake and barking.";
  if (t.some(s => s.kind === "spider" && s.mode === "bite")) return "The spider rears up to bite!";
  if (t.some(s => s.kind === "cat" && (s.mode === "stalk" || s.mode === "listen"))) return "The Cat heard something. Keep still, or sneak (C).";
  if (t.some(s => s.kind === "roomba" && s.mode === "sweep")) return "The Roomba is sweeping. Stay out of its lane.";
  return "";
}
function HomeHud() {
  const ctx = useGameContext(), read = () => viewStore.read(ctx);
  return <RuneView anchor="top-left" safe inset={20}><Frame width={360} responsive={{ phone: { width: 230 } }}>
    <Tag color={GOLD}>THE BURROW · INSIDE THE KITCHEN WALL</Tag>
    <Heading text={bind(() => `Night ${read().home.nextRun}`)} />
    <Text text={bind(() => { const h = read().home; return `${h.caps} caps · ${h.stash.length} stashed · ${h.extractions} safe home · ${h.caught} caught`; })} />
    <Text color={GOLD} text={bind(() => { const h = read().home; return `${LITTLES[h.little].name} ${LITTLES[h.little].title} goes next${h.bring.length > 0 ? `, with ${h.bring.length} gear` : ""}.`; })} />
    <Text color={MUTED} text={bind(() => nextGoal(read().home))} />
  </Frame></RuneView>;
}
function Radio() {
  const ctx = useGameContext();
  return <RuneView fill="#1a120dcc" radius={10} padding={[6, 12, 6, 12]}><Text align="center" size={15} text={bind(() => { const v = viewStore.read(ctx); return v.error && v.mode !== "saving" && v.mode !== "blocked" ? v.error : v.hint; })} /></RuneView>;
}
function Prompt({ command }: { command: Command }) {
  const ctx = useGameContext();
  const prompt = useGameStore(c => { const v = viewStore.read(c); return { channel: v.run?.channel?.kind ?? null, target: v.panel === null && !v.paused ? nearby(c)?.label ?? null : null }; });
  if (prompt.channel !== null) return <RuneView width={300} gap={5}><Tag>{prompt.channel === "search" ? "RUMMAGING / HOLD STILL" : prompt.channel === "cross" ? "ON THE WAY / HOLD STILL" : prompt.channel === "exit" ? "SQUEEZING OUT / HOLD STILL" : "CAREFULLY / HOLD STILL"}</Tag>
    <Meter value={bind(() => { const c = viewStore.read(ctx).run?.channel; return { fraction: c == null ? 0 : 1 - c.remaining / c.total }; })} color={GOLD} /></RuneView>;
  return prompt.target === null ? null : <Button onPress={() => command("interact")}>{`E · ${prompt.target}`}</Button>;
}

function costText(cost: Cost): string {
  const parts = Object.entries(cost.items).map(([k, n]) => `${n} ${ITEMS[k as ItemKind].name.toLowerCase()}`);
  if (cost.caps > 0) parts.push(`${cost.caps} caps`);
  return parts.length === 0 ? "free" : parts.join(" + ");
}
function StashSheet({ command, close }: { command: Command; close: () => void }) {
  const { home, hint, error } = useStore(viewStore, v => ({ home: v.home, hint: v.hint, error: v.error }));
  const [filter, setFilter] = useState<"all" | "gear" | "food" | "part" | "curio">("all");
  const shown = home.stash.filter(i => filter === "all" || defOf(i).category === filter);
  return <Sheet title="The matchbox stash" close={close}>
    <Tag color={GOLD}>{`${home.caps} BOTTLE CAPS · ${home.stash.length} THINGS · SAFE AT HOME`}</Tag>
    <Text>Gear you pack rides in your pack and works while carried, but a caught Little loses it. Trading pays caps.</Text>
    <Row gap={6}>{(["all", "gear", "food", "part", "curio"] as const).map(f => <Button key={f} fill={filter === f ? GOLD : "#bfa684"} onPress={() => setFilter(f)}>{f === "all" ? "All" : f === "part" ? "Parts" : f === "curio" ? "Curios" : f[0]!.toUpperCase() + f.slice(1)}</Button>)}</Row>
    {shown.length === 0 ? <Text color={MUTED}>Empty shelves. Bring something home from the house.</Text> : shown.map(item => { const def = defOf(item), packed = home.bring.includes(item.id);
      return <Section key={item.id}>
        <Row><ItemMark kind={kindOf(item)} /><RuneView grow={1} shrink gap={2}><Heading size={20}>{displayName(item)}</Heading><Text color={MUTED}>{`${item.rarity} · ${def.category}${def.bulky ? " · two arms" : ""}${def.noisy ? " · jingles" : ""}${def.set ? ` · ${SETS[def.set].name}` : ""} · weight ${item.mass}`}</Text></RuneView></Row>
        <Text>{def.flavor}</Text>
        <Row gap={6}>{def.gear !== undefined ? <Button onPress={() => command("bring", { uid: item.id, on: !packed })}>{packed ? "Packed / unpack" : "Pack for the run"}</Button> : null}<Button onPress={() => command("trade", { id: item.id })}>{`Trade · ${tradeValue(item)} caps`}</Button></Row>
      </Section>; })}
    <Heading>Sets</Heading>
    <Text color={MUTED}>Carry every piece home in one run: each piece is worth more together, and the set pays a bonus.</Text>
    {SET_IDS.map(id => { const set = SETS[id], have = new Set(home.stash.map(i => i.baseId)); return <Section key={id}>
      <Row justify="between"><Heading size={19}>{set.name}</Heading><Tag color={home.sets.includes(id) ? GREEN : MUTED}>{home.sets.includes(id) ? "BANKED" : `+${set.bonus} CAPS`}</Tag></Row>
      <Row gap={4}>{set.pieces.map(p => <RuneView key={p} opacity={have.has(p) ? 1 : 0.35}><ItemMark kind={p} size={26} /></RuneView>)}</Row>
      <Text color={MUTED}>{set.pieces.map(p => ITEMS[p].name).join(" · ")}</Text></Section>; })}
    <Text role="status" color={error ? RED : MUTED}>{error || hint}</Text>
  </Sheet>;
}
function WorkbenchSheet({ command, close }: { command: Command; close: () => void }) {
  const { home, hint, error } = useStore(viewStore, v => ({ home: v.home, hint: v.hint, error: v.error }));
  return <Sheet title="The reel workbench" close={close}>
    <Tag color={GOLD}>{`${home.caps} CAPS · COSTS COME FROM THE STASH`}</Tag>
    <Heading>Burrow</Heading>
    {UPGRADE_IDS.map(id => { const def = UPGRADES[id], level = home.upgrades[id], next = def.levels[level], need = next === undefined ? [] : missing(home.stash, home.caps, next.cost);
      return <Section key={id}>
        <Row justify="between"><Heading size={20}>{def.name}</Heading><Tag>{`LEVEL ${level}/${def.levels.length}`}</Tag></Row>
        <Text color={MUTED}>{def.flavor}</Text>
        {next === undefined ? <Text color={GREEN}>Finished.</Text> : <><Text>{next.effect}</Text><Text color={MUTED}>{`Cost: ${costText(next.cost)}`}</Text>
          <Button disabled={need.length > 0} onPress={() => command("upgrade", { id })}>{need.length > 0 ? `Need ${need.join(", ")}` : `Build ${def.name}`}</Button></>}
      </Section>; })}
    <Heading>Craft gear</Heading>
    {RECIPES.map(r => { const need = missing(home.stash, home.caps, { items: r.needs, caps: r.caps }), locked = home.upgrades.workbench < r.bench;
      return <Section key={r.makes}><Row><ItemMark kind={r.makes} /><Heading size={19} grow={1} shrink>{ITEMS[r.makes].name}</Heading></Row>
        <Text color={MUTED}>{ITEMS[r.makes].flavor}</Text><Text color={MUTED}>{`From ${costText({ items: r.needs, caps: r.caps })}`}</Text>
        <Button disabled={locked || need.length > 0} onPress={() => command("craft", { kind: r.makes })}>{locked ? "Needs the workbench vise" : need.length > 0 ? `Need ${need.join(", ")}` : "Make it"}</Button></Section>; })}
    <Heading>Charts</Heading>
    {(Object.keys(CHARTS) as (keyof typeof CHARTS)[]).map(zone => { const chart = CHARTS[zone], have = home.zones.includes(zone as Zone), need = missing(home.stash, home.caps, chart.cost);
      return <Section key={zone}><Row justify="between"><Heading size={19}>{ZONE_NAME[zone as Zone]}</Heading><Tag color={have ? GREEN : MUTED}>{have ? "CHARTED" : costText(chart.cost)}</Tag></Row>
        <Text color={MUTED}>{chart.flavor}</Text>
        {have ? null : <Button disabled={home.upgrades.mapRoom < 1 || need.length > 0} onPress={() => command("chart", { zone })}>{home.upgrades.mapRoom < 1 ? "Build the map room first" : need.length > 0 ? `Need ${need.join(", ")}` : "Chart it"}</Button>}</Section>; })}
    <Text role="status" color={error ? RED : MUTED}>{error || hint}</Text>
  </Sheet>;
}
function NookSheet({ command, close }: { command: Command; close: () => void }) {
  const { home, error } = useStore(viewStore, v => ({ home: v.home, error: v.error }));
  const open = littlesOf(home);
  const fed = home.upgrades.larder > 0 && home.stash.some(i => defOf(i).category === "food") ? ` The larder will feed them first (+${wellFed(home.upgrades.larder)} health).` : "";
  const pack = packOf(home.upgrades.satchel);
  return <Sheet title="The Littles' nook" close={close}>
    <Text>{`Who slips out tonight? Pack ${pack.w} × ${pack.h}, carrying ${pack.weight}.${fed}`}</Text>
    {LITTLE_IDS.map(id => { const l = LITTLES[id], here = open.includes(id), chosen = home.little === id;
      return <Section key={id} opacity={here ? 1 : 0.55}>
        <Row justify="between"><Heading size={22} color={l.color}>{`${l.name} ${l.title}`}</Heading>{chosen ? <Tag color={GREEN}>GOES NEXT</Tag> : null}</Row>
        <Text>{l.ability}</Text>
        {here ? <Button disabled={chosen} onPress={() => command("chooseLittle", { id })}>{chosen ? "Chosen" : `Send ${l.name}`}</Button> : <Text color={MUTED}>{l.unlock}</Text>}
      </Section>; })}
    <Text role="status" color={RED}>{error}</Text>
  </Sheet>;
}
function PackSheet({ command, close }: { command: Command; close: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const { pack, w, h, run } = useStore(viewStore, v => ({ pack: v.run?.pack ?? NO_PACK, w: v.run?.packW ?? 4, h: v.run?.packH ?? 3, run: v.run }));
  const chosen = pack.find(i => i.id === selected);
  const cell = 60, cells = Array.from({ length: w * h }, (_, i) => ({ x: i % w, y: Math.floor(i / w) }));
  const move = (item: Item, c: { x: number; y: number }) => command("packMove", { uid: item.id, ...c });
  const load = run === null ? null : loadOf(pack, run.capacity, LITTLES[run.little]);
  const sets = completeSets(pack);
  return <Sheet title="What fits comes home." label="Your pack" close={close}>
    <Tag color={GOLD}>{`YOUR PACK · ${w} × ${h} · ${load?.mass ?? 0}/${run?.capacity ?? 0} WEIGHT`}</Tag>
    <Text color={RED}>The night keeps ticking while you pack.</Text>
    {sets.length > 0 ? <Text color={GREEN}>{`Complete set in your pack: ${sets.map(s => SETS[s].name).join(", ")}. Get it home!`}</Text> : null}
    <RuneView width={cell * w} height={cell * h}>
      {cells.map(c => <RuneAction key={`${c.x}:${c.y}`} pin={[c.x * cell, c.y * cell, null, null]} width={cell - 4} height={cell - 4} fill="#3a2a1f" radius={8} label={`Move to column ${c.x + 1}, row ${c.y + 1}`} run={() => { if (chosen) move(chosen, c); }} acceptDrop={id => { const i = pack.find(p => p.id === id); if (i) move(i, c); }} />)}
      {pack.map(i => { const f = footprint(i); return <RuneAction key={i.id} pin={[i.x * cell, i.y * cell, null, null]} width={cell * f.w - 4} height={cell * f.h - 4} padding={6} radius={8} fill="#5a4231" border={{ width: selected === i.id ? 3 : 1, color: ITEMS[kindOf(i)].color }} dragValue={i.id} run={() => setSelected(i.id)} label={`Select ${displayName(i)}`} tooltip={displayName(i)}><ItemMark kind={kindOf(i)} size={24} /><Tag size={10}>{ITEMS[kindOf(i)].name}</Tag></RuneAction>; })}
    </RuneView>
    {chosen === undefined ? <Text color={MUTED}>Select or drag something to repack it.</Text> : <Section><Heading>{displayName(chosen)}</Heading><Text color={MUTED}>{defOf(chosen).flavor}</Text>
      <Row>{([[-1, 0, "←"], [0, -1, "↑"], [0, 1, "↓"], [1, 0, "→"]] as const).map(([dx, dy, label]) => <Button key={label} label={`Move ${label}`} onPress={() => move(chosen, { x: chosen.x + dx, y: chosen.y + dy })}>{label}</Button>)}</Row>
      <Row><Button onPress={() => command("packMove", { uid: chosen.id, rotate: true })}>Turn it</Button><Button onPress={() => { command("drop", { uid: chosen.id }); setSelected(null); }}>Set it down here</Button></Row></Section>}
    {run !== null && hasGear(run, "slingshot") ? <Text color={SKY}>G flings a pebble to draw hunters away.</Text> : null}
    {run !== null && hasGear(run, "spear") ? <Text color={SKY}>F jabs with the needle.</Text> : null}
    <Button onPress={() => command("pack")}>Close the pack / Tab</Button>
  </Sheet>;
}
function ReportSheet({ close }: { close: () => void }) {
  const report = useStore(viewStore, v => v.report);
  if (report === null) return null;
  return <Sheet title="Home safe!" label="Night report" close={close}>
    <Tag color={GREEN}>{`${report.clock} · ${report.rooms} ROOM${report.rooms === 1 ? "" : "S"} · ${report.depth} DEEP · OUT BY THE ${report.via === "dogdoor" ? "FLAP" : report.via.toUpperCase()}`}</Tag>
    {report.items.length === 0 ? <Text>You came back empty-handed, but you came back.</Text> : <RuneView layout="grid" columns={2} responsive={{ phone: { columns: 1 } }} gap={6}>{report.items.map(i => <Row key={i.id}><ItemMark kind={i.kind} size={26} /><Text grow={1} shrink color={i.rarity === "common" ? CREAM : GOLD}>{i.name}</Text></Row>)}</RuneView>}
    <Heading size={22} color={GOLD}>{`+${report.caps} bottle caps`}</Heading>
    {report.sets.map(id => <Text key={id} color={GREEN}>{`Set complete: ${SETS[id as keyof typeof SETS].name}! ${SETS[id as keyof typeof SETS].flavor}`}</Text>)}
    {report.littles.map(id => <Text key={id} color={LITTLES[id].color}>{`${LITTLES[id].name} ${LITTLES[id].title} has moved into the burrow!`}</Text>)}
    <Button onPress={close}>Into the burrow</Button>
  </Sheet>;
}
function CaughtSheet({ command }: { command: Command }) {
  const { home, error } = useStore(viewStore, v => ({ home: v.home, error: v.error }));
  return <Sheet title="Caught!" label="Run lost"><Tag color={RED}>{`NIGHT ${home.last?.run ?? ""} · ${home.last?.count ?? 0} THINGS LEFT IN THE HOUSE`}</Tag>
    <Text>{home.last?.reason}</Text>
    <Text>{`You limp home through the walls. The stash (${home.stash.length} things) and ${home.caps} caps are safe.${home.kidsBox.length > 0 ? ` The kid's treasure box holds ${home.kidsBox.length} of your things: find it in the kid's bedroom.` : ""}`}</Text>
    <Text color={RED}>{error}</Text>
    <Button onPress={() => command("acknowledgeCaught")}>Shake it off / back to the burrow</Button>
  </Sheet>;
}
function SaveSheet({ command }: { command: Command }) {
  const { mode, error } = useStore(viewStore, v => ({ mode: v.mode, error: v.error }));
  return <Sheet title={mode === "saving" ? "Getting home…" : "The burrow is unavailable"} label="Burrow save boundary"><Text color={RED}>{error}</Text>
    <Text>{mode === "saving" ? "The house is holding its breath. Retry the return or reload the saved burrow." : "The saved burrow is kept. No run can begin."}</Text>
    {mode === "saving" ? <Button onPress={() => command("retrySave")}>Retry getting home</Button> : null}
    <Button onPress={() => window.location.reload()}>Reload the burrow</Button></Sheet>;
}
