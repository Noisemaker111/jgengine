export type GameErrorKind = "connection" | "bootstrap" | "runtime" | "chunk";

export interface GameErrorReportInput {
  message: string;
  kind?: GameErrorKind;
  stack?: string | null;
  componentStack?: string | null;
  url?: string;
  pathname?: string;
  userAgent?: string;
  timestamp?: string;
}

export function gameErrorPanelLabel(kind: GameErrorKind = "runtime"): string {
  switch (kind) {
    case "connection":
    case "bootstrap":
      return "Connection error";
    case "chunk":
      return "Update required";
    default:
      return "Something went wrong";
  }
}

export function buildGameErrorReportInput(
  message: string,
  options: Partial<Omit<GameErrorReportInput, "message">> = {},
): GameErrorReportInput {
  return {
    message,
    kind: options.kind ?? "runtime",
    stack: options.stack ?? null,
    componentStack: options.componentStack ?? null,
    url: options.url ?? (typeof window !== "undefined" ? window.location.href : undefined),
    pathname: options.pathname ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
    userAgent: options.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : undefined),
    timestamp: options.timestamp ?? new Date().toISOString(),
  };
}

const REACT_FRAMEWORK_COMPONENTS = new Set([
  "Suspense",
  "SafeFragment",
  "MatchImpl",
  "MatchInnerImpl",
  "OutletImpl",
  "CatchBoundary",
  "CatchBoundaryImpl",
  "Matches",
  "MatchesInner",
  "RouterProvider",
  "RouterContextProvider",
  "WrapComponent",
  "ConvexProvider",
  "ConvexProviderWithAuth",
  "ConvexBetterAuthProvider",
  "AuthProvider",
  "V",
  "J",
  "RootComponent",
]);

/** Maps dev-server or Vite @fs URLs to repo-relative paths, keeping :line when present. */
function formatStackLocation(location: string): string {
  const stripped = location.replace(/\?t=\d+/, "");

  const repoPatterns: Array<{ pattern: RegExp; prefix?: string }> = [
    { pattern: /(?:ai-lab-game[/\\])((?:packages|apps)[/\\].+?)(?::(\d+))?(?::\d+)?$/i },
    { pattern: /\/src\/(.+?)(?::(\d+))?(?::\d+)?$/, prefix: "llmville/src/" },
    { pattern: /((?:packages|apps)[/\\].+?)(?::(\d+))?(?::\d+)?$/ },
  ];

  for (const { pattern, prefix } of repoPatterns) {
    const match = stripped.match(pattern);
    if (!match) continue;
    const path = (prefix ?? "") + match[1].replace(/\\/g, "/");
    return match[2] ? `${path}:${match[2]}` : path;
  }

  return stripped;
}

function isAppStackLocation(location: string): boolean {
  const normalized = formatStackLocation(location);
  return normalized.includes("packages/") || normalized.includes("llmville/src/");
}

/** Keeps app-owned stack frames; drops node_modules and React internals. */
function condenseStackTrace(stack: string, maxFrames = 8): string[] {
  const frames: string[] = [];

  for (const rawLine of stack.split("\n")) {
    const trimmed = rawLine.trim();
    const named = trimmed.match(/^at\s+(.+?)\s+\((.+)\)$/);
    const anonymous = trimmed.match(/^at\s+(\S.+)$/);

    let fn: string;
    let loc: string;
    if (named) {
      fn = named[1].replace(/^Object\./, "");
      loc = named[2];
    } else if (anonymous && (anonymous[1].includes("/") || anonymous[1].includes("\\"))) {
      fn = "(anonymous)";
      loc = anonymous[1];
    } else {
      continue;
    }

    if (!isAppStackLocation(loc)) continue;

    frames.push(`  at ${fn} (${formatStackLocation(loc)})`);
    if (frames.length >= maxFrames) break;
  }

  return frames;
}

/** Keeps mounted app components; drops router/provider boilerplate. */
function condenseComponentStack(componentStack: string, maxFrames = 4): string[] {
  const frames: string[] = [];

  for (const rawLine of componentStack.split("\n")) {
    const trimmed = rawLine.trim();
    const match = trimmed.match(/^at\s+(\w+)\s+\((.+)\)$/);
    if (!match) continue;

    const [, name, loc] = match;
    if (REACT_FRAMEWORK_COMPONENTS.has(name)) continue;
    if (!loc.includes("/src/")) continue;

    const normalized = formatStackLocation(loc);
    if (!normalized.startsWith("llmville/src/")) continue;

    frames.push(`  ${name} (${normalized})`);
    if (frames.length >= maxFrames) break;
  }

  return frames;
}

const KIND_LABEL: Record<GameErrorKind, string> = {
  connection: "connection error",
  bootstrap: "bootstrap error",
  runtime: "runtime crash",
  chunk: "stale chunk / failed dynamic import",
};

/** Formats a paste-ready prompt for an AI coding agent. */
export function formatGameErrorAgentPrompt(input: GameErrorReportInput): string {
  const kind = input.kind ?? "runtime";
  const lines = [`Fix LLMville ${KIND_LABEL[kind]}: ${input.message}`];

  if (input.pathname) {
    lines.push(`Route: ${input.pathname}`);
  }

  if (input.stack) {
    const frames = condenseStackTrace(input.stack);
    if (frames.length > 0) {
      lines.push("", "Stack:", ...frames);
    }
  }

  if (input.componentStack) {
    const frames = condenseComponentStack(input.componentStack);
    if (frames.length > 0) {
      lines.push("", "React:", ...frames);
    }
  }

  return lines.join("\n");
}

export function serializeGameErrorReportPayload(input: GameErrorReportInput) {
  return {
    message: input.message,
    kind: input.kind,
    stack: input.stack ?? undefined,
    componentStack: input.componentStack ?? undefined,
    url: input.url,
    pathname: input.pathname,
    userAgent: input.userAgent,
    agentPrompt: formatGameErrorAgentPrompt(input),
  };
}
