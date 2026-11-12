/** @jsxImportSource @jgengine/core/ui/jsx */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "@jgengine/core/ui/jsx";
import { RuneAction, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { createSaveSlots, slotText, type SaveSlotMeta } from "@jgengine/core/save/saveSlots";
import { formatSavePlaytime, gameSaveSlotSource, refreshSaveSlots } from "@jgengine/core/save/saveSlotIndex";
import { useSaveSlots } from "@jgengine/core/save/saveSlots.view";
import { useCurrency, useEntityStat, useGame, usePlayer } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
import { useStore } from "@jgengine/ui/store";
import { startedStore } from "../commands";
import { tribuneAds } from "../credits";
import { captureHarborThumb, harborProfile } from "../menuProfile";
import { harborSave, loadHarborSave, saveHarborState } from "../save";
import { sessionStore } from "../session";
import { BurnerPhone, LcdLine } from "./BurnerPhone";
import { Button, Display, Field, Heading, KeyLegend, Label, LcdText, money, Row, Text, useMenuSound, useRoom } from "./kit";
import { harborFocus } from "./menuFocus";
import { PhoneSettings } from "./PhoneSettings";
import { DISPLAY, HH } from "./theme";

/** Harbor's dispatch bays; a parcel run is kept in one of them. */
export const HARBOR_BAYS = [
  { id: "coast", label: "The Coast" },
  { id: "docks", label: "The Docks" },
  { id: "uptown", label: "Uptown" },
] as const;

const BAY_LABELS: Record<string, string> = Object.fromEntries(HARBOR_BAYS.map((bay) => [bay.id, bay.label]));
const DEFAULT_DRIVER = "Mara Vell";
/** Names a courier can sign without a keyboard: the licence's Shuffle steps through them. */
const DRIVERS = ["Mara Vell", "Dex Okafor", "Lu Marchetti", "Rey Santos", "Jo Kincaid", "Nico Bell"] as const;

const harborSlots = createSaveSlots({
  capacity: HARBOR_BAYS.length,
  slots: HARBOR_BAYS.map((bay) => ({ id: bay.id, empty: true, meta: {} })),
});

/** Keep the slot index in step with the dispatch documents. */
export async function refreshHarborSlots(ctx: ReturnType<typeof useGameContext>): Promise<void> {
  await refreshSaveSlots(gameSaveSlotSource(harborSave(ctx)), harborSlots, {
    nameOf: (_slot, document) => {
      const profile = (document.systems["profile"] ?? {}) as { driver?: string | null };
      return typeof profile.driver === "string" && profile.driver.length > 0 ? profile.driver : "Courier";
    },
    metaOf: (_slot, document) => {
      const run = (document.systems["run"] ?? {}) as { courierSession?: { closed?: number; session?: number } };
      const profile = (document.systems["profile"] ?? {}) as { driver?: string | null; thumbnail?: string | null };
      return {
        ...(typeof profile.driver === "string" && profile.driver.length > 0 ? { character: profile.driver } : {}),
        parcels: Math.max(0, run.courierSession?.closed ?? 0),
        runs: Math.max(0, run.courierSession?.session ?? 0),
        playtime: formatSavePlaytime(document.playtime),
        ...(typeof profile.thumbnail === "string" && profile.thumbnail.length > 0 ? { thumbnail: profile.thumbnail } : {}),
      };
    },
  });
}

/** Started flag the shell reveals play chrome with. */
export function useGameStarted(): boolean {
  return useStore(startedStore, (value) => value === true);
}

function bayForNew(): string {
  const empty = harborSlots.list().find((slot) => slot.empty);
  if (empty !== undefined) return empty.id;
  const held = harborSlots.list().sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0));
  return held[0]?.id ?? HARBOR_BAYS[0].id;
}

type TitleId = "continue" | "new" | "keeps" | "settings" | "credits";
interface TitleItem { id: TitleId; label: string; hint?: string; disabled?: boolean }

