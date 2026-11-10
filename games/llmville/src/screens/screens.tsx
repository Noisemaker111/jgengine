import { Suspense, lazy, useEffect, type ComponentType, type ReactNode } from "@jgengine/core/ui/jsx";
import { NoticeStack } from "@jgengine/core/notifications/notices.view";
import { UiKitRoot } from "@jgengine/core/ui/kit/uiKitRoot.view";

import { RouteLoadingScreen } from "../components/RouteLoadingScreen";
import { llmvilleKit } from "../kit/llmvilleKit";
import { UiLayer } from "../kit/uiLayer";
import { actionNotices } from "../runtime/actionFeedback";
import { GameRouteErrorBoundary } from "../runtime/components/GameRouteErrorBoundary";
import { loadGameSessionModule } from "../runtime/gameRoutePreload";
import {
  ABOUT_PAGE_DESCRIPTION,
  ABOUT_PAGE_TITLE,
  DEFAULT_PAGE_HEAD,
  DEFAULT_TITLE,
  HOME_PAGE_DESCRIPTION,
  applyPageHead,
  type PageHead,
} from "../seo/siteSeo";
import { parseHomeRouteSearch } from "../settings/settings";
import { loadAuthScreenModule } from "../user/authScreenPreload";
import { matchScreenPath, navigate, useScreenLocation, type ScreenLocation, type ScreenTarget } from "./screenRouter";

/** What a screen is handed: the params its path holds and the address's search values. */
export interface ScreenProps {
  params: Record<string, string>;
  search: Record<string, unknown>;
}

type ScreenModule = { default: ComponentType<ScreenProps> };

interface ScreenEntry {
  /** A path pattern; `$name` segments become params. */
  path: string;
  /** Loads the screen's code. Each is its own chunk, so the menu never downloads the 3D world. */
  load?: () => Promise<ScreenModule>;
  /** A path kept for old links: where it sends the player instead. */
  redirect?: (location: ScreenLocation) => ScreenTarget;
  head?: PageHead;
  /** The label on the loading screen while the screen's code arrives. */
  loading?: string;
  /** Wraps the dev workbench around its previews. */
  workbench?: boolean;
  /** The screen mounts a game shell, which draws its own UI layer. */
  ownsUiLayer?: boolean;
}

const HOME: ScreenTarget = { to: "/" };
const devOnly = (entry: ScreenEntry): ScreenEntry => (import.meta.env.DEV ? entry : { path: entry.path, redirect: () => HOME });

/** Every LLMville screen. A fixed path comes before the pattern that would also match it. */
const SCREENS: readonly ScreenEntry[] = [
  {
    path: "/",
    head: { title: DEFAULT_TITLE, description: HOME_PAGE_DESCRIPTION, path: "/" },
    load: () => import("../branding/components/LandingPage").then((module) => ({ default: module.LandingPage })),
  },
  {
    path: "/about",
    head: { title: ABOUT_PAGE_TITLE, description: ABOUT_PAGE_DESCRIPTION, path: "/about" },
    load: () => import("../branding/components/AboutScreen").then((module) => ({ default: module.AboutScreen })),
  },
  {
    path: "/login",
    loading: "Loading login",
    load: () => Promise.all([import("./authEntryScreen"), loadAuthScreenModule()]).then(([module]) => ({ default: module.LoginEntryScreen })),
  },
  {
    path: "/signup",
    loading: "Loading signup",
    load: () => Promise.all([import("./authEntryScreen"), loadAuthScreenModule()]).then(([module]) => ({ default: module.SignupEntryScreen })),
  },
  {
    path: "/dashboard",
    load: () => import("../runtime/components/DashboardScreen").then((module) => ({ default: module.DashboardScreen })),
  },
  { path: "/settings", redirect: () => ({ to: "/", search: { settings: true, tab: "general" } }) },
  { path: "/play", redirect: (location) => ({ to: "/", search: { ...parseHomeRouteSearch(location.search) } }) },
  { path: "/game/select-founder", redirect: () => ({ to: "/game/create" }) },
  { path: "/create-world/customize", redirect: () => ({ to: "/game/create" }) },
  {
    path: "/game/create",
    load: () => import("./gameCreateScreen").then((module) => ({ default: module.GameCreateScreen })),
  },
  {
    path: "/game/$gameId",
    loading: "Loading world",
    ownsUiLayer: true,
    load: () => Promise.all([import("./gameScreen"), loadGameSessionModule()]).then(([module]) => ({ default: module.GameScreen })),
  },
  {
    path: "/profile/$username",
    load: () =>
      import("../user/components/ProfileScreen").then(({ ProfileScreen }) => ({
        default: ({ params }: ScreenProps) => <ProfileScreen username={params["username"] ?? ""} />,
      })),
  },
  devOnly({ path: "/dev", workbench: true, load: () => import("./devScreens").then((module) => ({ default: module.DevIndexScreen })) }),
  devOnly({ path: "/dev/hud", workbench: true, load: () => import("../runtime/components/HudDevPreview").then((module) => ({ default: module.HudDevPreview })) }),
  devOnly({ path: "/dev/racks", workbench: true, load: () => import("./devRackGallery").then((module) => ({ default: module.DevRackGallery })) }),
  devOnly({ path: "/dev/bills", workbench: true, load: () => import("../economy/components/BillsDevPreview").then((module) => ({ default: module.BillsDevPreview })) }),
  devOnly({ path: "/dev/character", workbench: true, load: () => import("../user/components/CharacterDevPreview").then((module) => ({ default: module.CharacterDevPreview })) }),
  devOnly({ path: "/dev/tablet", redirect: () => ({ to: "/dev/hud" }) }),
];

