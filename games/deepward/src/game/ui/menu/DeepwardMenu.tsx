/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useRef, useState } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneLayers, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind, createRuneFlow } from "@jgengine/core/ui/rune/primitives";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { useOptionalGamePhase } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useSaveSlots } from "@jgengine/core/save/saveSlots.view";
import { useSettings, type SettingsRow } from "@jgengine/core/settings/settings.view";
import { adjustSettingRow } from "@jgengine/core/settings/settingAdjustment";
import { DEEPWARD_CREDITS } from "../../credits";
import { loadRecordSlot, beginRecordSlot, persistRecord, recordOf, withdrawToTitle } from "../../controls";
import { captureRecordThumb, recordLabel, recordSlots, refreshRecordSlots } from "../../menuRecord";
import { AMBER, Button, DIM, FULL, Heading, Row, Section, Tag, Text } from "../dock";

export const menuFocus: { id: string | null } = { id: null };
export function RecordSettings() {
  const settings = useSettings(), [chosen,setChosen] = useState<string | null>(null), [armed,setArmed] = useState<string | null>(null);
  const active = settings.categories.find(c => c.id === chosen) ?? settings.categories[0];
  return <RuneView gap={14} {...(armed === null ? {} : { onKey: (code: string) => {
    if (code !== "Escape") active?.keybinds.find(k => k.action === armed)?.rebind(code);
    setArmed(null);
  } })}>
    <RuneView layout="grid" columns={3} responsive={{phone: {columns: 2}}} gap={6}>{settings.categories.map(c => <Button key={c.id} fill={c === active ? AMBER : "#a1bcb4"} onPress={() => setChosen(c.id)}>{c.label}</Button>)}</RuneView>
    {active?.rows.map(row => <Setting key={row.id} row={row} />)}
    {active?.keybinds.map(k => <Row key={k.action} justify="between"><Text grow={1}>{k.label}</Text><Button disabled={k.locked === true} onPress={() => setArmed(k.action)}>{armed === k.action ? "Press key / Esc cancels" : k.bindingLabel}</Button><Button disabled={k.locked || k.isDefault} onPress={k.reset}>Reset</Button></Row>)}
    {settings.actions.map(a => <Button key={a.id} onPress={a.run}>{a.label}</Button>)}
  </RuneView>;
}
function Setting({ row }: { row: SettingsRow }) {
  const min = row.min ?? 0, max = row.max ?? 1, fraction = useRef((Number(row.value) - min) / Math.max(1e-6,max - min));
  fraction.current = (Number(row.value) - min) / Math.max(1e-6,max - min);
  const shown = row.kind === "toggle" ? row.value ? "On" : "Off" : row.options?.find(o => o.value === row.value)?.label ?? String(row.value);
  const adjust = (delta: -1 | 1) => { const next = adjustSettingRow(row,delta); if (next !== undefined) row.set(next); };
  const value = () => min + fraction.current * (max - min);
  return <RuneView gap={5}><Row justify="between"><Text grow={1}>{row.label}</Text><Text color={AMBER} text={row.kind === "slider" ? bind(() => row.format?.(value()) ?? value().toFixed(2)) : shown} /></Row>
    {row.kind !== "slider" ? <Button label={row.label} onPress={() => adjust(1)}>{shown} ›</Button> : <RuneAction label={row.label} height={36} fill="#263e43" padding={[14,0,14,0]} onAdjust={adjust} onDrag={d => {
      if (d.cancelled) { fraction.current = (Number(row.value)-min)/(max-min); return; }
      fraction.current = Math.max(0,Math.min(1,d.x / Math.max(1,d.width)));
      if (d.phase === "up") row.set(Math.min(max,Math.max(min,min + Math.round((value()-min)/(row.step ?? 1))*(row.step ?? 1))));
    }}><RuneView height={8} fill={AMBER} width={bind(() => ({ fraction: fraction.current }))} /></RuneAction>}
  </RuneView>;
}