/** Harbor Heat's front end: the roadside sign at dusk, and the burner phone when you step off the clock. */
export function HarborMenu() {
  const ctx = useGameContext();
  const { commands } = useGame();
  const paused = useStore(sessionStore, (value) => value.paused === true);
  const started = useGameStarted();
  const bays = useSaveSlots(harborSlots);
  const [name, setName] = useState(harborProfile.driver ?? DEFAULT_DRIVER);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const recent = harborSlots.mostRecent();

  useEffect(() => { void refreshHarborSlots(ctx); }, [ctx, started]);
  // A fresh pause always opens on its home screen, with no stale save line.
  useEffect(() => { if (paused) setNotice(null); }, [paused]);

  const saveHere = useCallback(async () => {
    setBusy(true);
    setNotice("Saving...");
    try {
      harborProfile.driver = name.trim() === "" ? harborProfile.driver : name.trim();
      await captureHarborThumb();
      await saveHarborState(ctx);
      await refreshHarborSlots(ctx);
      setNotice(`Saved to ${BAY_LABELS[harborSave(ctx).slot()] ?? "the bay"}.`);
    } finally {
      setBusy(false);
    }
  }, [ctx, name]);

  const openBay = async (slot: string) => {
    setBusy(true);
    try {
      if (harborSave(ctx).slot() !== slot) await harborSave(ctx).switchSlot(slot, { flush: false });
      const loaded = await loadHarborSave(ctx);
      if (!loaded) setNotice("That bay is empty.");
      commands.run("game.start", {});
    } finally {
      setBusy(false);
    }
  };

  const beginIn = async (slot: string) => {
    setBusy(true);
    try {
      if (harborSave(ctx).slot() !== slot) await harborSave(ctx).switchSlot(slot, { flush: false });
      harborProfile.driver = name.trim() === "" ? DEFAULT_DRIVER : name.trim();
      await saveHarborState(ctx);
      await refreshHarborSlots(ctx);
      commands.run("game.start", {});
    } finally {
      setBusy(false);
    }
  };

  if (!started) {
    const kept = bays.filter((bay) => !bay.empty).length;
    const items: TitleItem[] = [
      { id: "continue", label: "Continue", hint: recent === null ? "No run on the board" : `${recent.name ?? recent.id}`, disabled: recent === null },
      { id: "new", label: "Hit the street", hint: "New courier" },
      { id: "keeps", label: "Missions & parcels", hint: `${kept} of ${bays.length} bays` },
      { id: "settings", label: "Settings", hint: "Sound · picture · keys" },
      { id: "credits", label: "Credits" },
    ];
    const first = (harborFocus.id as TitleId | null) ?? (recent === null ? "new" : "continue");
    return (
      <HarborTitle items={items} initial={first} notice={`${busy ? "Saving... " : ""}${notice ?? ""}`} detail={(id, back) => {
        if (id === "continue") return <ContinueTag slot={recent} bayLabel={recent === null ? "" : (BAY_LABELS[recent.id] ?? recent.id)} onContinue={() => { if (recent !== null) void openBay(recent.id); }} />;
        if (id === "new") return <CourierLicence name={name} onName={setName} bayLabel={BAY_LABELS[bayForNew()] ?? ""} onBegin={() => void beginIn(bayForNew())} />;
        if (id === "keeps") {
          return <BayTags bays={bays} onLoad={(slot) => void openBay(slot.id)} onNew={(slot) => void beginIn(slot.id)} onClear={(slot) => {
            harborSlots.clear(slot.id);
            void harborSave(ctx).deleteSlot(slot.id).then(() => refreshHarborSlots(ctx));
          }} />;
        }
        if (id === "settings") return <TitlePhone onBack={back} />;
        return <TribuneCredits />;
      }} />
    );
  }

  if (!paused) return null;
  return (
    <PausePhone onResume={() => commands.run("session.pause", { paused: false })} onSave={() => void saveHere()} notice={notice ?? ""}
      bayLabel={BAY_LABELS[harborSave(ctx).slot()] ?? ""} kept={`${bays.filter((bay) => !bay.empty).length} of ${bays.length} bays kept`} />
  );
}

// --- The roadside sign ---------------------------------------------------------------------------

