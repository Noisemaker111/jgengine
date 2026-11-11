/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect } from "@jgengine/core/ui/jsx";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";

import { useMainMenuAccountChipVm, type MainMenuAccountChipVm } from "../../auth";
import { MainMenuLayoutView } from "../../runtime/components/MainMenuLayout";
import { PlayEntryAction } from "../../runtime/components/PlayEntryAction";
import { useMainMenu, type MainMenuState } from "../../runtime/mainMenu";
import { applyStructuredData, DEFAULT_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "../../seo/siteSeo";
import { C, FULL, Heading, Label, Logo, Muted, Panel, Text } from "../../ui/kit";
import { ABOUT_LEDE, ABOUT_PLAY_STEPS, ABOUT_SECTIONS } from "../aboutContent";

const structuredData = {
  "@context": "https://schema.org",
  "@type": "VideoGame",
  name: SITE_NAME,
  description: DEFAULT_DESCRIPTION,
  url: `${SITE_URL}/about`,
  genre: "Simulation",
  gamePlatform: "Web browser",
  applicationCategory: "Game",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export function AboutScreenView({ account, menu }: { account: MainMenuAccountChipVm; menu: MainMenuState }) {
  const { width, height } = useRuneViewport();
  return <MainMenuLayoutView account={account} backTo="/">
    <Panel shell="terminal" width={Math.min(576, width - 32)} maxHeight={Math.min(height - 260, 640)} scroll gap={20} label="About LLMville">
      <RuneView gap={10} padding={[0, 0, 16, 0]}>
        <Logo size="sm" />
        <Heading size={30}>About LLMville</Heading>
        <Label size={12} color={C.teal} tracking={2.4}>{SITE_TAGLINE.toUpperCase()}</Label>
      </RuneView>
      <Text size={15} color={C.muted}>{ABOUT_LEDE}</Text>
      {ABOUT_SECTIONS.map((section) => <RuneView key={section.title} gap={6}>
        <Heading size={18}>{section.title}</Heading>
        <Text size={14} color={C.muted}>{section.body}</Text>
      </RuneView>)}
      <Panel shell="sticky" width={FULL}>
        <Heading size={18} color={C.paperInk}>How to play</Heading>
        {ABOUT_PLAY_STEPS.map((step, index) => <Text key={step} size={14} color={C.paperMuted}>{`${index + 1}. ${step}`}</Text>)}
        <PlayEntryAction menu={menu} label="Play LLMville" />
      </Panel>
      <Muted size={12} align="center" color={C.faint}>Play free at llmville.com</Muted>
    </Panel>
  </MainMenuLayoutView>;
}

export function AboutScreen() {
  useEffect(() => applyStructuredData("llmville-about-ld", structuredData), []);
  return <AboutScreenView account={useMainMenuAccountChipVm()} menu={useMainMenu()} />;
}