export function DeepwardMenu() {
  const ctx = useGameContext(), phase = useOptionalGamePhase(), slots = useSaveSlots(recordSlots), recent = recordSlots.mostRecent();
  const [busy,setBusy] = useState(false), [notice,setNotice] = useState(""), [deleting,setDeleting] = useState<string | null>(null);
  const { width,height } = useRuneViewport(), phone = width < 600, paused = phase === "paused";
  const flow = useMemo(() => {
    const f = createRuneFlow({ main: { layer: "screen", pause: false, capture: true }, records: {layer: "screen",pause: true,capture: true}, settings: {layer: "screen",pause: true,capture: true}, credits: {layer: "screen",pause: true,capture: true} });
    f.push("main"); if (menuFocus.id === "settings" || menuFocus.id === "credits") f.push(menuFocus.id);
    return f;
  }, []);
  useEffect(() => { void refreshRecordSlots(ctx); }, [ctx]);
  const work = async (run: () => Promise<unknown>) => {
    if (busy) return; setBusy(true); setNotice("");
    try { await run(); await refreshRecordSlots(ctx); } catch (error) { setNotice(String(error)); } finally { setBusy(false); }
  };
  const load = (id: string) => void work(() => loadRecordSlot(ctx,id));
  const start = (id: string) => void work(() => beginRecordSlot(ctx,id,recordSlots.get(id)?.empty === false));
  const back = () => { if (flow.read().length > 1) flow.pop(); else if (paused) ctx.game.commands.run("deepward.close",{}); };
  return <RuneLayers flow={flow}>{entry => <RuneView anchor="fill" fill="#041116f2" padding={phone ? 24 : 48} onBack={back}>
    <RuneView layout="row" justify="between" items="center"><Tag color={AMBER}>HALLOWAY / LINE 06</Tag><Tag>{paused ? "DIVE HELD" : "PRINT SERVICE"}</Tag></RuneView>
    <RuneView anchor="center" width={Math.min(840,width - 48)} gap={phone ? 20 : 28}>
      <RuneView gap={4}><Text family="Share Tech Mono" size={phone ? 44 : 72} tracking={phone ? 2 : 6}>DEEPWARD</Text><Tag color={AMBER}>{entry.kind === "main" ? "ONE LIFE. ONE TANK. BRING SOMETHING HOME." : entry.kind.toUpperCase()}</Tag></RuneView>
      <RuneView scroll maxHeight={height - (phone ? 280 : 330)} gap={10} width={FULL}>
        {entry.kind === "main" ? <RuneView layout="grid" columns={2} responsive={{phone: {columns: 1}}} gap={10}>
          {paused ? <><Button onPress={back}>Back to the dive</Button><Button onPress={() => void work(async () => { await captureRecordThumb(); await persistRecord(ctx); setNotice("Record written."); })}>Save record</Button><Button onPress={() => void work(() => withdrawToTitle(ctx))}>Save & leave to title</Button></> : <>
            <Button disabled={recent === null} onPress={() => { if (recent !== null) load(recent.id); }}>Continue dive</Button>
            <Button onPress={() => { const empty = slots.find(s => s.empty); if (empty !== undefined) start(empty.id); else flow.push("records"); }}>New dive</Button><Button onPress={() => flow.push("records")}>Dives & hauls</Button></>}
          <Button onPress={() => flow.push("settings")}>Settings</Button><Button onPress={() => flow.push("credits")}>Credits</Button>
        </RuneView> : entry.kind === "settings" ? <RecordSettings /> : entry.kind === "credits" ? <>
          {DEEPWARD_CREDITS.sections.map(s => <Section key={s.heading}><Heading>{s.heading}</Heading>{s.entries.map(e => <Text key={e.label}>{[e.label,e.detail,e.href].filter(Boolean).join(" · ")}</Text>)}</Section>)}<Text>{DEEPWARD_CREDITS.notice}</Text>
        </> : slots.map(slot => <Section key={slot.id}><Heading>{slot.name ?? recordLabel(slot.id)}</Heading>
          <Text color={DIM}>{slot.empty ? "Empty record" : Object.entries(slot.meta).filter(([key]) => key !== "thumbnail").map(([k,v]) => `${k}: ${String(v)}`).join(" · ")}</Text>
          <Row><Button onPress={() => slot.empty ? start(slot.id) : load(slot.id)}>{slot.empty ? "New dive" : "Load dive"}</Button>
            {slot.empty ? null : <Button onPress={() => setDeleting(deleting === slot.id ? null : slot.id)}>Delete record</Button>}</Row>
          {deleting !== slot.id ? null : <><Text color={AMBER}>Burn {recordLabel(slot.id)}? This cannot be undone.</Text><Button holdMs={600} onPress={() => void work(async () => { recordSlots.clear(slot.id); await recordOf(ctx)?.deleteSlot(slot.id); setDeleting(null); })}>Hold to burn record</Button><Button onPress={() => setDeleting(null)}>Keep record</Button></>}
        </Section>)}
      </RuneView>
      {entry.kind === "main" ? <Text color={DIM}>Take the rail to Bellwether. Every return keeps the haul. Every death prints a new Life.</Text> : <Button onPress={back}>Back</Button>}
      <Text role="status" color={AMBER}>{busy ? "Writing the record…" : notice || "MARROW / RAIL DEPARTURE 06"}</Text>
    </RuneView>
  </RuneView>}</RuneLayers>;
}