/** The roadside sign's neon: two words in glass tube over an enamel box ringed with chaser bulbs. */
function NeonSign({ small }: { small: boolean }) {
  const bulbs = Array.from({ length: small ? 9 : 13 }, (_, i) => i);
  const row = <Row justify="between" padding={[0, 6, 0, 6]}>{bulbs.map((i) => <RuneView key={i} width={small ? 5 : 7} height={small ? 5 : 7} radius={4} fill={i % 2 === 0 ? "#fff3c4" : "#ffcf6a"} shadow={{ y: 0, blur: 6, color: "#ffd27a" }} />)}</Row>;
  return (
    <RuneView padding={small ? [6, 8, 6, 8] : [8, 10, 8, 10]} gap={small ? 4 : 6} fill="#0b3742" border={{ width: small ? 3 : 4, color: HH.cream }} radius={6} shadow={{ x: 6, y: 8, blur: 0, color: "#00000088" }}>
      {row}
      <RuneView items="center" gap={0} padding={small ? [0, 14, 0, 14] : [2, 24, 2, 24]}>
        <Label color={HH.mint} text="MAINSAIL · GULF COAST" />
        <Text family={DISPLAY} size={small ? 50 : 84} tracking={2} color={HH.amber} text="HARBOR" />
        <Text family={DISPLAY} size={small ? 44 : 72} tracking={4} color={HH.coral} text="HEAT" />
      </RuneView>
      {row}
    </RuneView>
  );
}

/** One marquee line: every letter its own black plastic tile on the board. */
function MarqueeLetters({ text, small }: { text: string; small: boolean }) {
  return (
    <Row gap={small ? 1 : 2}>
      {[...text.toUpperCase()].map((ch, i) => ch === " " ? <RuneView key={i} width={small ? 6 : 9} /> : (
        <RuneView key={i} width={small ? 15 : 21} height={small ? 20 : 27} fill="#111" radius={2} justify="center" items="center" y={((i * 7) % 3) - 1}>
          <Text family={DISPLAY} size={small ? 15 : 21} color="#f6f1e4" text={ch} />
        </RuneView>
      ))}
    </Row>
  );
}

/**
 * The title as a Mainsail roadside sign at dusk: the HARBOR HEAT neon over the motel-style marquee
 * board where tonight's choices are spelled in plastic letters. Each choice opens its own object beside
 * the sign: the last run's parcel tag, a courier licence, the bays' tags, the burner's settings and a
 * Tribune clipping of credits. On an upright phone the object replaces the sign until you go back.
 */
function HarborTitle({ items, initial, detail, notice }: {
  items: readonly TitleItem[];
  initial: TitleId;
  detail: (id: TitleId, back: () => void) => ReactNode;
  notice: string;
}) {
  const sound = useMenuSound();
  const room = useRoom();
  const { width, height } = useRuneViewport();
  const stacked = room === "stacked";
  const small = room !== "wide";
  const [focused, setFocused] = useState<TitleId>(initial);
  const [entered, setEntered] = useState<TitleId | null>(harborFocus.id === null ? null : initial);
  const back = () => { sound.play("back"); setEntered(null); };
  const shown = entered ?? (stacked ? null : focused);
  const signColumn = (
    <RuneView gap={small ? 10 : 16} items="center" width={stacked ? width - 32 : small ? 330 : 470}>
      <NeonSign small={small} />
      <RuneView width={{ fraction: 1 }} padding={small ? [8, 10, 10, 10] : [12, 16, 14, 16]} gap={small ? 4 : 6} fill="#f4f1e8" border={{ width: 3, color: "#2a2a2a" }} radius={4} label="Title menu"
        shadow={{ x: 5, y: 6, blur: 0, color: "#00000088" }}>
        <Label color="#4a3a20" text="TONIGHT ON THE COAST" />
        {items.map((item) => (
          <RuneAction key={item.id} label={item.label} disabled={item.disabled === true} run={() => { sound.play("confirm"); setFocused(item.id); setEntered(item.id); }}
            onFocus={() => { if (focused !== item.id) { sound.play("move"); setFocused(item.id); } }}
            padding={[4, 6, 4, 6]} radius={3} gap={2} hover="#00000014" press="#00000028" opacity={item.disabled === true ? 0.45 : 1}
            fill={shown === item.id ? "#ffd27a55" : "#00000000"}>
            <MarqueeLetters text={item.label} small={small} />
            {item.hint === undefined ? null : <Label color="#5a4a30" text={item.hint} />}
          </RuneAction>
        ))}
      </RuneView>
    </RuneView>
  );
  const detailColumn = shown === null ? null : (
    <RuneView gap={10} width={stacked ? width - 32 : Math.min(520, width - 400)} onBack={back}>
      {stacked ? <Button tone="ink" onPress={back}>◀ Back to the sign</Button> : null}
      {detail(shown, back)}
    </RuneView>
  );
  return (
    <RuneView anchor="fill" modal gradient={{ angle: 0, stops: [[0, "#2c1c4a"], [0.45, "#a2456a"], [0.7, "#f08a4b"], [1, "#0b2a33"]] }}>
      <RuneView anchor="fill" padding={stacked ? [20, 16, 16, 16] : small ? 16 : 36} gap={12}>
        <RuneView scroll grow={1} maxHeight={height - (stacked ? 60 : 90)}>
          <RuneView layout={stacked ? "stack" : "row"} gap={small ? 16 : 36} justify="center" items={stacked ? "center" : "start"}>
            {stacked && shown !== null ? null : signColumn}
            {detailColumn}
          </RuneView>
        </RuneView>
        <Row justify="between">
          <Text size={14} weight={600} color={HH.cream} role="status" text={notice} />
          {small ? null : <KeyLegend items={[{ keys: ["↑", "↓"], label: "move" }, { keys: ["Enter"], label: "select" }, { keys: ["Esc"], label: "back" }]} />}
        </Row>
      </RuneView>
    </RuneView>
  );
}

