export interface ChatFilterConfig {
  blockedWords: readonly string[];
  mode?: "mask" | "reject";
  mask?: string;
}

export interface ChatFilterResult {
  ok: boolean;
  body: string;
  matched: readonly string[];
}

export interface ChatFilter {
  apply(body: string): ChatFilterResult;
}

const LEET_SUBSTITUTIONS: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
  "!": "i",
};

const TOKEN_PATTERN = /[\p{L}\p{N}@$!]+/gu;

export function normalizeChatText(text: string): string {
  let normalized = "";
  for (const char of text.toLowerCase()) {
    normalized += LEET_SUBSTITUTIONS[char] ?? char;
  }
  return normalized;
}

export function createChatFilter(config: ChatFilterConfig): ChatFilter {
  const mode = config.mode ?? "mask";
  const mask = config.mask ?? "*";
  const blockedByNormalized = new Map<string, string>();
  for (const word of config.blockedWords) {
    blockedByNormalized.set(normalizeChatText(word), word);
  }

  return {
    apply(body) {
      if (blockedByNormalized.size === 0) return { ok: true, body, matched: [] };

      const hit = new Set<string>();
      let masked = "";
      let cursor = 0;

      for (const token of body.matchAll(TOKEN_PATTERN)) {
        const word = token[0];
        const start = token.index;
        const blockedWord = blockedByNormalized.get(normalizeChatText(word));
        if (blockedWord === undefined) continue;

        hit.add(blockedWord);
        if (mode === "reject") continue;

        masked += body.slice(cursor, start) + mask.repeat(word.length);
        cursor = start + word.length;
      }

      if (hit.size === 0) return { ok: true, body, matched: [] };
      const matched = [...new Set(config.blockedWords)].filter((word) => hit.has(word));
      if (mode === "reject") return { ok: false, body, matched };

      masked += body.slice(cursor);
      return { ok: true, body: masked, matched };
    },
  };
}
