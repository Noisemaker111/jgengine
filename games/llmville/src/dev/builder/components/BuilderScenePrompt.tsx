import { useRef } from "react";

import { BuilderIcon } from "@/dev/builder/components/builderIcons";
import { BUILDER_CSS } from "@/dev/builder/components/builderStyles";
import { BuilderStore, useBuilderState } from "@/dev/builder/builderStore";
import { cn } from "@/components/ui/cn";

const PROMPT_PLACEHOLDER = "generate a 3d item";

export function BuilderScenePrompt() {
  const state = useBuilderState();
  const { prompt, error } = state.aiDraft;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canGenerate =
    state.itemType === "asset" && state.editingScope === "isolated" && prompt.trim().length > 0;
  const isError = state.aiDraft.status === "error";

  return (
    <div className={BUILDER_CSS.scenePromptWrap}>
      <div className="relative w-full">
        <textarea
          ref={inputRef}
          rows={3}
          value={prompt}
          onChange={(event) => BuilderStore.setAiPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && canGenerate) {
              event.preventDefault();
              BuilderStore.generateAiAsset();
            }
          }}
          placeholder={PROMPT_PLACEHOLDER}
          className={cn(BUILDER_CSS.scenePromptField, isError && "border-[var(--destructive)]/60")}
          aria-label="Generate asset prompt"
        />
        <button
          type="button"
          disabled={!canGenerate}
          onClick={() => BuilderStore.generateAiAsset()}
          className={cn(
            BUILDER_CSS.scenePromptSend,
            "bg-transparent p-0 shadow-none hover:bg-transparent disabled:opacity-40",
          )}
          aria-label="Generate"
        >
          <BuilderIcon id="send" size="lg" className="h-8 w-8" />
        </button>
      </div>
      {isError && error ? (
        <p className="w-full rounded-md border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 px-2 py-1 text-center text-[10px] text-[#f0a097]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}