/** A courier frame stapled to a tag, or a stencilled blank where none was kept. */
function Snapshot({ src, width = 150 }: { src: string | null; width?: number }) {
  const height = Math.round(width * 0.5625);
  return (
    <RuneView width={width} height={height} fill="#2b3b41" border={{ width: 3, color: "#fbf7ee" }} justify="center" items="center" shadow={{ x: 2, y: 3, blur: 0, color: "#00000055" }}
      {...(src === null ? {} : { image: src, fit: "cover" as const })}>
      {src === null ? <Label color="#9fb3b8" text="NO FRAME KEPT" /> : null}
    </RuneView>
  );
}

/** A manila parcel tag with a punched hole and a two-part header. */
function Tag({ head, title, children, width }: { head: string; title: string; children: ReactNode; width?: number }) {
  return (
    <RuneView variant="paper" {...(width === undefined ? {} : { width })} gap={8}>
      <Row justify="between">
        <Row gap={8}><RuneView width={14} height={14} radius={7} fill="#3a2a18" /><Label color="#5a4a30" text={head.toUpperCase()} /></Row>
        <Heading size={18} color={HH.coral} text={title} />
      </Row>
      {children}
    </RuneView>
  );
}

/** The last run's parcel tag, with the frame its courier left and the button that picks it up. */
function ContinueTag({ slot, bayLabel, onContinue }: { slot: SaveSlotMeta | null; bayLabel: string; onContinue: () => void }) {
  return (
    <Tag head="Mainsail express" title="Parcel tag">
      {slot === null ? (
        <RuneView gap={4}><Heading color={HH.night} text="No run on the board" /><Text color="#5a4a30" text="Take a run, then save it at the board." /></RuneView>
      ) : (
        <Row gap={14} items="start">
          <Snapshot src={slotText(slot, "thumbnail")} />
          <RuneView gap={6} grow={1}>
            <Heading size={28} color={HH.night} text={slot.name ?? "Courier"} />
            <Field label="Bay" value={bayLabel} />
            <Field label="On the road" value={String(slot.meta["playtime"] ?? "0m")} />
            <Field label="Parcels" value={String(slot.meta["parcels"] ?? 0)} />
            <Button tone="coral" onPress={onContinue}>Pick it up</Button>
          </RuneView>
        </Row>
      )}
    </Tag>
  );
}

const KEY_CHARS: Record<string, string> = { Space: " ", Minus: "-", Quote: "'", Period: "." };
/** The character a key code types into the name, or null. */
export function typedChar(code: string): string | null {
  if (code.startsWith("Key") && code.length === 4) return code.slice(3).toLowerCase();
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  return KEY_CHARS[code] ?? null;
}
/** Each word of a signed name starts with a capital. */
export const signName = (text: string): string => text.replace(/(^|[\s-])([a-z])/g, (_, gap: string, ch: string) => gap + ch.toUpperCase());

/**
 * The courier licence: the runner's mark, the name you sign, the bay the run goes in. Press the name
 * line to sign it from the keyboard (Enter or Escape finishes); Shuffle picks a name with no keyboard.
 */
