/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { useBrowserSuspension } from "@jgengine/core/runtime/browserLifecycle.view";
import { useSettings, type SettingsRow } from "@jgengine/core/settings/settings.view";
import { adjustSettingRow } from "@jgengine/core/settings/settingAdjustment";
import { gamePhase, setGamePhase } from "@jgengine/core/game/gamePhase";
import { useCurrency, useEntityStat, useGame, useGamePhase, useGameStore } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
import { useStore } from "@jgengine/ui/store";
import { CHARACTERS } from "../characters";
import { RELAY, relayDistance, relayStore } from "../relay";
import { riftStore } from "../rift/rift";
import { HUD_PANELS, scrapHudPanels } from "./hudPanels";
import { blackMarketOpenStore, characterIdStore, skillsOpenStore, travelOpenStore, vendorOpenStore } from "../stores";
import { useCompact, Button, C, ControlKeys, FULL, Heading, Hull, Icon, idleFade, Label, Pips, Portrait, Row, SignalBars, Small, Stamp, Text, Tube } from "./kit";

/** True while a settings line is waiting for a key; Escape then cancels the rebind, not the run. */
export const rebindArmed = { action: null as string | null };

/**
 * The run's operations: the Dead Air contract card, the pause key, the pause terminal and the
 * contract's field report. It owns pausing, as before: a manual hold or any open terminal pauses time.
 */
