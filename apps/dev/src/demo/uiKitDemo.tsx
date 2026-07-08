import { useEffect, useState } from "react";

import {
  ActionBar,
  AmmoCounter,
  AnnouncementBanner,
  ArcGauge,
  BossBar,
  BreakMeter,
  BuffTray,
  CastBar,
  ChargeMeter,
  CombatFloatLayer,
  CombatLogPanel,
  ComboCounter,
  CountdownPips,
  CraftingPanel,
  CurrencyDisplay,
  DamageDirectionIndicator,
  DeathScreenView,
  DialoguePanel,
  EquipmentDoll,
  GAME_ICON_NAMES,
  GameIcon,
  HeartRow,
  HotbarSelector,
  HudMarkerLayer,
  HudPanel,
  InteractionRing,
  ItemGrid,
  KillFeed,
  LoadingScreen,
  LockOnMarker,
  LootCard,
  MatchTimer,
  ObjectiveChannel,
  PauseScreen,
  PickupToastStack,
  QuestTracker,
  RacePosition,
  RankList,
  ResourceOrb,
  ResultsScreen,
  Reticle,
  ScoreReadout,
  ScoreboardOverlay,
  SettingsGroup,
  SliderRow,
  StreakCallout,
  TargetFrame,
  TeamScoreBoard,
  TitleScreen,
  ToggleRow,
  UnitFrame,
  VendorPanel,
  WaveIndicator,
  XpBar,
  emberTheme,
  fieldkitTheme,
  synthwaveTheme,
  useGameUiTheme,
  GameUiThemeProvider,
  type GameUiTheme,
} from "@jgengine/react/gameui";

import type { PlayableGame } from "@jgengine/shell/registry";
import { demoGame } from "./demoGame";

const THEMES: readonly GameUiTheme[] = [emberTheme, synthwaveTheme, fieldkitTheme];

type TabId = "hud" | "items" | "meters" | "panels" | "screens" | "icons";

const TABS: readonly { id: TabId; label: string }[] = [
  { id: "hud", label: "HUD" },
  { id: "items", label: "Items" },
  { id: "meters", label: "Meters" },
  { id: "panels", label: "Panels" },
  { id: "screens", label: "Screens" },
  { id: "icons", label: "Icons" },
];

function useCycle(periodMs: number): number {
  const [fraction, setFraction] = useState(0.45);
  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(() => {
      setFraction(((performance.now() - start) % periodMs) / periodMs);
    }, 140);
    return () => clearInterval(timer);
  }, [periodMs]);
  return fraction;
}

function DemoTabs({
  active,
  onSelect,
  themeIndex,
  onTheme,
}: {
  active: TabId;
  onSelect: (tab: TabId) => void;
  themeIndex: number;
  onTheme: (index: number) => void;
}) {
  const theme = useGameUiTheme();
  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: 4,
        alignItems: "center",
        pointerEvents: "auto",
        zIndex: 50,
      }}
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          style={{
            padding: "4px 12px",
            clipPath: "polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)",
            border: "none",
            cursor: "pointer",
            fontFamily: theme.fontDisplay,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            background:
              active === tab.id
                ? `linear-gradient(180deg, ${theme.accent} 0%, ${theme.accentDeep} 100%)`
                : "rgba(0,0,0,0.55)",
            color: active === tab.id ? theme.surfaceDeep : theme.textDim,
          }}
        >
          {tab.label}
        </button>
      ))}
      <span style={{ width: 10 }} />
      {THEMES.map((entry, index) => (
        <button
          key={entry.name}
          type="button"
          onClick={() => onTheme(index)}
          title={entry.name}
          style={{
            width: 16,
            height: 16,
            transform: "rotate(45deg)",
            border: `1px solid ${index === themeIndex ? "#fff" : "rgba(255,255,255,0.3)"}`,
            background: entry.accent,
            cursor: "pointer",
          }}
        />
      ))}
    </div>
  );
}