function CourierLicence({ name, onName, bayLabel, onBegin }: { name: string; onName: (next: string) => void; bayLabel: string; onBegin: () => void }) {
  const [editing, setEditing] = useState(false);
  // Keys can land faster than renders: the typed name and the replace-on-first-key flag live in refs.
  const typed = useRef(name);
  const fresh = useRef(false);
  typed.current = editing ? typed.current : name;
  const room = useRoom();
  const type = (code: string) => {
    if (code === "Enter" || code === "Escape" || code === "Tab" || code.startsWith("Arrow")) { setEditing(false); return; }
    const base = fresh.current ? "" : typed.current;
    fresh.current = false;
    if (code === "Backspace") typed.current = base.slice(0, -1);
    else {
      const ch = typedChar(code);
      if (ch === null) return;
      typed.current = signName(base + ch).slice(0, 24);
    }
    onName(typed.current);
  };
  const shuffle = () => { const i = DRIVERS.indexOf(name as (typeof DRIVERS)[number]); onName(DRIVERS[(i + 1) % DRIVERS.length]!); };
  return (
    <RuneView fill="#f3e7cc" border={{ width: 3, color: HH.ink }} radius={4} shadow={{ x: 6, y: 6, blur: 0, color: "#071d25aa" }} {...(editing ? { onKey: type } : {})}>
      <Row justify="between" padding={[6, 12, 6, 12]} fill={HH.teal}><Label color={HH.cream} text="MAINSAIL EXPRESS" /><Heading size={18} color={HH.amber} text="Courier licence" /></Row>
      <RuneView layout={room === "stacked" ? "stack" : "row"} gap={14} padding={14} items={room === "stacked" ? "stretch" : "start"}>
        <RuneView gap={8} items="center">
        <RuneView width={120} height={150} fill="#c9d6cf" border={{ width: 2, color: HH.ink }} justify="end" items="center" clip>
          <RuneView width={56} height={56} radius={28} fill={HH.ink} />
          <RuneView width={96} height={60} radius={30} fill={HH.ink} y={8} />
          <RuneView pin={[0, 0, 0, null]} padding={[2, 4, 2, 4]}><Label color={HH.ink} text={"6'  5'  4'"} /></RuneView>
        </RuneView>
        <RuneView padding={[2, 8, 2, 8]} border={{ width: 2, color: "#2f7a4f" }} radius={3} opacity={0.75}><Label color="#2f7a4f" text="VALID · MAINSAIL" /></RuneView>
        </RuneView>
        <RuneView gap={8} grow={1}>
          <Label color="#5a4a30" text="COURIER NAME" />
          <RuneAction label="Courier name" run={() => { typed.current = name; fresh.current = !editing; setEditing(!editing); }} padding={[6, 8, 6, 8]} fill={editing ? "#fffaf0" : "#ffffff80"}
            border={{ width: 2, color: editing ? HH.coral : HH.ink }} radius={2} hover="#ffffff">
            <Text family={DISPLAY} size={26} color={HH.night} text={`${name}${editing ? "_" : ""}`} />
          </RuneAction>
          <Label color={editing ? HH.coral : "#5a4a30"} text={editing ? "TYPE A NAME · ENTER TO SIGN" : "PRESS THE NAME TO SIGN IT"} />
          <Button tone="ink" onPress={shuffle}>Shuffle name</Button>
          <Row gap={18}><Field label="Bay" value={bayLabel} /><Field label="Pays" value="Cash · cred" /></Row>
          <Button tone="coral" onPress={() => { setEditing(false); onBegin(); }}>Take the run</Button>
        </RuneView>
      </RuneView>
    </RuneView>
  );
}

