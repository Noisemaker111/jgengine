/** @jsxImportSource @jgengine/core/ui/jsx */
/**
 * LLMville's native screens, headless, as native specs (no browser). Each state renders the real view component the
 * screen draws, handed deterministic stand-ins for the account, backend and world (no Convex, no page).
 * usage: bun games/llmville/proofs/runeUiFixture.tsx <state> <out.json> [width height]
 */
import { writeFile } from "node:fs/promises";
import type { ReactNode } from "@jgengine/core/ui/jsx";
import { Root } from "@jgengine/core/ui/jsx/reconciler";
import { RuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { RuneNode, nativeSpec, nativeTreeHost, type RuneTreeSink } from "@jgengine/core/ui/rune/nativeTree";
import { createNotificationCenter } from "@jgengine/core/notifications/notificationCenter";

import { MAIN_MENU_ACCOUNT_CHIP_KIND, type MainMenuAccountChipVm } from "../src/auth";
import { LandingPageView } from "../src/branding/components/LandingPage";
import { AboutScreenView } from "../src/branding/components/AboutScreen";
import { AuthScreenView, type AuthFormVm, type AuthScreenMode } from "../src/user/components/AuthScreen";
import { ProfileScreenView, type ProfileVm } from "../src/user/components/ProfileScreen";
import { RouteLoadingScreen } from "../src/components/RouteLoadingScreen";
import { GameErrorScreenView } from "../src/runtime/components/GameConnectionErrorScreen";
import { DashboardScreenView } from "../src/runtime/components/DashboardScreen";
import { GameCreateView } from "../src/screens/gameCreateScreen";
import { GameHud } from "../src/runtime/components/GameOverlay";
import { WorldChatView } from "../src/chat/components/WorldChat";
import { BankruptScreen } from "../src/economy/components/BankruptScreen";
import { WORLD_CHAT_PREVIEW_MESSAGES } from "../src/chat/worldChatPreviewFixtures";
import type { MainMenuState } from "../src/runtime/mainMenu";
import { MAIN_MENU_KIND, type MainMenuPhase } from "../src/runtime/mainMenuPhase";
import { screenRouter, memoryAddress } from "../src/screens/screenRouter";
import { TabletNavProvider } from "../src/tablet/components/tabletNav";
import { createTabletPreviewBuild, createTabletPreviewTutorial, createTabletPreviewWorld, usePreviewTabletNav } from "../src/tablet/tabletPreviewFixtures";
import { LlmRoot } from "../src/ui/kit";
import { STARTER_RACK_CATALOG_ID } from "@llmville/game/infrastructure/catalog";

export const STATES = [
  "landing", "landing-continue", "landing-delete", "settings", "settings-keybinds", "about", "login", "signup",
  "loading", "error", "dashboard", "profile", "profile-edit", "create-error", "hud", "hud-chat", "hud-placing", "bankrupt",
] as const;
export type NativeFixture = (typeof STATES)[number];

const noop = () => undefined;
const signedOut: MainMenuAccountChipVm = { kind: MAIN_MENU_ACCOUNT_CHIP_KIND.signedOut };
const signedIn: MainMenuAccountChipVm = { kind: MAIN_MENU_ACCOUNT_CHIP_KIND.profileLink, username: "ada", displayLine: "Ada's Lab" };

function menu(phase: MainMenuPhase, confirmDeleteWorld = false): MainMenuState {
  return { phase, confirmDeleteWorld, setConfirmDeleteWorld: noop, isDeleting: false, isEnteringGame: false, startGame: noop, continueGame: noop, warmCreateRoute: noop, warmContinueRoute: noop, deleteCurrentWorld: async () => undefined };
}
const continuing = menu({ kind: MAIN_MENU_KIND.continue, gameId: "game-1" } as MainMenuPhase); // type-escape: the fixture's game id is not a Convex id

function authForm(mode: AuthScreenMode): AuthFormVm {
  return {
    email: mode === "sign-in" ? "ada@example.com" : "new@example", setEmail: noop, password: mode === "sign-in" ? "hunter2hunter2" : "short", setPassword: noop,
    error: mode === "sign-in" ? "Invalid email or password" : null, isLoading: false, isGoogleLoading: false, isGuestLoading: false, submit: noop, google: noop, guest: noop,
  };
}

function profile(editing: boolean): ProfileVm {
  return {
    isLoading: false, isOwnProfile: true, isEditing: editing, setIsEditing: noop, username: editing ? "ada-lovelace" : "ada", setUsername: noop,
    saving: false, error: null, setUsernameCheck: noop, usernameTaken: editing, checkingUsername: false, handleSave: async () => undefined,
    handleCancel: noop, logout: async () => undefined, disableSave: editing, usernameCheck: "",
    publicProfile: { username: "ada", avatarId: "mentor-1", lab: { name: "Ada's Garage Lab", cash: 128400, dataTokens: 2_450_000, modelsServing: 2, modelsTrained: 5, topBenchmark: 71.4 } },
  } as unknown as ProfileVm; // type-escape: a stand-in for the Convex profile query's result
}

/** The play HUD over the tablet fixtures' world, with a tweet, a diagnostic and a prompt in view. */
function Hud({ chatOpen, placing }: { chatOpen: boolean; placing: boolean }) {
  const nav = usePreviewTabletNav({ initialOpen: false });
  const base = createTabletPreviewWorld();
  const rack = { id: "rack-1", rackType: STARTER_RACK_CATALOG_ID, x: 0, y: 0, z: 0, rotationY: 0, createdAt: 0, installedHardwareModuleIds: [] };
  const world = { ...base, racks: [rack], interactionHint: { key: "E", action: "Configure rack" }, interactionTarget: { type: "rack", id: rack.id } } as unknown as typeof base; // type-escape: a fixture rack with a prompt over it
  const build = placing ? { ...createTabletPreviewBuild(), buildPlacementModeActive: true, placementFacingLabel: "North", placementClaimHint: { cells: [{ key: "a", x: 0, z: 0, status: "owned" as const }, { key: "b", x: 1, z: 0, status: "claimable" as const }], cost: 2500, affordable: true } } : createTabletPreviewBuild();
  const tweet = createNotificationCenter().push({ id: "tweet-1", kind: "tweet", title: "Hacker Gazette", body: "A garage lab just shipped a 7B model that beats last year's frontier on coding evals." });
  return <TabletNavProvider value={nav.nav}>
    <GameHud world={world} build={build} rackHardware={undefined as never} tutorial={createTabletPreviewTutorial()} isTouch={false}
      project={() => ({ x: 0, y: 0, visible: true })}
      tweet={chatOpen || placing ? null : tweet} dismissTweet={noop}
      diagnostics={placing ? [] : [{ key: "rack-a", label: "Rack model missing", modelPath: "models/rack_a100.glb", message: "rack_a100.glb failed to load; drawing a placeholder." }]}
      goalSelection={{ id: null, select: noop }} chatOpen={chatOpen}
      chat={<WorldChatView vm={{ messages: WORLD_CHAT_PREVIEW_MESSAGES, playerId: "player-1", open: chatOpen, draft: chatOpen ? "anyone selling H100s?" : "", setDraft: noop, sending: false, error: null, send: noop, openChat: noop, close: noop }} />} />
  </TabletNavProvider>;
}

function screen(state: NativeFixture): ReactNode {
  switch (state) {
    case "landing": return <LandingPageView account={signedOut} menu={menu({ kind: MAIN_MENU_KIND.new })} />;
    case "landing-continue": return <LandingPageView account={signedIn} menu={continuing} />;
    case "landing-delete": return <LandingPageView account={signedIn} menu={menu({ kind: MAIN_MENU_KIND.continue, gameId: "game-1" } as MainMenuPhase, true)} />; // type-escape: fixture game id
    case "settings": case "settings-keybinds": return <LandingPageView account={signedOut} menu={menu({ kind: MAIN_MENU_KIND.new })} />;
    case "about": return <AboutScreenView account={signedIn} menu={continuing} />;
    case "login": return <AuthScreenView mode="sign-in" form={authForm("sign-in")} />;
    case "signup": return <AuthScreenView mode="sign-up" form={authForm("sign-up")} />;
    case "loading": return <RouteLoadingScreen label="Loading world" detail="Streaming racks near you" progress={0.42} />;
    case "error": return <GameErrorScreenView vm={{ panelLabel: "Connection lost", message: "The world server stopped answering. Your lab is saved; retry to rejoin.", dev: false, copyState: "idle", sendState: "idle", copy: noop, send: noop, retry: noop, home: noop }} />;
    case "dashboard": return <DashboardScreenView vm={{ phase: "signed_in", displayName: "Ada", email: "ada@example.com", username: "ada", logout: noop }} />;
    case "profile": return <ProfileScreenView account={signedIn} usernameParam="ada" vm={profile(false)} />;
    case "profile-edit": return <ProfileScreenView account={signedIn} usernameParam="ada" vm={profile(true)} />;
    case "create-error": return <GameCreateView phase="bootstrapping" error="Could not create your lab: the name service is busy." retry={noop} />;
    case "hud": return <Hud chatOpen={false} placing={false} />;
    case "hud-chat": return <Hud chatOpen placing={false} />;
    case "hud-placing": return <Hud chatOpen={false} placing />;
    case "bankrupt": return <BankruptScreen isDismissing={false} onDismiss={noop} />;
  }
}

/** The native spec of one state at one size, sampled once (no live slots). */
export async function runeUiFixture(state: NativeFixture, width = 1280, height = 720) {
  const memory = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => memory.get(key) ?? null, removeItem: (key: string) => { memory.delete(key); }, setItem: (key: string, value: string) => { memory.set(key, value); },
    key: (index: number) => [...memory.keys()][index] ?? null, get length() { return memory.size; },
  } });
  const uninstall = screenRouter.install(memoryAddress(state === "settings" ? "/?settings=true" : state === "settings-keybinds" ? "/?settings=true&tab=keybinds" : "/"));
  try {
    const container = new RuneNode("container");
    const tree = new Root(nativeTreeHost(() => {}), container, "fixture", false);
    // The HUD's prompt projects to a fixed point a little above the screen centre.
    const project = state.startsWith("hud") ? () => ({ x: width / 2, y: height * 0.42, visible: true }) : undefined;
    tree.render(<RuneViewport width={width} height={height}><LlmRoot project={project}>{screen(state)}</LlmRoot></RuneViewport>);
    const surface = container.children[0];
    if (surface?.tag !== "rune-surface") throw new Error("LLMville did not mount a native surface");
    const unused = () => { throw new Error("headless sampling must not bind slots"); };
    const sink: RuneTreeSink = { setSpec: unused, bindNumber: unused, writeNumber: unused, bindText: unused };
    const spec = nativeSpec(surface, sink, true);
    tree.unmount();
    return spec;
  } finally {
    uninstall();
    if (original === undefined) Reflect.deleteProperty(globalThis, "localStorage");
    else Object.defineProperty(globalThis, "localStorage", original);
  }
}

if (import.meta.main) {
  const state = process.argv[2], output = process.argv[3];
  if (state === undefined || output === undefined) throw new Error("usage: bun games/llmville/proofs/runeUiFixture.tsx <state> <out.json> [width height]");
  if (!(STATES as readonly string[]).includes(state)) throw new Error(`Unknown LLMville UI state: ${state}`);
  const spec = await runeUiFixture(state as NativeFixture, Number(process.argv[4] ?? 1280), Number(process.argv[5] ?? 720)); // type-escape: state was checked against STATES above
  await writeFile(output, JSON.stringify(spec));
  process.exit(0);
}