function HudScene() {
  const theme = useGameUiTheme();
  const cast = useCycle(2600);
  const ring = useCycle(3400);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", top: 44, left: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <UnitFrame
          name="Kaelen Voss"
          level={24}
          vitals={[
            { tone: "health", value: { current: 1450, max: 1900 } },
            { tone: "mana", value: { current: 380, max: 520 } },
          ]}
        />
        <div style={{ paddingLeft: 60 }}>
          <BuffTray
            buffs={[
              { id: "b1", icon: <GameIcon name="fire" size={18} />, kind: "buff", remainingFraction: 0.7, label: "Emberheart" },
              { id: "b2", icon: <GameIcon name="leaf" size={18} />, kind: "buff", remainingFraction: 0.35, label: "Regrowth" },
              { id: "b3", icon: <GameIcon name="poison" size={18} />, kind: "debuff", stacks: 3, remainingFraction: 0.55, label: "Venom" },
              { id: "b4", icon: <GameIcon name="frost" size={18} />, kind: "debuff", remainingFraction: 0.2, label: "Chilled" },
            ]}
          />
        </div>
      </div>
      <div style={{ position: "absolute", top: 44, right: 16, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
        <TargetFrame
          name="Gravemaw Alpha"
          level={26}
          relation="hostile"
          vitals={[{ tone: "health", value: { current: 6200, max: 9800 } }]}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          <BreakMeter fraction={0.72} width={130} />
          <ChargeMeter fraction={0.85} tiers={[0.5]} width={130} label="Fury" />
        </div>
        <QuestTracker
          quests={[
            {
              id: "q1",
              title: "The Ashen Road",
              objectives: [
                { id: "o1", label: "Cross the cinder bridge", complete: true },
                { id: "o2", label: "Cull gravemaw stalkers", count: 7, target: 10 },
                { id: "o3", label: "Light the beacon", complete: false },
              ],
            },
            {
              id: "q2",
              title: "Supplies for Bren",
              objectives: [{ id: "o4", label: "Gather ironwood", count: 3, target: 5 }],
            },
          ]}
        />
        <KillFeed
          entries={[
            { id: "k1", left: "Kaelen", right: "Stalker", highlight: true },
            { id: "k2", left: "Rin", right: "Gravemaw Whelp" },
            { id: "k3", left: "Ashfang", right: "Kira" },
          ]}
        />
      </div>
      <div style={{ position: "absolute", top: 40, left: "50%", transform: "translateX(-50%)" }}>
        <BossBar
          name="The Ashen Colossus"
          value={{ current: 6100, max: 9800 }}
          phases={[0.33, 0.66]}
          subLabel="Enrage in 2:41"
        />
      </div>
      <div style={{ position: "absolute", top: "36%", left: "50%", transform: "translate(-50%, -50%)" }}>
        <Reticle variant="cross" spread={0.3} hit />
      </div>
      <div style={{ position: "absolute", top: "30%", left: "62%" }}>
        <LockOnMarker locked label="Gravemaw" />
      </div>
      <CombatFloatLayer
        entries={[
          { id: "f1", text: "218", kind: "damage", x: 46, y: 30 },
          { id: "f2", text: "1042", kind: "crit", x: 54, y: 26 },
          { id: "f3", text: "+364", kind: "heal", x: 38, y: 34 },
          { id: "f4", text: "Out of range", kind: "error", x: 50, y: 68 },
        ]}
        durationMs={60000}
      />
      <DamageDirectionIndicator angleDegrees={130} radius={110} />
      <HudMarkerLayer
        markers={[
          { id: "m1", x: 40, y: 22, label: "Extraction", distance: "142m", kind: "objective" },
          { id: "m2", x: 70, y: 48, label: "War Chest", distance: "36m", kind: "loot" },
          { id: "m3", x: 97, y: 40, kind: "danger", clamped: true, arrowAngle: 90 },
        ]}
      />
      <div style={{ position: "absolute", top: "56%", left: "50%", transform: "translateX(-50%)" }}>
        <InteractionRing fraction={ring} keybind="E" label="Open Cache" />
      </div>
      <div style={{ position: "absolute", right: 20, top: "52%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <ComboCounter count={14} decayFraction={0.7} />
        <StreakCallout text="Triple Kill" tier={3} />
      </div>
      <div style={{ position: "absolute", bottom: 118, left: "50%", transform: "translateX(-50%)" }}>
        <CastBar fraction={cast} label="Pyroclasm" width={260} />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 44,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <ActionBar
          slots={[
            { id: "s1", icon: <GameIcon name="sword" />, keybind: "1" },
            { id: "s2", icon: <GameIcon name="fire" />, keybind: "2", state: "cooldown", cooldownFraction: 0.6, cooldownSeconds: 4 },
            { id: "s3", icon: <GameIcon name="frost" />, keybind: "3", state: "noResource" },
            { id: "s4", icon: <GameIcon name="potionRed" />, keybind: "4", charges: 2, chargesMax: 3 },
            { id: "s5", icon: <GameIcon name="lightning" />, keybind: "5", justCast: true },
            { id: "s6", keybind: "6", state: "locked" },
          ]}
        />
        <XpBar fraction={0.62} level={24} width={420} />
      </div>
      <div style={{ position: "absolute", bottom: 30, left: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <PickupToastStack
          entries={[
            { id: "p1", icon: <GameIcon name="gem" size={18} />, label: "Duskfire Opal", rarity: "epic" },
            { id: "p2", icon: <GameIcon name="ingot" size={18} />, label: "Iron Ingot", count: 4, rarity: "common" },
            { id: "p3", icon: <GameIcon name="bow" size={18} />, label: "Whisperwind Bow", rarity: "legendary" },
          ]}
        />
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <ResourceOrb fraction={0.72} tone="health" size={78} label="Life" />
          <ResourceOrb fraction={0.4} tone="mana" size={78} label="Focus" />
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 30, right: 20, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
        <CurrencyDisplay amount={12480} name="gold" />
        <AmmoCounter magazine={24} reserve={96} icon={<GameIcon name="arrow" size={20} color={theme.textDim} />} />
      </div>
      <div style={{ position: "absolute", top: 110, left: "50%", transform: "translateX(-50%)" }}>
        <AnnouncementBanner title="Wave 7" subtitle="Hold the beacon" tone="warning" />
      </div>
    </div>
  );
}

function ItemsScene() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        top: 40,
        display: "flex",
        flexWrap: "wrap",
        gap: 18,
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 18,
        overflow: "auto",
        pointerEvents: "auto",
      }}
    >
      <HudPanel title="Backpack" width={280}>
        <ItemGrid
          columns={5}
          slots={[
            { itemId: "sword", icon: <GameIcon name="sword" />, rarity: "rare" },
            { itemId: "potion", icon: <GameIcon name="potionRed" />, count: 5, rarity: "common" },
            { itemId: "bow", icon: <GameIcon name="bow" />, rarity: "legendary" },
            { itemId: "gem", icon: <GameIcon name="gem" />, count: 2, rarity: "epic" },
            { itemId: "meat", icon: <GameIcon name="meat" />, count: 12 },
            { itemId: "key", icon: <GameIcon name="key" />, rarity: "uncommon" },
            { itemId: "scroll", icon: <GameIcon name="scroll" />, count: 3 },
            { itemId: "helmet", icon: <GameIcon name="helmet" />, rarity: "rare" },
            { itemId: null },
            { itemId: "wood", icon: <GameIcon name="wood" />, count: 38 },
            { itemId: null },
            { itemId: "bomb", icon: <GameIcon name="bomb" />, count: 2, rarity: "uncommon" },
            { itemId: null },
            { itemId: null },
            { itemId: "tome", icon: <GameIcon name="tome" />, rarity: "epic" },
          ]}
        />
      </HudPanel>
      <HudPanel title="Equipment" width={320}>
        <EquipmentDoll
          width={290}
          height={300}
          slots={[
            { id: "head", label: "Head", icon: <GameIcon name="helmet" />, rarity: "rare", side: "left" },
            { id: "chest", label: "Chest", icon: <GameIcon name="chestplate" />, rarity: "epic", side: "left" },
            { id: "hands", label: "Hands", icon: <GameIcon name="gauntlet" />, side: "left" },
            { id: "main", label: "Main Hand", icon: <GameIcon name="sword" />, rarity: "legendary", side: "right" },
            { id: "off", label: "Off Hand", icon: <GameIcon name="shield" />, rarity: "uncommon", side: "right" },
            { id: "feet", label: "Feet", icon: <GameIcon name="boots" />, side: "right" },
            { id: "ring", label: "Ring", icon: <GameIcon name="ring" />, rarity: "rare", side: "bottom" },
            { id: "amulet", label: "Amulet", icon: <GameIcon name="amulet" />, rarity: "epic", side: "bottom" },
          ]}
        />
      </HudPanel>
      <LootCard
        name="Whisperwind Bow"
        rarity="legendary"
        typeLine="Two-Handed Bow"
        icon={<GameIcon name="bow" />}
        stats={["Damage 128–164", "Attack Speed 1.4", "Range 38m"]}
        affixes={["+18% projectile speed", "Shots pierce one target", "+42 Agility"]}
        flavor="Strung with the last breath of a storm."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <HotbarSelector
          selectedIndex={2}
          slots={[
            { id: "h1", icon: <GameIcon name="pickaxe" /> },
            { id: "h2", icon: <GameIcon name="torch" />, count: 14 },
            { id: "h3", icon: <GameIcon name="sword" /> },
            { id: "h4", icon: <GameIcon name="wood" />, count: 38 },
            { id: "h5", icon: <GameIcon name="stone" />, count: 51 },
            { id: "h6" },
            { id: "h7", icon: <GameIcon name="bread" />, count: 3 },
            { id: "h8" },
            { id: "h9" },
          ]}
        />
        <HeartRow current={3} max={5} size={22} />
      </div>
    </div>
  );
}

function MetersScene() {
  const gauge = useCycle(4200);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        top: 40,
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
        gap: 26,
        alignItems: "center",
        justifyItems: "center",
        padding: "30px 40px",
        overflow: "auto",
        pointerEvents: "auto",
      }}
    >
      <ScoreReadout value={128400} />
      <MatchTimer seconds={24} label="Round" />
      <TeamScoreBoard left={{ name: "Vanguard", score: 7 }} right={{ name: "Ravagers", score: 5 }} roundLabel="Round 13" />
      <WaveIndicator wave={7} totalWaves={12} remaining={14} />
      <AmmoCounter magazine={3} reserve={12} reloading />
      <RacePosition position={2} total={8} lap={2} laps={3} />
      <ArcGauge fraction={gauge} label="Velocity" readout={`${Math.round(gauge * 240)}`} />
      <CountdownPips value={3} />
      <ObjectiveChannel progress={0.64} label="Capturing Relay" contested owner="friendly" />
      <ChargeMeter fraction={1} ready label="Ultimate" width={200} />
      <CurrencyDisplay amount={1284000} compact name="credits" />
      <ScoreReadout value={999} digits={4} label="Combo" size="lg" />
    </div>
  );
}

