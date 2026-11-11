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
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { AMBER, Button, DIM, Frame, FULL, Heading, RED, Row, Section, Sheet, Tag, TEAL, Text, deepwardTheme } from "./dock";
import { groundDistance, EXIT, roomAt } from "../../world";
import { nearby, storageChanged, viewStore } from "../controls";
import { CACHE, footprint, ITEMS, type Dive } from "../state";
import { weaponReadout } from "../combat";
import { loadOf, CACHE_WEIGHT } from "../haul";
import { breakdownValue, compareToPrepared, kindOf, statLines, type Item } from "../items";
import { REFITS, refitMissing } from "../progression";
import { counterRows, marrowStanding, OPERATOR } from "../counter";
import { ItemMark } from "./ItemMark";
import { DeepwardMenu, RecordSettings } from "./menu/DeepwardMenu";
import { RECORD_KEY, SAVE_KEY } from "../save";
import { FabricatorSheet } from "./FabricatorSheet";
import { marrowOf, marrowState } from "../marrow";
import { nextGoal, sealMark } from "../deep";
import { crushDamage } from "../strata";
import { GAME_FONTS } from "../../art/look";

type Command = (name: string, input?: unknown) => unknown;
for (const face of [GAME_FONTS.display,GAME_FONTS.body,GAME_FONTS.numeric]) if (face !== undefined) registerNativeRuneFont(resolveAssetBaseUrl(face.src));
const NO_CACHE: Dive["cache"] = [];
const positionOf = (ctx: GameContext) => ctx.scene.entity.get(ctx.player.userId)?.position ?? [0,0,14] as const;

export function GameUI() {
  const ctx = useGameContext(), phase = useOptionalGamePhase(), settings = useSettings(), bindings = useActionBindings();
  const screen = useStore(viewStore,v => ({panel:v.panel,mode:v.mode,paused:v.paused,diving:v.dive !== null}));
  const swapping = useSceneSwapping(), menu = phase === "menu" || (phase === "paused" && screen.panel === null);
  const command: Command = (name,input = {}) => ctx.game.commands.run(`deepward.${name}`,input);
  const close = () => { command("close"); };
  const notices = useMemo(() => ({read:ctx.game.notices.list,subscribe:ctx.game.notices.subscribe}),[ctx]);
  useBrowserSuspension(() => { const v = viewStore.read(ctx); if (v.panel === null && !v.paused && (v.mode === "home" || v.mode === "dive")) command("pause",{paused:true}); });
  useEffect(() => {
    const cache = bindings["deepwardCache"], codes = cache === undefined ? [] : allActionCodes(cache);
    const key = (e: KeyboardEvent) => {
      if (e.repeat || settings.isOpen) return;
      const v = viewStore.read(ctx);
      if (codes.includes(e.code) && v.panel === "cache") { e.preventDefault(); e.stopImmediatePropagation(); command("cache"); }
      else if (e.code === "Escape" && v.panel === null && !v.paused && (v.mode === "home" || v.mode === "dive")) { e.preventDefault(); e.stopImmediatePropagation(); command("pause"); }
    };
    const storage = (e: StorageEvent) => { if (e.key === null || e.key === SAVE_KEY || e.key.startsWith(RECORD_KEY)) storageChanged(ctx); };
    window.addEventListener("keydown",key,true); window.addEventListener("storage",storage);
    return () => { window.removeEventListener("keydown",key,true); window.removeEventListener("storage",storage); };
  },[ctx,settings.isOpen,bindings]);
  return <RuneRoot context={ctx} theme={deepwardTheme}>
    <RuneView anchor="fill" hidden={menu}>
      <RuneView anchor="top-right" safe inset={18}><Button onPress={() => command("pause")}>Hold / Esc</Button></RuneView>
      {screen.diving ? <DiveHud /> : screen.mode === "home" ? <HomeHud /> : null}
      <RuneView anchor="bottom" safe inset={20} gap={8} maxWidth={560} responsive={{phone:{maxWidth:340}}}><Prompt command={command} /><Radio /></RuneView>
      {screen.panel === "stash" ? <StashSheet command={command} close={close} /> : screen.panel === "fabricator" ? <FabricatorPanel command={command} close={close} /> : screen.panel === "cache" ? <CacheSheet command={command} close={close} /> : null}
      {screen.mode === "reprinting" ? <ReprintSheet command={command} /> : screen.mode === "saving" || screen.mode === "blocked" ? <SaveSheet command={command} /> : null}
      {swapping ? <RuneView anchor="fill" fill="#050e13" justify="center" items="center"><Heading>Taking the rail…</Heading></RuneView> : null}
    </RuneView>
    {menu ? <DeepwardMenu key={phase} /> : null}
    {settings.isOpen ? <Sheet title="Settings" close={settings.close}><RecordSettings /></Sheet> : null}
    <RuneView anchor="top" safe inset={70} gap={6}><RuneTransient source={notices} expire={ctx.game.notices.prune}>{notice => <Frame><Text color={notice.tone === "deny" ? RED : AMBER}>{notice.text}</Text></Frame>}</RuneTransient></RuneView>
  </RuneRoot>;
}

