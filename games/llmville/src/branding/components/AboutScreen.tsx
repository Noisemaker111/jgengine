import { Play } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Panel } from "@/components/ui/panel";
import {
  ABOUT_LEDE,
  ABOUT_PLAY_STEPS,
  ABOUT_SECTIONS,
} from "@/branding/aboutContent";
import { BrandLogo } from "@/branding/components/BrandLogo";
import { MainMenuLayout } from "@/runtime/components/MainMenuLayout";
import { PlayEntryAction } from "@/runtime/components/PlayEntryAction";
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/seo/siteSeo";

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
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export function AboutScreen() {
  return (
    <MainMenuLayout backTo="/">
      <Panel variant="blueprint" as="article" className="max-h-[min(70vh,640px)] overflow-y-auto px-6 py-7 sm:max-w-xl sm:px-8">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />

        <header className="mb-6 border-b border-[var(--surface-border)] pb-6">
          <BrandLogo variant="inline" size="sm" showTagline={false} />
          <h1 className="mt-4 font-game text-3xl font-extrabold text-brand-cream">About LLMville</h1>
          <p className="mt-2 font-game text-sm font-bold tracking-[0.2em] text-brand-teal uppercase">
            {SITE_TAGLINE}
          </p>
        </header>

        <p className="font-sans text-sm leading-relaxed text-brand-cream/75 md:text-base">{ABOUT_LEDE}</p>

        <div className="mt-8 space-y-6">
          {ABOUT_SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="font-game text-lg font-bold text-brand-cream">{section.title}</h2>
              <p className="mt-2 font-sans text-sm leading-relaxed text-brand-cream/70">{section.body}</p>
            </section>
          ))}
        </div>

        <Card variant="sticky-note" decoration="tape" className="mt-8 px-5 py-5">
          <h2 className="font-game text-lg font-bold text-[#2d2416]">How to play</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 font-sans text-sm text-[#4a3f32]">
            {ABOUT_PLAY_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <PlayEntryAction className="game-button game-button-primary mt-5 inline-flex w-full justify-center gap-2 py-3 text-sm">
            <Play className="h-4 w-4" aria-hidden />
            <span>Play LLMville</span>
          </PlayEntryAction>
        </Card>

        <footer className="mt-8 border-t border-brand-teal/15 pt-5 text-center text-xs text-brand-cream/40">
          <p>
            Play free at{" "}
            <a href={SITE_URL} className="text-brand-teal hover:text-brand-cream">
              llmville.com
            </a>
          </p>
        </footer>
      </Panel>
    </MainMenuLayout>
  );
}
