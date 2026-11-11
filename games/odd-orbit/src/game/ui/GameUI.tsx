/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useState, type ReactNode } from "@jgengine/core/ui/jsx";
import { RuneRoot, RuneTransient, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { registerNativeRuneFont } from "@jgengine/core/ui/rune/nativeSurface.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import { useSettings } from "@jgengine/core/settings/settings.view";
import { useGame } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useStore } from "@jgengine/react/store";

import { GAME_FONTS } from "../../art/fonts/fonts";
import { householdStore } from "../session/store";
import { orbitSession } from "../session/lifecycle";
import { CharterNote, FridgeMagnets, HouseClock, RosterPanel, TermLetter, TransmissionSlip } from "./hud";
import { BuildPalette, Inspector, PantryLedger } from "./panels";
import { HouseSettings, OrbitMenu, type OrbitPreferences } from "./menu";
import { ENAMEL, Heading, Icon, INK, Paper, Plate, RIM, Row, Text, Veil, orbitThemeFor } from "./kit";

for (const face of [GAME_FONTS.display, GAME_FONTS.body]) if (face !== undefined) registerNativeRuneFont(resolveAssetBaseUrl(face.src));

const PREF_KEY = "odd-orbit.preferences.v2";
function readPreferences(): OrbitPreferences {
  try { const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}"); return { calm: p?.calm === true, contrast: p?.contrast === true }; }
  catch { return { calm: false, contrast: false }; }
}

type Drawer = "build" | "ledger" | null;
/** Capture-only request: a shot declares which habitat drawer it wants open. */
export const drawerFocus: { id: Drawer } = { id: null };

/**
 * The habitat HUD as the household's own kitchen: the wall clock top-left, the fridge door
 * top-right, the beings as magnets down the left and a tray of three tools at the foot.
 */