function DiveHud() {
  const ctx = useGameContext(), view = () => viewStore.read(ctx), dive = () => view().dive;
  const { width } = useRuneViewport(), phone = width < 600;
  const pulse = useMemo(() => runePulse(() => dive()?.health,200),[ctx]);
  const stats: [string,() => number,() => number][] = [["SEC AIR",() => dive()?.oxygen ?? 0,() => dive()?.tankSeconds ?? 110],["SUIT",() => dive()?.health ?? 0,() => 100],["FOOD",() => view().deep.body.values["food"] ?? 0,() => 100],["WATER",() => view().deep.body.values["water"] ?? 0,() => 100]];
  return <>
    <RuneView anchor="top-left" safe inset={20} maxWidth={600} responsive={{phone:{maxWidth:220}}}><Tag color={AMBER}>BELLWETHER / LINE 06</Tag><Text text={bind(() => roomAt(positionOf(ctx),dive()?.stratum ?? "vault"))} /></RuneView>
    <RuneView anchor="bottom-left" safe inset={20} responsive={{phone:{padding:[0,0,140,0]}}}>
      <Frame width={260} responsive={{phone:{width:width - 40,padding:12,gap:8}}} scale={bind(() => 1 + pulse.get() * .025)}>
        <Tag>HALLOWAY / DIVE COMPUTER</Tag>
        <RuneView layout="grid" columns={1} responsive={{phone:{columns:2}}} gap={8}>{stats.map(([label,read,max]) => <RuneView key={label} gap={4}>
          <Row justify="between"><Tag>{label}</Tag><RuneLabel value={bind(read)} format={n => String(Math.ceil(n))} size={phone ? 24 : label === "SEC AIR" ? 36 : 18} family="Share Tech Mono" color={bind(() => read() < max()*.25 ? RED : TEAL)} /></Row>
          <RuneView height={4} fill="#30494c" width={FULL}><RuneView height={4} width={bind(() => ({fraction:Math.max(0,Math.min(1,read()/max()))}))} fill={bind(() => read() < max()*.25 ? RED : TEAL)} /></RuneView>
        </RuneView>)}</RuneView>
        <Text color={AMBER} text={bind(() => `Rail ${Math.ceil(groundDistance(positionOf(ctx),EXIT))}m · Seal ${sealMark(view().deep)}`)} />
        <Text color={RED} text={bind(() => (dive()?.oxygen ?? 100) <= 25 ? "TURN BACK / LOW AIR" : crushDamage(dive()?.stratum ?? "vault",sealMark(view().deep)) > 0 ? "PRESSURE EXCEEDS SEAL" : "")} />
      </Frame>
    </RuneView>
    <RuneView anchor="bottom-right" safe inset={20} responsive={{phone:{padding:[0,0,60,0]}}}><Frame width={220} responsive={{phone:{width:width - 40,layout:"row",items:"center",justify:"between",padding:10}}}>
      {phone ? null : <Tag text={bind(() => weaponReadout(dive()).label)} />}<Text size={phone ? 22 : 32} family="Share Tech Mono" text={bind(() => view().ammo?.reloading ? "LOADING" : `${view().ammo?.loaded ?? "–"} / ${view().ammo?.capacity ?? "–"}`)} />
      {phone ? null : <Text color={DIM} text={bind(() => `${view().ammo?.reserve ?? 0} reserve`)} />}
      <Button onPress={() => ctx.game.commands.run("deepward.cache",{})}><Text color="#172529" text={bind(() => `${loadOf(dive()?.cache ?? NO_CACHE).mass}/${CACHE_WEIGHT}kg · Cache`)} /></Button>
    </Frame></RuneView>
    <RuneView anchor="center"><Text size={26} color={bind(() => (dive()?.flash ?? 0) > 0 ? AMBER : "#e8fbf5b0")}>+</Text></RuneView>
  </>;
}
function HomeHud() {
  const ctx = useGameContext(), read = () => viewStore.read(ctx);
  return <RuneView anchor="top-left" safe inset={20}><Frame width={340} responsive={{phone:{width:220}}}>
    <Tag color={AMBER}>MARROW / RAIL DEPARTURE 06</Tag><Heading>Another Life.</Heading>
    <Text text={bind(() => `Life ${read().home.life} · ${read().home.bank.banked} scrip · ${read().home.stash.length} stashed`)} />
    <Text text={bind(() => nextGoal(read().deep,marrowOf(ctx))?.text ?? "Pattern 406 is home.")} />
    <Tag text={bind(() => { const s = marrowStanding(read().home.standing); return `STANDING ${s.tier(OPERATOR,"marrow").id}`; })} />
  </Frame></RuneView>;
}
function Radio() {
  const ctx = useGameContext();
  return <Text align="center" text={bind(() => { const v = viewStore.read(ctx); return v.error && v.mode !== "saving" && v.mode !== "blocked" ? v.error : v.hint; })} />;
}
function Prompt({ command }: { command: Command }) {
  const ctx = useGameContext();
  const prompt = useGameStore(c => { const v = viewStore.read(c); return { channel:v.dive?.channel?.kind ?? (v.dive?.channel ? "search" : null), target:v.panel === null && !v.paused ? nearby(c)?.label ?? null : null }; });
  if (prompt.channel !== null) return <RuneView width={280} gap={5}><Tag>{prompt.channel.toUpperCase()} / HOLD STILL</Tag><RuneView height={5} fill="#30494c"><RuneView height={5} fill={AMBER} width={bind(() => { const c = viewStore.read(ctx).dive?.channel; return {fraction:c == null ? 0 : 1-c.remaining/(c.total ?? 1.4)}; })} /></RuneView></RuneView>;
  return prompt.target === null ? null : <Button onPress={() => command("interact")}>{`E / ${prompt.target}`}</Button>;
}