/** One dispatch bay's tag each: who is kept there, how long they've run, and what you can do with it. */
function BayTags({ bays, onLoad, onNew, onClear }: { bays: readonly SaveSlotMeta[]; onLoad: (slot: SaveSlotMeta) => void; onNew: (slot: SaveSlotMeta) => void; onClear: (slot: SaveSlotMeta) => void }) {
  const sound = useMenuSound();
  const room = useRoom();
  const [arming, setArming] = useState<string | null>(null);
  return (
    <RuneView gap={12}>
      <RuneView layout={room === "stacked" ? "stack" : "row"} gap={10}>
        {bays.map((bay, index) => {
          const label = BAY_LABELS[bay.id] ?? bay.id;
          return (
            <RuneAction key={bay.id} label={bay.empty ? `${label}: empty bay, start a run` : `${label}: load ${bay.name ?? "courier"}`} grow={1}
              run={() => { sound.play("confirm"); if (bay.empty) onNew(bay); else onLoad(bay); }}
              variant="paper" fill={bay.empty ? "#e9dcc0" : HH.paper} hover="#fffaf0" press="#e0d0b0" gap={6} padding={10}>
              <Row gap={6}><RuneView width={12} height={12} radius={6} fill="#3a2a18" /><Label color="#5a4a30" text={`BAY ${index + 1}`} /></Row>
              <Heading size={22} color={HH.night} text={label} />
              <Snapshot src={slotText(bay, "thumbnail")} width={room === "wide" ? 140 : 200} />
              {bay.empty ? <Text color="#7a6a50" text="Empty bay" /> : (
                <RuneView gap={0}><Text weight={700} color={HH.night} text={bay.name ?? "Courier"} /><Text size={13} color="#5a4a30" text={`${String(bay.meta["playtime"] ?? "0m")} · ${String(bay.meta["parcels"] ?? 0)} parcels`} /></RuneView>
              )}
              <RuneView padding={[3, 10, 2, 10]} fill={bay.empty ? HH.teal : HH.coral} radius={2} items="center"><Text family={DISPLAY} size={16} color={HH.cream} text={bay.empty ? "Start here" : "Load"} /></RuneView>
            </RuneAction>
          );
        })}
      </RuneView>
      {bays.filter((bay) => !bay.empty).map((bay) => {
        const label = BAY_LABELS[bay.id] ?? bay.id;
        return (
          <Row key={bay.id} gap={8} padding={[4, 8, 4, 8]} fill="#102e3bd8" radius={4}>
            <Label grow={1} color={HH.cream} text={label.toUpperCase()} />
            <Button tone="ink" label={`New run in ${label}`} onPress={() => onNew(bay)}>New run here</Button>
            <Button tone="coral" label={`Clear ${label}`} onPress={() => {
              if (arming !== bay.id) { setArming(bay.id); return; }
              setArming(null);
              onClear(bay);
            }}>{arming === bay.id ? "Sure? Clear it" : "Clear"}</Button>
          </Row>
        );
      })}
    </RuneView>
  );
}

/** The settings, on the same burner phone the pause menu uses. */
function TitlePhone({ onBack }: { onBack: () => void }) {
  const { height } = useRuneViewport();
  return (
    <RuneView items="center" onBack={onBack}>
      <BurnerPhone app="Settings" width={310} softRight={{ label: "Back", run: onBack }}>
        <PhoneSettings maxHeight={Math.max(140, height - 420)} />
      </BurnerPhone>
    </RuneView>
  );
}

/** Credits as a clipping from the Mainsail Tribune's back page. */
function TribuneCredits() {
  const ink = "#1e1a14";
  const room = useRoom();
  const { height } = useRuneViewport();
  return (
    <RuneView fill="#efe6d2" padding={16} gap={8} shadow={{ x: 6, y: 6, blur: 0, color: "#071d25aa" }}>
      <Row justify="between"><Text family={DISPLAY} size={room === "wide" ? 30 : 22} color={ink} text="The Mainsail Tribune" /><Label color={ink} text="Late edition · Credits" /></Row>
      <RuneView height={3} fill={ink} />
      <Heading size={26} color={ink} text="Who made the heat" />
      <RuneView layout={room === "wide" ? "row" : "stack"} gap={14}>
        <Text grow={1} size={14} color={ink} text="Harbor Heat · Mainsail dispatch: game and art direction. Original city blocks, awnings, signs, aircraft, boats, booth, towers and poster." />
        <Text grow={1} size={14} color={ink} text="Engine · JGengine: scene, save, menu." />
      </RuneView>
      <RuneView height={1} fill={ink} />
      <Label color={ink} text="CLASSIFIEDS · PROPS AND PEOPLE ON LOAN" />
      <RuneView scroll maxHeight={Math.max(120, height - (room === "stacked" ? 420 : 380))} label="Asset credits">
        <RuneView layout="grid" columns={room === "wide" ? 2 : 1} gap={6}>
          {tribuneAds().map((entry) => (
            <RuneView key={entry.title + entry.page} padding={6} border={{ width: 1, color: "#1e1a1455" }} gap={1}>
              <Text weight={700} size={13} color={ink} text={entry.title} />
              {entry.who === "" ? null : <Text size={12} color={ink} text={entry.who} />}
              {entry.page === "" ? null : <Text mono size={11} color="#5a4a30" text={entry.page} />}
            </RuneView>
          ))}
        </RuneView>
      </RuneView>
    </RuneView>
  );
}