function PanelsScene() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        top: 40,
        display: "flex",
        flexWrap: "wrap",
        gap: 18,
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 18,
        overflow: "auto",
        pointerEvents: "auto",
      }}
    >
      <VendorPanel
        listings={[
          { id: "v1", icon: <GameIcon name="sword" size={20} />, name: "Cinder Blade", rarity: "rare", price: 420 },
          { id: "v2", icon: <GameIcon name="potionRed" size={20} />, name: "Healing Draught", price: 35, stock: 8 },
          { id: "v3", icon: <GameIcon name="chestplate" size={20} />, name: "Bulwark Plate", rarity: "epic", price: 1650, affordable: false },
          { id: "v4", icon: <GameIcon name="scroll" size={20} />, name: "Town Portal", price: 60, stock: 3 },
        ]}
        balance={{ amount: 812 }}
      />
      <CraftingPanel
        recipes={[
          {
            id: "c1",
            icon: <GameIcon name="ingot" size={20} />,
            name: "Iron Ingot",
            craftable: true,
            inputs: [{ label: "Ore", have: 6, need: 3 }, { label: "Coal", have: 2, need: 1 }],
          },
          {
            id: "c2",
            icon: <GameIcon name="sword" size={20} />,
            name: "Iron Sword",
            craftable: false,
            inputs: [{ label: "Ingot", have: 1, need: 2 }, { label: "Wood", have: 9, need: 1 }],
            craftFraction: 0.45,
          },
        ]}
      />
      <RankList
        title="Season Ladder"
        entries={[
          { id: "r1", rank: 1, name: "Ashfang", value: 2841 },
          { id: "r2", rank: 2, name: "Kaelen", value: 2790, highlight: true },
          { id: "r3", rank: 3, name: "Rin", value: 2544 },
          { id: "r4", rank: 4, name: "Kira", value: 2101 },
        ]}
      />
      <CombatLogPanel
        lines={[
          { id: "l1", text: "You hit Gravemaw Stalker for 218.", tone: "damage" },
          { id: "l2", text: "Gravemaw Stalker hits you for 96.", tone: "damage" },
          { id: "l3", text: "Regrowth heals you for 364.", tone: "heal" },
          { id: "l4", text: "You gained 120 experience.", tone: "system" },
          { id: "l5", text: "Pyroclasm critically hits for 1042!", tone: "damage" },
        ]}
      />
      <DialoguePanel
        dialogue={{
          id: "bren",
          lines: [
            { speaker: "Bren", text: "The road past the beacon is crawling with gravemaws. You sure about this?" },
            {
              choices: [
                { label: "We'll manage. Open the gate.", invoke: { command: "demo.gate" } },
                {
                  label: "Convince him to lend his wagon",
                  invoke: null,
                  check: { label: "Persuade", modifier: 3, dc: 14 },
                },
              ],
            },
          ],
        }}
      />
      <HudPanel title="Settings" width={300}>
        <SettingsGroup title="Audio">
          <SliderRow label="Master" value={0.8} />
          <SliderRow label="Music" value={0.45} />
        </SettingsGroup>
        <div style={{ height: 12 }} />
        <SettingsGroup title="Gameplay">
          <ToggleRow label="Camera Shake" value />
          <ToggleRow label="Damage Numbers" value={false} />
        </SettingsGroup>
      </HudPanel>
    </div>
  );
}