function StashSheet({ command,close }: { command: Command; close: () => void }) {
  const { home,rifleUid,hint,error } = useStore(viewStore,v => ({home:v.home,rifleUid:v.rifleUid,hint:v.hint,error:v.error}));
  const prepared = home.stash.find(i => i.id === rifleUid);
  return <Sheet title="Marrow's stash" close={close}>
    <Tag color={AMBER}>PERMANENT / SAVED ON RETURN</Tag><Text>Travel light, or risk a recovered rifle. Prepared gear is lost on death.</Text>
    <Button onPress={() => command("prepareRifle",{uid:null})}>Travel light / keep rifles safe</Button>
    {home.stash.length === 0 ? <Text>Empty shelves. Bring something home from Bellwether.</Text> : home.stash.map(item => <Section key={item.id}>
      <Row><ItemMark kind={kindOf(item)} /><Heading size={22}>{item.name}</Heading></Row><Text>{item.rarity} · level {item.level} · {item.mass}kg · {ITEMS[kindOf(item)].detail}</Text>
      <Text>{statLines(item).map(s => `${s.label} ${s.value.toFixed(s.digits)}${s.unit}`).join(" · ")}</Text><Text>{item.affixes.map(a => `${a.id} ${a.value.toFixed(2)} ${a.stat}`).join(" · ")}</Text>
      {prepared === undefined || kindOf(prepared) !== kindOf(item) ? null : <Text color={AMBER}>Prepared comparison: {compareToPrepared(item,prepared).better}</Text>}
      {kindOf(item) !== "service-rifle" ? null : <Button onPress={() => command("prepareRifle",{uid:item.id})}>{rifleUid === item.id ? "Prepared / at risk" : "Prepare rifle"}</Button>}
      <Button onPress={() => command("dismantle",{id:item.id})}>{`Dismantle / ${breakdownValue(item)} scrip`}</Button>
    </Section>)}
    <Heading>Fitter's counter / {home.bank.banked} scrip</Heading>
    {counterRows(home).map(r => <Section key={r.supply.kind}><Row><ItemMark kind={r.supply.kind} /><Text>{r.supply.label}</Text></Row><Text>{r.supply.blurb}</Text><Button disabled={r.locked || r.price > home.bank.banked} onPress={() => command("buy",{kind:r.supply.kind})}>{r.locked ? `Needs ${r.needs} standing` : `Buy / ${r.price} scrip`}</Button></Section>)}
    <Heading>Refit next departure</Heading>
    {Object.entries(REFITS).map(([id,r]) => { if (id !== "tank" && id !== "reserve") throw new Error(`Unknown refit: ${id}`); const installed = home.refits.includes(id), missing = refitMissing(home,id);
      return <Section key={id}><Text>{r.name} · {r.effect}</Text><Text>Cost: {r.recipe.inputs.map(i => `${i.count} ${i.itemId}`).join(" + ")}</Text><Button disabled={installed || missing.length > 0} onPress={() => command("refit",{id})}>{installed ? "Installed" : missing.length > 0 ? `Need ${missing.map(i => `${i.count} ${i.itemId}`).join(" + ")}` : `Install ${r.name}`}</Button></Section>;
    })}<Text role="status" color={error ? RED : DIM}>{error || hint}</Text>
  </Sheet>;
}
function FabricatorPanel({ command,close }: { command: Command; close: () => void }) {
  const ctx = useGameContext();
  const s = useGameStore(c => { const v = viewStore.read(c); return {home:v.home,gear:v.deep.gear,codex:v.deep.codex,lures:v.deep.lures,charted:v.deep.charted,departTo:v.departTo,hint:v.hint,error:v.error,world:marrowState(c)}; });
  return <FabricatorSheet home={s.home} deep={viewStore.read(ctx).deep} world={marrowOf(ctx)} departTo={s.departTo} hint={s.hint} error={s.error} command={command} close={close} />;
}
function CacheSheet({ command,close }: { command: Command; close: () => void }) {
  const [selected,setSelected] = useState<string | null>(null), { cache,hand } = useStore(viewStore,v => ({cache:v.dive?.cache ?? NO_CACHE,hand:v.dive?.hand ?? "sidearm"}));
  const chosen = cache.find(i => i.id === selected), load = loadOf(cache);
  const cell = 64, cells = Array.from({length:CACHE.w*CACHE.h},(_,i) => ({x:i%CACHE.w,y:Math.floor(i/CACHE.w)}));
  const move = (item: Item,c: {x:number;y:number}) => command("pack",{uid:item.id,...c});
  return <Sheet title="What fits comes home." label="Carried cache" close={close}>
    <Tag color={AMBER}>CARRIED CACHE / 4 × 3</Tag><Text color={RED}>The tank keeps moving while you pack.</Text><Text>{load.mass}/{CACHE_WEIGHT}kg · {load.remaining} free</Text>
    <RuneView width={cell*CACHE.w} height={cell*CACHE.h}>
      {cells.map(c => <RuneAction key={`${c.x}:${c.y}`} pin={[c.x*cell,c.y*cell,null,null]} width={cell-4} height={cell-4} fill="#1b3439" label={`Move selected item to column ${c.x+1}, row ${c.y+1}`} run={() => {if (chosen) move(chosen,c);}} acceptDrop={id => {const i = cache.find(i => i.id === id); if (i) move(i,c);}} />)}
      {cache.map(i => { const f = footprint(i); return <RuneAction key={i.id} pin={[i.x*cell,i.y*cell,null,null]} width={cell*f.w-4} height={cell*f.h-4} padding={6} fill="#29454a" border={{width:selected === i.id ? 3 : 1,color:ITEMS[kindOf(i)].color}} dragValue={i.id} run={() => setSelected(i.id)} label={`Select ${i.name}`} tooltip={i.name}><ItemMark kind={kindOf(i)} size={24} /><Tag size={10}>{ITEMS[kindOf(i)].name}</Tag></RuneAction>; })}
    </RuneView>
    {chosen === undefined ? <Text>Select or drag an item to repack.</Text> : <Section><Heading>{chosen.name}</Heading><Row>{([[-1,0,"←"],[0,-1,"↑"],[0,1,"↓"],[1,0,"→"]] as const).map(([dx,dy,label]) => <Button key={label} label={`Move ${label}`} onPress={() => move(chosen,{x:chosen.x+dx,y:chosen.y+dy})}>{label}</Button>)}</Row><Button onPress={() => command("pack",{uid:chosen.id,rotate:true})}>Rotate</Button><Button onPress={() => {command("discard",{uid:chosen.id});setSelected(null);}}>Leave behind</Button></Section>}
    {cache.some(i => kindOf(i) === "service-rifle") ? <Section><Tag>ONE HAND / {hand}</Tag><Button onPress={() => command("equip",{hand:"sidearm"})}>Issue sidearm</Button><Button onPress={() => command("equip",{hand:"service-rifle"})}>Found service rifle</Button></Section> : null}
    <Button onPress={() => command("cache")}>Close cache / Tab</Button>
  </Sheet>;
}
function ReprintSheet({ command }: { command: Command }) {
  const { home,error } = useStore(viewStore,v => ({home:v.home,error:v.error}));
  return <Sheet title="Bellwether kept the haul." label="Life ended"><Tag color={AMBER}>LIFE {home.life-1} ENDED</Tag><Text>{home.last?.reason}</Text><Text>{home.last?.count ?? 0} carried items lost. {home.stash.length} stashed items and {home.refits.length} refits remain safe.</Text><Text>Life {home.life} is printed. The loss is already saved.</Text><Text color={RED}>{error}</Text><Button onPress={() => command("acknowledgeReprint")}>Accept reprint / return to Marrow</Button><Button onPress={() => window.location.reload()}>Reload saved Marrow</Button></Sheet>;
}
function SaveSheet({ command }: { command: Command }) {
  const { mode,error } = useStore(viewStore,v => ({mode:v.mode,error:v.error}));
  return <Sheet title={mode === "saving" ? "Return pending" : "Marrow is unavailable"} label="Marrow save boundary"><Text color={RED}>{error}</Text><Text>{mode === "saving" ? "Simulation stopped. Retry this return or reload the saved record." : "The saved record is preserved. No new dive can begin."}</Text>{mode === "saving" ? <Button onPress={() => command("retrySave")}>Retry saving this return</Button> : null}<Button onPress={() => window.location.reload()}>Reload saved Marrow</Button></Sheet>;
}
