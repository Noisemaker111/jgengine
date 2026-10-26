import { useState } from "react";

import { CopyButton } from "./Copy";

const IDEAS = [
  { label: "Explore", idea: "is a co-op adventure across floating islands, with gliders and hidden ruins" },
  { label: "Build", idea: "lets me build a harbor town with trade routes and changing seasons" },
  { label: "Survive", idea: "is a night-time survival game where every sound draws the creatures in" },
  { label: "Race", idea: "is a drift racer through a generated city with a rival crew" },
];

/** Edit a one-line game idea and copy it as the prompt to give a coding agent. */
export function PromptStudio() {
  const [idea, setIdea] = useState(IDEAS[0]!.idea);
  const prompt = `Make a game that ${idea.trim()} with jgengine`;
  return (
    <div className="prompt-card gizmo">
      <div className="prompt-bar">
        <span>prompt for your agent</span>
        <span aria-hidden>›_</span>
      </div>
      <div className="prompt-body">
        <label htmlFor="game-idea" className="prompt-fixed">
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
        <p className="prompt-fixed">
          with <strong>jgengine</strong>
        </p>
      </div>
      <div className="prompt-ideas" role="group" aria-label="Example game ideas">
        {IDEAS.map((item) => (
          <button type="button" key={item.label} aria-pressed={idea === item.idea} onClick={() => setIdea(item.idea)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="prompt-foot">
        <p>Edit the idea, copy it, paste it into your agent.</p>
        {idea.trim() ? (
          <CopyButton value={prompt} label="Copy prompt" variant="solid" className="py-2" />
        ) : (
          <span role="status" className="text-sm text-muted">
            Add your idea above.
          </span>
        )}
      </div>
    </div>
  );
}