type ScreenId = "title" | "pause" | "death" | "results" | "loading" | "scoreboard";

function ScreensScene() {
  const theme = useGameUiTheme();
  const [screen, setScreen] = useState<ScreenId>("title");
  const loading = useCycle(5200);
  const screens: readonly { id: ScreenId; label: string }[] = [
    { id: "title", label: "Title" },
    { id: "pause", label: "Pause" },
    { id: "death", label: "Death" },
    { id: "results", label: "Results" },
    { id: "loading", label: "Loading" },
    { id: "scoreboard", label: "Scoreboard" },
  ];
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {screen === "title" && (
        <TitleScreen
          title="Emberfall"
          subtitle="A JGengine Tale"
          version="v0.7.0"
          entries={[
            { id: "new", label: "New Game" },
            { id: "continue", label: "Continue" },
            { id: "settings", label: "Settings" },
            { id: "quit", label: "Quit", disabled: true },
          ]}
          selectedId="new"
        />
      )}
      {screen === "pause" && (
        <PauseScreen
          entries={[
            { id: "resume", label: "Resume", keybind: "Esc" },
            { id: "settings", label: "Settings" },
            { id: "quit", label: "Quit to Title" },
          ]}
          selectedId="resume"
        />
      )}
      {screen === "death" && (
        <DeathScreenView subtitle="Slain by Gravemaw Alpha" respawnKeybind="R" onRespawn={() => setScreen("title")} />
      )}
      {screen === "results" && (
        <ResultsScreen
          outcome="victory"
          lines={[
            { label: "Waves Cleared", value: 12 },
            { label: "Hostiles Slain", value: 148, accent: true },
            { label: "Damage Dealt", value: "86,420" },
            { label: "Time", value: "18:42" },
          ]}
          entries={[
            { id: "again", label: "Play Again", keybind: "R" },
            { id: "title", label: "Return to Title" },
          ]}
          selectedId="again"
        />
      )}
      {screen === "loading" && <LoadingScreen title="The Ashen Road" fraction={loading} tip="Gravemaws flinch at torchlight. Keep one lit." />}
      {screen === "scoreboard" && (
        <ScoreboardOverlay
          title="Match Standings"
          columns={[
            { key: "name", header: "Operative", align: "left" },
            { key: "kills", header: "K", align: "right" },
            { key: "deaths", header: "D", align: "right" },
            { key: "score", header: "Score", align: "right" },
          ]}
          rows={[
            { id: "p1", values: { name: "Ashfang", kills: 18, deaths: 4, score: 4210 }, teamColor: theme.friendly },
            { id: "p2", values: { name: "Kaelen", kills: 15, deaths: 6, score: 3890 }, highlight: true, teamColor: theme.friendly },
            { id: "p3", values: { name: "Rin", kills: 11, deaths: 7, score: 2950 }, teamColor: theme.hostile },
            { id: "p4", values: { name: "Kira", kills: 9, deaths: 12, score: 2310 }, teamColor: theme.hostile },
          ]}
        />
      )}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 4,
          pointerEvents: "auto",
          zIndex: 60,
        }}
      >
        {screens.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setScreen(entry.id)}
            style={{
              padding: "3px 10px",
              clipPath: "polygon(5px 0, 100% 0, calc(100% - 5px) 100%, 0 100%)",
              border: "none",
              cursor: "pointer",
              fontFamily: theme.fontDisplay,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              background: screen === entry.id ? theme.accent : "rgba(0,0,0,0.6)",
              color: screen === entry.id ? theme.surfaceDeep : theme.textDim,
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function IconsScene() {
  const theme = useGameUiTheme();
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        top: 40,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(76px, 1fr))",
        gap: 6,
        padding: 20,
        overflow: "auto",
        pointerEvents: "auto",
      }}
    >
      {GAME_ICON_NAMES.map((name) => (
        <div
          key={name}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 5,
            padding: "10px 2px",
          }}
        >
          <GameIcon name={name} size={30} color={theme.textPrimary} />
          <span
            style={{
              fontFamily: theme.fontNumeric,
              fontSize: 8.5,
              color: theme.textDim,
              textAlign: "center",
              wordBreak: "break-all",
            }}
          >
            {name}
          </span>
        </div>
      ))}
    </div>
  );
}

function initialParam<T extends string>(key: string, values: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const value = new URLSearchParams(window.location.search).get(key);
  return values.includes(value as T) ? (value as T) : fallback;
}

function UiKitUI() {
  const [tab, setTab] = useState<TabId>(() =>
    initialParam("tab", TABS.map((entry) => entry.id), "hud"),
  );
  const [themeIndex, setThemeIndex] = useState(() =>
    Math.max(0, THEMES.findIndex((entry) => entry.name === initialParam("kitTheme", THEMES.map((t) => t.name), "ember"))),
  );
  const theme = THEMES[themeIndex] ?? emberTheme;
  return (
    <GameUiThemeProvider theme={theme}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <DemoTabs active={tab} onSelect={setTab} themeIndex={themeIndex} onTheme={setThemeIndex} />
        {tab === "hud" && <HudScene />}
        {tab === "items" && <ItemsScene />}
        {tab === "meters" && <MetersScene />}
        {tab === "panels" && <PanelsScene />}
        {tab === "screens" && <ScreensScene />}
        {tab === "icons" && <IconsScene />}
      </div>
    </GameUiThemeProvider>
  );
}

export const uiKitGame: PlayableGame = {
  ...demoGame,
  GameUI: UiKitUI,
};