export function Operations() {
  const ctx = useGameContext();
  const { commands } = useGame();
  const { phase } = useGamePhase();
  const settings = useSettings();
  const character = useStore(characterIdStore);
  const relay = useStore(relayStore, s => ({ phase: s.phase, wave: s.wave, reason: s.reason, remaining: s.phase === "won" || s.phase === "lost" ? s.remaining : 0 }), (a, b) => JSON.stringify(a) === JSON.stringify(b));
  const vendor = useStore(vendorOpenStore), travel = useStore(travelOpenStore), skills = useStore(skillsOpenStore), market = useStore(blackMarketOpenStore);
  const [manual, setManual] = useState(false);
  const [page, setPage] = useState<"menu" | "settings">("menu");
  const [saveMessage, setSaveMessage] = useState("");
  const modal = vendor !== null || travel || skills || market || settings.isOpen;
  const paused = manual || modal;

  useEffect(() => {
    // The front end owns the phase until the player starts or continues a run.
    if (character === null || phase === "menu" || gamePhase(ctx) === "ended") return;
    setGamePhase(ctx, paused ? "paused" : "playing");
    if (paused) { ctx.time.pause(); document.exitPointerLock?.(); }
    else ctx.time.play();
  }, [ctx, character, paused, phase]);
  useEffect(() => { if (!manual) { setPage("menu"); setSaveMessage(""); } }, [manual]);
  useBrowserSuspension(reason => {
    if (reason === "pointer-lock-lost" && modal) return;
    if (gamePhase(ctx) === "playing") { ctx.time.pause(); setGamePhase(ctx, "paused"); setManual(true); }
  });
  useEffect(() => {
    // Escape opens the terminal from play; open sheets and the terminal close through their own native back.
    const key = (event: KeyboardEvent) => {
      if (event.code !== "Escape" || settings.isOpen || character === null || phase === "ended" || rebindArmed.action !== null || modal || manual) return;
      event.preventDefault(); event.stopImmediatePropagation(); setManual(true);
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [character, phase, settings.isOpen, modal, manual]);

  async function save() {
    setSaveMessage("Saving…");
    try {
      if (ctx.game.save === undefined) { setSaveMessage("Save unavailable in this host"); return; }
      await ctx.game.save.checkpoint();
      // The world snapshot alone cannot restore the reclaimer; the run document keeps the character.
      commands.run("run.save", {});
      setSaveMessage(ctx.game.save.status() === "error" ? "Save failed · your current session is still running" : "Checkpoint saved · resume after reload");
    } catch { setSaveMessage("Save failed · your current session is still running"); }
  }
  if (character === null) return null;
  const result = relay.phase === "won" || relay.phase === "lost";
  return <>
    <RuneView anchor="top-right" safe inset={12}>
      <Button layout="row" items="center" gap={6} minHeight={30} padding={[4, 10, 4, 10]} label="Pause (Esc)" onPress={() => setManual(true)}><Icon name="pause" color={C.amber} size={14} /><Label color={C.ink}>Esc</Label></Button>
    </RuneView>
    {manual && !modal && !result ? <PauseTerminal page={page} onPage={setPage} onResume={() => setManual(false)} onSave={() => void save()} saveMessage={saveMessage} /> : null}
    {result ? <DeadAirReport won={relay.phase === "won"} wave={relay.wave} remaining={relay.remaining} reason={relay.reason} onContinue={() => { setManual(false); commands.run("relay.continue", {}); }} /> : null}
  </>;
}

/**
 * The Dead Air salvage contract: distance, the ambush, the upload and the overclock switch. An idle
 * contract gives way to a live Overdrive run, as the mission log does.
 */
export function ContractCard() {
  const ctx = useGameContext();
  const { commands } = useGame();
  const character = useStore(characterIdStore);
  const relay = useStore(relayStore, s => ({ phase: s.phase, wave: s.wave, enemies: s.enemies.length, rewarded: s.rewarded, overclock: s.overclock === true }), (a, b) => JSON.stringify(a) === JSON.stringify(b));
  const riftLive = useStore(riftStore, s => s.run !== null && (s.run.phase === "running" || s.run.phase === "intermission"));
  const outside = useGameStore(c => relayDistance(c) > RELAY.radius);
  const active = relay.phase === "defend" || relay.phase === "upload";
  const fade = useMemo(() => idleFade(() => `${relay.phase}:${relay.wave}:${relay.rewarded}:${relay.enemies}:${Math.round(relayDistance(ctx) / 20)}`, () => active, 0.55, 7000), [ctx, relay.phase, relay.wave, relay.rewarded, relay.enemies, active]);
  const { compact } = useCompact();
  if (character === null || (!active && riftLive)) return null;
  return <Hull opacity={fade} width={compact ? 200 : 260} gap={compact ? 4 : 6} padding={compact ? 7 : 10} border={{ width: 2, color: active ? C.amber : "#22363c" }}>
    <Stamp tone="phosphor">{relay.rewarded ? "Carrier restored" : "Salvage contract"}</Stamp>
    <Tube gap={4}>
      <Row justify="between"><Text family="Russo One" size={16} color={C.phosphor}>DEAD AIR</Text>
        <Text size={13} color={C.amber} text={active ? `${relay.wave}/3` : bind(() => `${Math.round(relayDistance(ctx))} m`)} /></Row>
      <Small color={C.ink}>{active ? relay.phase === "defend" ? `Clear the ambush · ${relay.enemies} hostiles` : outside ? "Return to the copper ring to upload" : "Hold position · uploading carrier" : "Copper-ring relay · north of crash site"}</Small>
      {active ? <>
        <Row gap={6}><Pips value={() => relayStore.read(ctx).upload} max={() => RELAY.uploadSeconds} count={12} color={C.phosphor} /><Small color={C.phosphor} text={bind(() => `${relayStore.read(ctx).upload.toFixed(1)}/6s`)} /></Row>
        <Small text={bind(() => `${Math.ceil(relayStore.read(ctx).remaining)}s window`)} />
      </> : <Small>{`Walk to the console · E to begin${relay.rewarded ? " · replay available" : " · $120 + 3 cores"}`}</Small>}
    </Tube>
    {active ? <>
      <Button layout="row" items="center" gap={6} label="Overclock" onPress={() => commands.run("relay.overclock", {})}>
        <RuneView width={10} height={10} fill={relay.overclock ? C.amber : "#3a3226"} /><Small color={C.ink}>{`V · ${relay.overclock ? "Overclock ON — reserve shield" : "Clear first — enable overclock"}`}</Small>
      </Button>
      {compact ? null : <Small size={11}>{relay.overclock ? "Inside ring: bank signal during combat, costs 6 shield/sec. Stops at 10 shield. Still clear every hostile." : "Clear first keeps your shield. Overclock trades protection for up to 6s less upload per wave."}</Small>}
    </> : null}
  </Hull>;
}

/**
 * The reclaimer's forearm terminal, raised into view: a carbon housing with the chassis ID at the
 * left and the working screen at the right. On a phone the ID folds into the header.
 */
function FieldTerminal({ label, signal = 1, onBack, children, foot }: { label: string; signal?: number; onBack: () => void; children: ReactNode; foot?: ReactNode }) {
  const { width, height } = useRuneViewport(), { compact, portrait } = useCompact();
  const character = CHARACTERS.find(c => c.id === useStore(characterIdStore)) ?? CHARACTERS[0]!;
  // A short screen keeps only the working tube: the ID column and the key legend fold away.
  const short = compact && !portrait;
  return <RuneView anchor="fill" fill="#000000b8" modal onBack={onBack} role="dialog" label={label}>
    <RuneView anchor="center" variant="plate" width={Math.min(860, width - 20)} maxHeight={height - (compact ? 12 : 20)} padding={compact ? 8 : 14} gap={compact ? 6 : 10} border={{ width: 3, color: "#4a3b29" }}>
      <Row gap={8}>
        <RuneView width={8} height={8} radius={4} fill={C.xp} /><RuneView width={8} height={8} radius={4} fill={C.amber} />
        <Stamp>{label}</Stamp>
        <Small grow={1} shrink size={11}>{portrait ? "" : `RC-${character.id.toUpperCase()} · FERRALON`}</Small>
        <SignalBars strength={signal} color={C.amber} />
      </Row>
      <Row items="stretch" gap={12}>
        {compact ? null : <TerminalId />}
        <Tube grow={1} shrink padding={compact ? 10 : 16} gap={10}><RuneView scroll maxHeight={height - (short ? 70 : portrait ? 220 : 200)} gap={compact ? 6 : 10}>{children}</RuneView></Tube>
      </Row>
      {short ? null : foot}
    </RuneView>
  </RuneView>;
}

/** The chassis ID tube: portrait, name, class and the wallet. */
function TerminalId() {
  const ctx = useGameContext();
  const character = CHARACTERS.find(c => c.id === useStore(characterIdStore)) ?? CHARACTERS[0]!;
  const level = useEntityStat(ctx.player.userId, "level"), points = useEntityStat(ctx.player.userId, "skillPoints");
  const cash = useCurrency("cash"), cores = useCurrency("cores");
  return <RuneView width={200} gap={6}>
    <Portrait id={character.id} color={character.color} size={190} />
    <Text family="Russo One" size={18} color={character.color}>{character.name.toUpperCase()}</Text>
    <Small>{character.className}</Small>
    <RuneView layout="grid" columns={2} gap={4}>
      <Row gap={4}><Label>LV</Label><Text size={14}>{String(level?.current ?? 1)}</Text></Row>
      <Row gap={4}><Icon name="coin" color={C.xp} size={13} /><Text size={14}>{String(cash)}</Text></Row>
      <Row gap={4}><Icon name="gem" color={C.cores} size={13} /><Text size={14}>{String(cores)}</Text></Row>
      {(points?.current ?? 0) > 0 ? <Row gap={4}><Label color={C.phosphor}>PTS</Label><Text size={14} color={C.phosphor}>{String(Math.round(points?.current ?? 0))}</Text></Row> : null}
    </RuneView>
  </RuneView>;
}

const MENU = [
  { id: "resume", label: "Resume run", note: "Back into the wastes" },
  { id: "save", label: "Save checkpoint", note: "World, chassis and loot" },
  { id: "settings", label: "Settings & controls", note: "Display, sound, keys" },
] as const;

/** A terminal command line: prompt, label and its note. */
function Command({ label, note, onPress }: { label: string; note: string; onPress: () => void }) {
  return <RuneAction label={label} run={onPress} layout="row" items="center" gap={10} padding={[8, 10, 8, 10]} minHeight={44} fill="#0b2a2266" border={{ width: 1, color: "#1f5a48" }} hover="#9ff5d622" press="#00000044">
    <Text color={C.amber} size={16}>&gt;</Text>
    <RuneView grow={1} shrink gap={1}><Text family="Russo One" size={16} color={C.phosphor}>{label.toUpperCase()}</Text><Small color={C.phosphorDim}>{note}</Small></RuneView>
  </RuneAction>;
}

/** The pause screen: the run on hold, three commands on the tube, the controls on the keys below. */
export function PauseTerminal({ page, onPage, onResume, onSave, saveMessage }: { page: "menu" | "settings"; onPage: (page: "menu" | "settings") => void; onResume: () => void; onSave: () => void; saveMessage: string }) {
  const { compact } = useCompact();
  const confirm = (id: string) => { if (id === "resume") onResume(); else if (id === "save") onSave(); else onPage("settings"); };
  return <FieldTerminal label={page === "settings" ? "Field terminal / setup" : "Field terminal / 04"} onBack={() => page === "settings" ? onPage("menu") : onResume()} foot={<ControlKeys />}>
    {page === "menu" ? <>
      <Small color={C.phosphorDim}>&gt; carrier status</Small>
      <Heading size={compact ? 20 : 28} color={C.phosphor}>Signal on hold_</Heading>
      <Small color={C.phosphor}>Combat, reloads and the carrier window are paused.</Small>
      {MENU.map(item => <Command key={item.id} label={item.label} note={item.note} onPress={() => confirm(item.id)} />)}
      <Small role="status" color={C.amber}>{saveMessage === "" ? "Resume, then click the world to capture the mouse. Esc releases it." : saveMessage}</Small>
    </> : <>
      <Row gap={10}><Button onPress={() => onPage("menu")} label="Back to the terminal menu">‹ Back</Button><Small color={C.phosphorDim}>&gt; settings &amp; controls</Small></Row>
      <TerminalSettings />
    </>}
  </FieldTerminal>;
}

/** Dead Air's field report, printed on the forearm terminal when the contract closes. */
function DeadAirReport({ won, wave, remaining, reason, onContinue }: { won: boolean; wave: number; remaining: number; reason: string; onContinue: () => void }) {
  return <FieldTerminal label="Dead Air / field report" signal={won ? 4 : 0} onBack={onContinue}>
    <Small color={C.phosphorDim}>&gt; contract closed</Small>
    <Heading size={28} color={C.phosphor}>{won ? "You broke the silence." : "Carrier lost."}</Heading>
    <Small color={C.phosphor}>{reason}</Small>
    <Row gap={20}>
      <RuneView><Text family="Russo One" size={24} color={C.amber}>{won ? "03 / 03" : `${wave} / 03`}</Text><Small>ambush reached</Small></RuneView>
      <RuneView><Text family="Russo One" size={24} color={C.amber}>{`${Math.ceil(remaining)}s`}</Text><Small>carrier remaining</Small></RuneView>
    </Row>
    <Small color={C.phosphor}>{won ? "Contract secured · $120 + 3 cores on first completion. The campaign and your loot remain yours." : "Your inventory is retained. Reconstruction charges the usual 7% cash fee when your chassis is down."}</Small>
    <Command label="Return to the wastes" note="The console accepts another attempt when you return." onPress={onContinue} />
  </FieldTerminal>;
}

/**
 * The terminal's setup page: page keys along the top, each setting one phosphor line with a pip
 * slider, a rocker or a row of options, and each control a rebindable key line.
 */
export function TerminalSettings() {
  const settings = useSettings();
  const [chosen, setChosen] = useState<string | null>(null);
  const [armed, setArmedState] = useState<string | null>(null);
  const setArmed = (action: string | null) => { rebindArmed.action = action; setArmedState(action); };
  useEffect(() => () => { rebindArmed.action = null; }, []);
  const category = settings.categories.find(c => c.id === chosen) ?? settings.categories[0] ?? null;
  if (category === null) return <Small>No settings on this unit.</Small>;
  return <RuneView gap={8} {...(armed === null ? {} : { onKey: (code: string) => {
    const row = category.keybinds.find(k => k.action === armed);
    setArmed(null);
    if (code !== "Escape") row?.rebind(code);
  } })}>
    <RuneView layout="row" gap={4} responsive={{ phone: { layout: "grid", columns: 3 } }} label="Settings pages">
      {settings.categories.map(c => <Button key={c.id} minHeight={32} padding={[4, 8, 4, 8]} fill={c.id === category.id ? "#3a2c10" : "#1c1917"} label={c.label} onPress={() => setChosen(c.id)}><Label color={c.id === category.id ? C.amber : C.dim}>{c.label}</Label></Button>)}
    </RuneView>
    {category.rows.map(row => <SettingLine key={row.id} row={row} />)}
    {category.keybinds.map(k => <Row key={k.action} justify="between" gap={6}>
      <Small grow={1} shrink color={C.phosphor}>{k.label}</Small>
      <Button minHeight={30} padding={[3, 8, 3, 8]} disabled={k.locked === true} label={`Rebind ${k.label}`} onPress={() => setArmed(k.action)}><Text size={13} color={armed === k.action ? C.amber : C.ink}>{armed === k.action ? "PRESS A KEY" : k.bindingLabel}</Text></Button>
      {k.isDefault ? null : <Button minHeight={30} padding={[3, 8, 3, 8]} label={`Reset ${k.label}`} onPress={k.reset}>↺</Button>}
    </Row>)}
    {settings.actions.map(a => <Button key={a.id} onPress={a.run}>{a.label}</Button>)}
    <HudChips />
  </RuneView>;
}

/** The rig's panel chips: each one shows or hides its HUD panel, remembered on this device. */
export function HudChips() {
  const panels = scrapHudPanels();
  return <RuneView gap={4}>
    <Small color={C.phosphor}>HUD panels</Small>
    <RuneView layout="row" gap={4} responsive={{ phone: { layout: "grid", columns: 3 } }} label="HUD panels">
      {HUD_PANELS.map(p => <RuneAction key={p.id} label={`HUD panel ${p.chip}`} run={() => panels.toggle(p.id)} layout="row" items="center" gap={5} minHeight={28} padding={[3, 8, 3, 8]}
        fill={bind(() => panels.visible(p.id) ? "#3a2c10" : "#1c1917")} border={{ width: 1, color: "#ffb40066" }} hover="#ffb40033" press="#00000044">
        <RuneView width={8} height={8} radius={4} fill={bind(() => panels.visible(p.id) ? C.xp : "#57534e")} />
        <Text size={12} color={bind(() => panels.visible(p.id) ? C.amber : C.dim)}>{p.chip}</Text>
      </RuneAction>)}
    </RuneView>
  </RuneView>;
}

function SettingLine({ row }: { row: SettingsRow }) {
  const min = row.min ?? 0, max = row.max ?? 100;
  const local = useRef(Number(row.value));
  local.current = Number(row.value);
  const shown = (v: number) => row.format?.(v) ?? String(Math.round(v * 100) / 100);
  const adjust = (delta: -1 | 1) => { const next = adjustSettingRow(row, delta); if (next !== undefined) row.set(next); };
  return <RuneView gap={4}>
    <Row justify="between"><Small grow={1} shrink color={C.phosphor}>{row.label}</Small>
      {row.kind === "slider" ? <Text size={13} color={C.amber} text={bind(() => shown(local.current))} /> : null}</Row>
    {row.kind === "slider" ? <RuneAction label={row.label} height={30} width={FULL} padding={[9, 0, 9, 0]} fill="#0a1d17" border={{ width: 1, color: "#1f5a48" }} onAdjust={adjust} onDrag={d => {
      if (d.cancelled) { local.current = Number(row.value); return; }
      const raw = min + Math.max(0, Math.min(1, d.x / Math.max(1, d.width))) * (max - min), step = row.step ?? 1;
      local.current = Math.min(max, Math.max(min, min + Math.round((raw - min) / step) * step));
      if (d.phase === "up") row.set(local.current);
    }}><Pips value={() => local.current - min} max={() => max - min} count={12} color={C.amber} width={14} height={12} /></RuneAction>
      : row.kind === "toggle" ? <Button layout="row" items="center" gap={6} minHeight={32} label={row.label} onPress={() => row.set(!row.value)}><RuneView width={10} height={10} radius={5} fill={row.value ? C.xp : "#3a3226"} /><Text size={13}>{row.value ? "ON" : "OFF"}</Text></Button>
        : <RuneView layout="row" gap={4} responsive={{ phone: { layout: "grid", columns: 2 } }}>{(row.options ?? []).map(o => {
          const on = String(row.value) === String(o.value);
          return <Button key={String(o.value)} minHeight={30} padding={[3, 8, 3, 8]} fill={on ? "#3a2c10" : "#1c1917"} label={`${row.label}: ${o.label}`} onPress={() => row.set(o.value)}><Text size={13} color={on ? C.amber : C.dim}>{`[${o.label}]`}</Text></Button>;
        })}</RuneView>}
  </RuneView>;
}