const lazyScreens = new Map<ScreenEntry, ComponentType<ScreenProps>>();

function screenComponent(entry: ScreenEntry, load: () => Promise<ScreenModule>): ComponentType<ScreenProps> {
  let component = lazyScreens.get(entry);
  if (component === undefined) {
    component = lazy(load);
    lazyScreens.set(entry, component);
  }
  return component;
}

/** The screen an address opens: its entry and params, or null when no screen has that path. */
export function resolveScreen(pathname: string): { entry: ScreenEntry; params: Record<string, string> } | null {
  for (const entry of SCREENS) {
    const params = matchScreenPath(entry.path, pathname);
    if (params !== null) return { entry, params };
  }
  return null;
}

/** Download a screen's code ahead of the press that opens it. */
export function preloadScreen(path: string): void {
  void SCREENS.find((entry) => entry.path === path)?.load?.().catch(() => undefined);
}

const DevWorkbench = lazy(() => import("./devScreens").then((module) => ({ default: module.DevWorkbench })));

function ScreenFrame({ entry, children }: { entry: ScreenEntry; children: ReactNode }) {
  const framed = entry.workbench === true ? <DevWorkbench>{children}</DevWorkbench> : children;
  return entry.ownsUiLayer === true ? framed : <UiLayer>{framed}</UiLayer>;
}

function MissingScreen() {
  return (
    <UiLayer>
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a100e] px-6 text-center text-brand-cream">
        <p className="text-sm text-brand-cream/70">That page does not exist.</p>
        <button type="button" className="llm-btn px-4 py-3 text-sm" data-variant="primary" onClick={() => void navigate(HOME)}>
          Back to main menu
        </button>
      </div>
    </UiLayer>
  );
}

/** The screen on top of LLMville's stack, inside its kit, with its notices above it. */
export function Screens() {
  const location = useScreenLocation();
  const match = resolveScreen(location.pathname);
  const entry = match?.entry;
  const redirect = entry?.redirect;

  useEffect(() => {
    if (redirect !== undefined) void navigate({ ...redirect(location), replace: true });
  }, [redirect, location]);
  useEffect(() => {
    applyPageHead(entry?.head ?? DEFAULT_PAGE_HEAD);
  }, [entry]);

  const load = entry?.load;
  let screen: ReactNode;
  if (match === null || entry === undefined) {
    screen = <MissingScreen />;
  } else if (load === undefined) {
    screen = null;
  } else {
    const Screen = screenComponent(entry, load);
    const loading = <RouteLoadingScreen {...(entry.loading === undefined ? {} : { label: entry.loading })} />;
    screen = (
      <GameRouteErrorBoundary key={location.pathname}>
        <ScreenFrame entry={entry}>
          <Suspense fallback={loading}>
            <Screen params={match.params} search={location.search} />
          </Suspense>
        </ScreenFrame>
      </GameRouteErrorBoundary>
    );
  }

  return (
    <UiKitRoot kit={llmvilleKit}>
      {screen}
      {entry?.ownsUiLayer === true ? null : <NoticeStack feed={actionNotices} avoidHud={false} />}
    </UiKitRoot>
  );
}
