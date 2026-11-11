/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";

import { navigate } from "../../screens/screenRouter";
import { useMainMenuAccountChipVm, type MainMenuAccountChipVm } from "../../auth";
import { RouteLoadingScreen } from "../../components/RouteLoadingScreen";
import { MainMenuLayoutView } from "../../runtime/components/MainMenuLayout";
import { useMainMenu, type MainMenuState } from "../../runtime/mainMenu";
import { MAIN_MENU_KIND } from "../../runtime/mainMenuPhase";
import { MenuSettingsDialog } from "../../settings/components/MenuSettingsDialog";
import { Button, FULL, Logo, Muted, Panel, Text } from "../../ui/kit";
import { DISPLAY } from "../../ui/theme";

/** The title screen's menu: join or rejoin the world, delete the lab (confirmed), settings. */
export function HomeMainMenu({ menu }: { menu: MainMenuState }) {
  const { phase, confirmDeleteWorld, setConfirmDeleteWorld, isDeleting, isEnteringGame, startGame, continueGame, warmCreateRoute, warmContinueRoute, deleteCurrentWorld } = menu;
  const continuing = phase.kind === MAIN_MENU_KIND.continue;
  const warm = (inside: boolean) => { if (inside) (continuing ? warmContinueRoute : warmCreateRoute)(); };
  return <RuneView width={FULL} items="center" gap={24}>
    {isEnteringGame ? <RouteLoadingScreen label="Joining world" overlay /> : null}
    <RuneView items="center" gap={12}>
      <Logo stacked size="lg" />
      <Muted size={14} align="center" maxWidth={320}>Buy GPUs -&gt; Train LLM models -&gt; serve tokens in an open world with humans and agents.</Muted>
    </RuneView>
    <RuneView width={FULL} gap={8} label="Main menu">
      {confirmDeleteWorld ? <Panel shell="inset" border={{ width: 1, color: "#e8836b4d" }} fill="#e8836b0d" gap={8}>
        <Text family={DISPLAY} size={15} weight={800}>Delete your lab?</Text>
        <Muted size={12}>Your lab, racks, models, and progress will be erased. This cannot be undone.</Muted>
        <Button tone="primary" icon="trash" busy={isDeleting} busyLabel="Deleting…" onPress={() => void deleteCurrentWorld()}>Yes, delete my lab</Button>
        <Button tone="secondary" disabled={isDeleting} onPress={() => setConfirmDeleteWorld(false)}>Cancel</Button>
      </Panel> : phase.kind === MAIN_MENU_KIND.loading ? <Button tone="secondary" busy busyLabel="Loading…" /> : <>
        <Button tone="primary" icon="play" disabled={isDeleting} busy={isEnteringGame} busyLabel="Joining world…" onHover={warm}
          onPress={continuing ? continueGame : startGame}>{continuing ? "Rejoin world" : "Join world"}</Button>
        {continuing ? <Button tone="danger" icon="trash" disabled={isDeleting} onPress={() => setConfirmDeleteWorld(true)}>Delete lab</Button> : null}
        <Button tone="secondary" icon="settings" onPress={() => void navigate({ to: "/", search: { settings: true } })}>Settings</Button>
      </>}
    </RuneView>
  </RuneView>;
}

export function LandingPageView({ account, menu }: { account: MainMenuAccountChipVm; menu: MainMenuState }) {
  return <MainMenuLayoutView account={account} hideHeader overlay={<MenuSettingsDialog />}>
    <HomeMainMenu menu={menu} />
  </MainMenuLayoutView>;
}

export function LandingPage() {
  return <LandingPageView account={useMainMenuAccountChipVm()} menu={useMainMenu()} />;
}
