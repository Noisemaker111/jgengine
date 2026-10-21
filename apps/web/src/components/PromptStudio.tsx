import { useState } from "react";

import { CopyButton } from "./Copy";

const IDEAS = [
  {
    label: "Explore",
    idea: "is a co-op adventure across floating islands, with gliders and hidden ruins",
  },
  {
    label: "Build",
    idea: "lets me build a cozy harbor town with trade routes and changing seasons",
  },
  {
    label: "Survive",
    idea: "is a night-time survival game where every sound attracts the creatures",
  },
  {
    label: "Race",
    idea: "is a neon drift racer with winding streets and a rival crew",
  },
];

export function PromptStudio() {
  const [idea, setIdea] = useState(IDEAS[0]!.idea);
  const prompt = `Make a game that ${idea.trim()} with jgengine`;
  return (
    <div className="prompt-studio">
      <div className="prompt-studio-top">
        <span className="micro-label">YOUR NEXT GAME / BRIEF 001</span>
        <span aria-hidden>↗</span>
      </div>
      <label htmlFor="game-idea" className="prompt-intro">
        Make a game that
      </label>
      <textarea
        id="game-idea"
        value={idea}
        onChange={(event) => setIdea(event.target.value)}
        maxLength={1200}
        rows={3}
        spellCheck={false}
      />
      <p className="prompt-outro">
        with <strong>jgengine.</strong>
      </p>
      <div
        className="prompt-ideas"
        role="group"
        aria-label="Example game ideas"
      >
        <span>TRY AN IDEA</span>
        {IDEAS.map((item) => (
          <button
            type="button"
            key={item.label}
            aria-pressed={idea === item.idea}
            onClick={() => setIdea(item.idea)}
          >
            {item.label} <span aria-hidden>↗</span>
          </button>
        ))}
      </div>
      <div className="prompt-studio-bottom">
        <p>
          Edit the idea. Copy it.
          <br />
          Paste into your favorite coding agent.
        </p>
        {idea.trim() ? (
          <CopyButton
            value={prompt}
            label="Copy your prompt"
            variant="solid"
            className="prompt-copy"
          />
        ) : (
          <span role="status" className="text-sm text-muted">
            Add your game idea above.
          </span>
        )}
      </div>
    </div>
  );
}