// --- Off the clock -------------------------------------------------------------------------------

const HOME = [
  { id: "resume", label: "Back to the coast" },
  { id: "save", label: "Save progress" },
  { id: "settings", label: "Settings & controls" },
] as const;

/**
 * Off the clock: the city stops and the courier pulls out the burner. The home screen resumes, saves
 * the bay or opens the Settings app; Escape resumes from home and goes back from settings.
 */
function PausePhone({ onResume, onSave, notice, bayLabel, kept }: { onResume: () => void; onSave: () => void; notice: string; bayLabel: string; kept: string }) {
  const sound = useMenuSound();
  const room = useRoom();
  const { height } = useRuneViewport();
  const [page, setPage] = useState<"home" | "settings">("home");
  const { userId } = usePlayer();
  const cash = useCurrency("cash");
  const cred = useEntityStat(userId, "level")?.current ?? 1;
  const home = page === "home";
  const confirm = (id: (typeof HOME)[number]["id"]) => {
    sound.play("confirm");
    if (id === "resume") onResume();
    else if (id === "save") onSave();
    else setPage("settings");
  };
  const back = () => { sound.play("back"); if (home) onResume(); else setPage("home"); };
  return (
    <RuneView anchor="fill" modal fill={HH.scrim} onBack={back} justify="center" items="center">
      <Row gap={48} items="center">
        {room === "wide" ? (
          <RuneView gap={10} width={360}>
            <Label color={HH.mint} text="MAINSAIL · THE CLOCK IS STOPPED" />
            <Display size={86} color={HH.amber} text="Off the" />
            <Display size={86} color={HH.coral} text="clock" />
            <Text color={HH.cream} text="The city and the delivery clock wait for you." />
            <KeyLegend items={[{ keys: ["↑", "↓"], label: "choose" }, { keys: ["Enter"], label: "select" }, { keys: ["Esc"], label: home ? "resume" : "back" }]} />
          </RuneView>
        ) : null}
        <BurnerPhone app={home ? "Off the clock" : "Settings"} width={room === "wide" ? 320 : 300} keypad={room === "wide" && home} notice={home ? notice : undefined}
          softRight={{ label: home ? "Resume" : "Back", run: back }}>
          {home ? (
            <RuneView gap={4} label="Pause menu">
              <Row justify="between" padding={[0, 4, 4, 4]}><Text family={DISPLAY} size={26} color={HH.lcdInk} text={money(cash)} /><LcdText weight={800} text={`Cred ${cred}`} /></Row>
              {HOME.map((item) => <LcdLine key={item.id} label={item.label} run={() => confirm(item.id)}><LcdText weight={700} text={`▸ ${item.label}`} /></LcdLine>)}
              <Row justify="between" padding={[6, 4, 0, 4]}><LcdText size={11} text={bayLabel === "" ? "Not filed yet" : `Bay · ${bayLabel}`} /><LcdText size={11} text={kept} /></Row>
            </RuneView>
          ) : <PhoneSettings maxHeight={Math.max(160, height - (room === "wide" ? 360 : 300))} />}
        </BurnerPhone>
      </Row>
    </RuneView>
  );
}

/** Settings opened from the shell (its gear or a binding) on the same burner. */
export function SettingsPhone({ close }: { close: () => void }) {
  const { height } = useRuneViewport();
  return (
    <RuneView anchor="fill" modal fill={HH.scrim} onBack={close} justify="center" items="center">
      <BurnerPhone app="Settings" width={310} softRight={{ label: "Back", run: close }}>
        <PhoneSettings maxHeight={Math.max(160, height - 300)} />
      </BurnerPhone>
    </RuneView>
  );
}