export function GameUI() {
  const ctx = useGameContext();
  const { commands } = useGame();
  const settings = useSettings();
  const { width, height } = useRuneViewport(), phone = width < 600;
  const household = useStore(householdStore, (s) => ({ selectedMemberId: s.selectedMemberId, buildTool: s.buildTool, transmission: s.incident != null && s.charter?.review == null, pantryLow: s.pantry < 4 }));
  const session = useStore(orbitSession, (s) => ({ screen: s.screen }));
  const [drawer, setDrawer] = useState<Drawer>(drawerFocus.id);
  const [preferences, setPreferences] = useState(readPreferences);
  const theme = useMemo(() => orbitThemeFor(preferences), [preferences]);
  const notices = useMemo(() => ({ read: ctx.game.notices.list, subscribe: ctx.game.notices.subscribe }), [ctx]);
  const command = (name: string, data: Record<string, unknown> = {}) => commands.run(name, data);
  const modal = session.screen !== null;
  const setPreference = (key: keyof OrbitPreferences, value: boolean) => {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* The session status surfaces storage availability. */ }
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.repeat || event.defaultPrevented || orbitSession.read(ctx).screen !== null || householdStore.read(ctx).buildTool) return;
      event.preventDefault();
      commands.run("orbit.pause", {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctx, commands]);
  // A selected being takes the side panel; a drawer opened afterwards replaces it, as the DOM habitat did.
  useEffect(() => { if (household.selectedMemberId !== null) setDrawer(null); }, [household.selectedMemberId]);
  const sheet: "build" | "ledger" | "member" | null = drawer ?? (household.selectedMemberId !== null ? "member" : null);
  const sheetW = phone ? width - 16 : 380;
  const sheetH = phone ? Math.round(height * 0.56) : height - 300;
  const sheetTitle = sheet === "build" ? "Furnishings catalogue" : sheet === "ledger" ? "Pantry & bills" : null;

  return <RuneRoot context={ctx} theme={theme}>
    {modal ? null : <RuneView anchor="fill">
      <RuneView anchor="top-left" safe inset={phone ? 10 : 16} gap={phone ? 8 : 12}>
        <HouseClock compact={phone} />
        {phone && sheet !== null ? null : <RosterPanel compact={phone} />}
      </RuneView>
      <RuneView anchor="top-right" safe inset={phone ? 10 : 16} gap={8} items="end">
        <FridgeMagnets compact={phone} />
        {sheet === null ? <CharterNote compact={phone} /> : null}
        {sheet !== null && !phone ? <SidePanel title={sheetTitle} width={sheetW} height={sheetH} close={() => { setDrawer(null); if (sheet === "member") command("member.select", { id: null }); }}>
          {sheet === "build" ? <BuildPalette onChoose={() => setDrawer(null)} /> : sheet === "ledger" ? <PantryLedger command={command} /> : <Inspector />}
        </SidePanel> : null}
      </RuneView>
      {household.transmission ? <RuneView anchor="top" safe inset={phone ? 150 : 16}><TransmissionSlip width={phone ? width - 20 : 460} /></RuneView> : null}
      {sheet !== null && phone ? <RuneView anchor="bottom" safe inset={84}><SidePanel title={sheetTitle} width={sheetW} height={sheetH} close={() => { setDrawer(null); if (sheet === "member") command("member.select", { id: null }); }}>
        {sheet === "build" ? <BuildPalette onChoose={() => setDrawer(null)} /> : sheet === "ledger" ? <PantryLedger command={command} /> : <Inspector />}
      </SidePanel></RuneView> : null}
      <RuneView anchor="bottom" safe inset={phone ? 12 : 18} gap={8} items="center">
        <RuneView gap={6} items="center" maxWidth={phone ? width - 20 : 560} hidden={phone && sheet !== null}>
          <RuneTransient source={notices} expire={ctx.game.notices.prune}>{(notice) => <Paper tint={notice.tone === "deny" ? "#ffd6cf" : "#fff3b8"} padding={[6, 12, 6, 12]}><Text size={14}>{notice.text}</Text></Paper>}</RuneTransient>
        </RuneView>
        {household.buildTool ? <Row fill="#fff6e4" radius={12} border={{ width: 2, color: RIM }} padding={[6, 8, 6, 14]} gap={10}>
          <Text size={14}>Tap open floor to place it.</Text>
          <Plate tone="coral" minHeight={32} padding={[4, 12, 4, 12]} onPress={() => command("build.cancel")}>Cancel</Plate>
        </Row> : null}
        <Row gap={phone ? 8 : 12} label="Habitat tools">
          <Tool tone="butter" icon="hammer" label="Furnish" on={drawer === "build"} onPress={() => setDrawer(drawer === "build" ? null : "build")} />
          <Tool tone={household.pantryLow ? "coral" : "mint"} icon="bread" label={household.pantryLow ? "Pantry !" : "Pantry"} on={drawer === "ledger"} onPress={() => setDrawer(drawer === "ledger" ? null : "ledger")} />
          <Tool tone="lilac" icon="tome" label="Handbook" on={false} onPress={() => command("orbit.pause")} />
        </Row>
      </RuneView>
    </RuneView>}
    {modal ? null : <TermLetter />}
    {modal ? <OrbitMenu preferences={preferences} onPreference={setPreference} /> : null}
    {settings.isOpen ? <Veil label="Settings" close={settings.close}><Row justify="between"><Heading>Settings</Heading><Plate onPress={settings.close} label="Close settings"><Icon name="cross" size={14} /></Plate></Row><HouseSettings preferences={preferences} onPreference={setPreference} /></Veil> : null}
  </RuneRoot>;
}

function Tool({ tone, icon, label, on, onPress }: { tone: keyof typeof ENAMEL; icon: Parameters<typeof Icon>[0]["name"]; label: string; on: boolean; onPress: () => void }) {
  return <Plate tone={tone} on={on} radius={20} minHeight={56} minWidth={96} padding={[6, 14, 6, 14]} gap={2} layout="stack" items="center" justify="center" label={label} onPress={onPress}>
    <Icon name={icon} size={22} /><Text size={13} weight={700} color={INK}>{label}</Text>
  </Plate>;
}

function SidePanel({ title, width, height, close, children }: { title: string | null; width: number; height: number; close: () => void; children: ReactNode }) {
  return <Paper width={width} maxHeight={height} padding={0} gap={0} onBack={close} label={title ?? "Member care"}>
    {title === null ? null : <Row padding={[10, 10, 8, 14]} gap={8} fill={ENAMEL.butter} radius={12} border={{ width: 0, color: RIM }}>
      <Icon name={title.startsWith("Furnish") ? "hammer" : "bread"} size={20} /><Heading size={17} grow={1}>{title}</Heading>
      <Plate tone="cream" radius={99} minHeight={32} padding={[4, 9, 4, 9]} label="Close habitat panel" onPress={close}><Icon name="cross" size={13} /></Plate>
    </Row>}
    <RuneView scroll maxHeight={height - (title === null ? 0 : 52)} padding={14} gap={8}>{children}</RuneView>
  </Paper>;
}
