const title = "JGengine — The TypeScript Game Engine for AI Coding Agents";
const description =
  "Build complete browser games with a single prompt. JGengine is a pure-TypeScript game engine and skill system designed for Claude Code, Cursor, Codex, Copilot, and other AI coding agents.";

export default function Head() {
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta
        name="keywords"
        content="TypeScript game engine, AI coding agents, browser game engine, Claude Code, Cursor, Codex, Copilot, game development"
      />
      <link rel="canonical" href="https://jgengine.com/" />
      <meta name="theme-color" content="#080b10" />

      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://jgengine.com/" />
      <meta property="og:site_name" content="JGengine" />
      <meta property="og:title" content="Build Games With One Prompt — JGengine" />
      <meta
        property="og:description"
        content="A pure-TypeScript game engine built for AI coding agents. Scaffold, build, verify, and ship complete browser games using focused engine skills."
      />
      <meta property="og:image" content="https://jgengine.com/opengraph-image" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta
        property="og:image:alt"
        content="JGengine — Build games with one prompt"
      />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="Build Games With One Prompt — JGengine" />
      <meta
        name="twitter:description"
        content="A pure-TypeScript game engine built for AI coding agents."
      />
      <meta name="twitter:image" content="https://jgengine.com/opengraph-image" />
      <meta
        name="twitter:image:alt"
        content="JGengine — Build games with one prompt"
      />
    </>
  );
}
