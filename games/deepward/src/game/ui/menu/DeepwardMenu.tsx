/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useState } from "@jgengine/core/ui/jsx";
import { RuneBox, RuneButton, RuneScroll, useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { RuneSettingsSection } from "@jgengine/core/settings/runeSettings.view";
import { useGameStore, useOptionalGamePhase } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
import { useSaveSlots } from "@jgengine/core/save/saveSlots.view";
import { useSettings } from "@jgengine/core/settings/settings.view";
import { useStore } from "@jgengine/ui/store";
import { DEEPWARD_CREDITS } from "../../credits";
import { loadRecordSlot, beginRecordSlot, openMarrowTitle, persistRecord, recordOf, withdrawToTitle, viewStore } from "../../controls";
import { captureRecordThumb, recordLabel, recordSlots, refreshRecordSlots } from "../../menuRecord";
import { depthAt } from "../../../world";
import { CACHE_WEIGHT, loadOf } from "../../haul";
import { ALL, AMBER, Button, DIM, Frame, FULL, Heading, INK, Row, Section, Tag, TEAL, Text } from "../dock";

export const menuFocus: { id: string | null } = { id: null };

function HeldBoard() {
  const board = useGameStore(ctx => {
    const view = viewStore.read(ctx), dive = view.dive;
    if (dive === null) return { diving: false, rows: [["SCRIP", view.home.bank.banked], ["STASH", view.home.stash.length], ["RETURNS", view.home.extractions], ["LIFE", view.home.life]] };
    const at = ctx.scene.entity.get(ctx.player.userId)?.position ?? [0,0,0];
    return { diving: true, rows: [["AIR", `${Math.ceil(dive.oxygen)}s`], ["DEPTH", depthAt(at, dive.stratum)], ["CARRY", `${loadOf(dive.cache).mass}/${CACHE_WEIGHT}`], ["SUIT", `${Math.ceil(dive.health)}%`]] };
  });
  return <><Heading>{board.diving ? "Dive held" : "Home held"}</Heading><Row justify="between" width={FULL}>{board.rows.map(([label,value]) => <RuneBox key={label} gap={8} padding={8} fill="#9cddd110"><Tag>{label}</Tag><Text family="Share Tech Mono" size={24}>{value}</Text></RuneBox>)}</Row><Text color={DIM}>Tank and prints are stopped while this console is open.</Text></>;
}

export function RecordSettings() {
  const settings = useSettings();
  const [chosen, setChosen] = useState<string | null>(null);
  const active = settings.categories.find(category => category.id === chosen) ?? settings.categories[0];
  return <RuneBox gap={12} width={FULL}>
    <Heading>Settings</Heading>
    <RuneBox gap={4}>{settings.categories.map(category => <Button key={category.id} onPress={() => setChosen(category.id)} fill={category === active ? TEAL : "#264047"} color={category === active ? "#142429" : INK}>{category.label}</Button>)}</RuneBox>
    {active === undefined ? null : <RuneSettingsSection category={active} color={INK} family="Rajdhani" />}
    {settings.actions.map(action => <Button key={action.id} onPress={action.run}>{action.label}</Button>)}
  </RuneBox>;
}

export function DeepwardMenu() {
  const ctx = useGameContext();
  const phase = useOptionalGamePhase();
  const view = useStore(viewStore, v => ({ mode: v.mode, diving: v.dive !== null, life: v.home.life, banked: v.home.bank.banked, air: v.home.refits.includes("tank") ? 145 : 110 }));
  const slots = useSaveSlots(recordSlots);
  const recent = recordSlots.mostRecent();
  const pause = phase === "paused";
  const [active, setActive] = useState(menuFocus.id ?? (pause ? "resume" : recent === null ? "new" : "continue"));
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { width, height } = useRuneViewport();
  const narrow = width < 700;
  const emptySlot = slots.find(slot => slot.empty)?.id ?? [...slots].sort((a,b) => (a.savedAt ?? 0) - (b.savedAt ?? 0))[0]?.id ?? null;
  const open = recordOf(ctx)?.slot() ?? "marrow";
  useEffect(() => { if (phase === "menu") void refreshRecordSlots(ctx); }, [phase, ctx]);
  useEffect(() => { setActive(menuFocus.id ?? (phase === "paused" ? "resume" : recordSlots.mostRecent() === null ? "new" : "continue")); }, [phase]);
  const back = () => {
    if (pause) ctx.game.commands.run(view.mode === "home" || view.mode === "dive" ? "deepward.close" : "deepward.pause", {});
    else openMarrowTitle(ctx);
  };
  const work = async (label: string, run: () => Promise<unknown>) => {
    if (busy !== null) return;
    setBusy(label);
    try { await run(); await refreshRecordSlots(ctx); }
    catch (error) { setNotice(String(error)); }
    finally { setBusy(null); }
  };
  const start = (slot: string) => void work("Printing the record", () => beginRecordSlot(ctx, slot, recordSlots.get(slot)?.empty === false));
  const load = (slot: string) => void work("Reading the record", () => loadRecordSlot(ctx, slot));
  const save = () => void work("Writing the record", async () => { await captureRecordThumb(); await persistRecord(ctx); setNotice(`Written to ${recordLabel(open)}`); });
  const verbs = pause ? [
    { id: "resume", label: view.diving ? "Back to the dive" : "Back to Marrow", hint: "" },
    { id: "save", label: `Save to ${recordLabel(open)}`, hint: "Life and haul, as they stand" },
    { id: "settings", label: "Settings", hint: "" }, { id: "credits", label: "Credits", hint: "" }, { id: "title", label: "Save & leave to title", hint: "" },
  ] : [
    { id: "continue", label: "Continue dive", hint: recent?.name ?? "No record on this profile", disabled: recent === null },
    { id: "new", label: "New dive", hint: emptySlot === null ? "No record available" : `Writes ${recordLabel(emptySlot)}`, disabled: emptySlot === null },
    { id: "records", label: "Dives & hauls", hint: `${slots.filter(slot => !slot.empty).length} of ${slots.length} records held` },
    { id: "settings", label: "Settings", hint: "Sound, picture, controls" }, { id: "credits", label: "Credits", hint: "" },
  ];
  const select = (id: string) => {
    setActive(id);
    if (id === "resume") back();
    else if (id === "save") save();
    else if (id === "title") void work("Writing the record", () => withdrawToTitle(ctx));
    else if (id === "continue" && recent !== null) load(recent.id);
  };
  if (phase !== "menu" && phase !== "paused") return null;
  return <RuneBox pin={ALL} modal onBack={back} fill={pause ? "#020a0dd9" : "#020a0db3"} padding={narrow ? 20 : 48} gap={narrow ? 16 : 28}>
    <Frame width={narrow ? width - 40 : Math.min(660,width - 96)}>
      <Text family="Share Tech Mono" size={narrow ? 38 : pause ? 48 : 72} tracking={narrow ? 3 : 7} color="#ebe5d0">{pause ? view.diving ? "DIVE HELD" : "HOME HELD" : "DEEPWARD"}</Text>
      <Tag color={AMBER} size={narrow ? 11 : 15}>HALLOWAY PRINT SERVICE · LINE 06</Tag>
    </Frame>
    <RuneScroll height={Math.max(120,height - (narrow ? 200 : 300))} width={FULL}>
      <RuneBox direction={narrow ? "column" : "row"} gap={narrow ? 16 : 38} width={FULL} items="start">
        <RuneBox gap={8} width={narrow ? width - 40 : Math.min(360,width * .32)}>
          {verbs.map((verb,index) => <RuneButton key={verb.id} label={verb.label} disabled={"disabled" in verb && verb.disabled === true} onFocus={() => setActive(verb.id)} onPress={() => select(verb.id)}
            fill={active === verb.id ? "#3d6170" : "#22363f"} border={{ width: active === verb.id ? 2 : 1, color: active === verb.id ? AMBER : "#071014" }} padding={[12,16,12,16]} hover="#ffffff16" press="#00000020" width={FULL}>
            <Row><RuneBox width={7} height={7} radius={4} fill={active === verb.id ? AMBER : "#496167"} /><Tag color={AMBER}>{String(index + 1).padStart(2,"0")}</Tag><RuneBox gap={3}><Text size={narrow ? 19 : 23}>{verb.label}</Text>{verb.hint ? <Text size={12} color={DIM}>{verb.hint}</Text> : null}</RuneBox></Row>
          </RuneButton>)}
        </RuneBox>
        <Frame width={narrow ? width - 40 : Math.min(660,width - Math.min(360,width * .32) - 150)}>
          <RuneBox gap={14} padding={12} fill="#071417" minWidth={0}>
            {active === "settings" ? <RecordSettings /> : active === "credits" ? <>
              <Heading>Deepward</Heading>{DEEPWARD_CREDITS.sections.map(section => <Section key={section.heading}><Tag color={AMBER}>{section.heading}</Tag>{section.entries.map(entry => <Text key={entry.label}>{entry.label}{entry.detail === undefined ? "" : ` · ${entry.detail}`}{entry.href === undefined ? "" : ` · ${entry.href}`}</Text>)}</Section>)}<Text color={DIM}>{DEEPWARD_CREDITS.notice}</Text>
            </> : active === "records" ? <>
              <Heading>Dives & hauls</Heading>{slots.map(slot => <Section key={slot.id}><Tag color={AMBER}>{slot.name ?? recordLabel(slot.id)}</Tag>{typeof slot.meta["thumbnail"] === "string" ? <RuneBox width={FULL} height={110} image={slot.meta["thumbnail"]} fit="cover" /> : null}<Text>{slot.empty ? "Empty record" : Object.entries(slot.meta).filter(([key]) => key !== "thumbnail").map(([key,value]) => `${key}: ${String(value)}`).join(" · ")}</Text><Button onPress={() => slot.empty ? start(slot.id) : load(slot.id)}>{slot.empty ? "New dive" : "Load dive"}</Button>{slot.empty ? null : deleting === slot.id ? <><Text>Burn {recordLabel(slot.id)}? This cannot be undone.</Text><Button onPress={() => void work("Burning the record", async () => { recordSlots.clear(slot.id); await recordOf(ctx)?.deleteSlot(slot.id); setDeleting(null); })}>Confirm delete</Button><Button onPress={() => setDeleting(null)}>Keep record</Button></> : <Button onPress={() => setDeleting(slot.id)}>Delete record</Button>}</Section>)}
            </> : pause ? <HeldBoard /> : active === "continue" ? <><Heading>Continue dive</Heading><Text>{recent?.name ?? "No dive kept yet. Take the rail, pack a haul and save it from the pause console."}</Text>{recent === null ? null : <Button onPress={() => load(recent.id)}>Continue dive</Button>}</> : <>
              <Heading>New dive</Heading><Text size={17}>Full tank. Issue sidearm. Rail to Bellwether and back before the air runs out.</Text>
              <Row justify="between"><Tag>AIR {view.air}s</Tag><Tag>CACHE 4×3</Tag><Tag>LOAD {CACHE_WEIGHT}kg</Tag><Tag>LIFE {view.life}</Tag></Row>
              {emptySlot !== null && recordSlots.get(emptySlot)?.empty === false ? <Text color={AMBER}>{recordLabel(emptySlot)} is held. A new dive replaces it.</Text> : null}
              <Button disabled={emptySlot === null} onPress={() => { if (emptySlot !== null) start(emptySlot); }}>Take the rail</Button>
            </>}
          </RuneBox>
        </Frame>
      </RuneBox>
    </RuneScroll>
    <Tag size={11}>{notice ?? `Marrow / ${recordLabel(open)} · Life ${view.life} · ${view.banked} scrip`}</Tag>
    {busy === null ? null : <RuneBox pin={ALL} modal fill="#020a0dcc" justify="center" items="center"><Text color={AMBER}>{busy}</Text></RuneBox>}
  </RuneBox>;
}
