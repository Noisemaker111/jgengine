export const GAME_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export interface GameCredit {
  text: string;
  url?: string;
  handle?: string;
}

export interface GameCaptureSettings {
  play: string[];
  settleMs?: number;
  stateNames: string[];
}

export interface GameSettings {
  id: string;
  displayName: string;
  capture: GameCaptureSettings;
  credit: GameCredit | null;
}

export interface GameSettingsPatch {
  displayName?: string;
  capturePlay?: string[];
  captureSettleMs?: number | null;
  credit?: GameCredit | null;
}

const NAME_RE = /name:\s*(["'`])([^"'`]+)\1/;
const CAPTURE_PLAY_RE = /capture\s*:\s*\{[\s\S]*?play\s*:\s*(\[[\s\S]*?\])/;
const CAPTURE_SETTLE_RE = /capture\s*:\s*\{[\s\S]*?settleMs\s*:\s*(\d+)/;
const CAPTURE_STATES_RE = /capture\s*:\s*\{[\s\S]*?states\s*:\s*\{([^}]*)\}/;
const CREDIT_EXPORT_RE =
  /export\s+const\s+credit\s*=\s*(\{[\s\S]*?\n\}|\{[^}]*\}|["'`][^"'`]+["'`])\s*;?/;
const PKG_CREDIT_TEXT = /"credit"\s*:\s*"((?:\\.|[^"\\])*)"/;
const PKG_CREDIT_URL = /"url"\s*:\s*"((?:\\.|[^"\\])*)"/;
const PKG_CREDIT_HANDLE = /"handle"\s*:\s*"((?:\\.|[^"\\])*)"/;

function unescapeJsonString(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function parseStringArrayLiteral(source: string): string[] {
  const items: string[] = [];
  const re = /["'`]([^"'`]+)["'`]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const value = match[1];
    if (value !== undefined && value.length > 0) items.push(value);
  }
  return items;
}

function parseStateNames(statesBody: string): string[] {
  const names: string[] = [];
  const re = /["'`]?([a-zA-Z_][\w-]*)["'`]?\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(statesBody)) !== null) {
    const name = match[1];
    if (name !== undefined) names.push(name);
  }
  return names;
}

function parseCreditExport(raw: string): GameCredit | null {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith("`") && trimmed.endsWith("`"))
  ) {
    const text = trimmed.slice(1, -1).trim();
    return text.length > 0 ? { text } : null;
  }
  if (!trimmed.startsWith("{")) return null;
  const textMatch = trimmed.match(/(?:text|label|name)\s*:\s*["'`]([^"'`]+)["'`]/);
  const urlMatch = trimmed.match(/url\s*:\s*["'`]([^"'`]+)["'`]/);
  const handleMatch = trimmed.match(/handle\s*:\s*["'`]([^"'`]+)["'`]/);
  const text = textMatch?.[1]?.trim() ?? "";
  if (text.length === 0) return null;
  return {
    text,
    ...(urlMatch?.[1] !== undefined ? { url: urlMatch[1] } : {}),
    ...(handleMatch?.[1] !== undefined ? { handle: handleMatch[1] } : {}),
  };
}

export function parseDisplayName(configSource: string, fallbackId: string): string {
  const match = configSource.match(NAME_RE);
  return match?.[2]?.trim() || fallbackId;
}

export function parseCaptureSettings(configSource: string): GameCaptureSettings {
  const playMatch = configSource.match(CAPTURE_PLAY_RE);
  const settleMatch = configSource.match(CAPTURE_SETTLE_RE);
  const statesMatch = configSource.match(CAPTURE_STATES_RE);
  const play = playMatch?.[1] !== undefined ? parseStringArrayLiteral(playMatch[1]) : [];
  const settleRaw = settleMatch?.[1];
  const settleMs = settleRaw !== undefined ? Number(settleRaw) : undefined;
  return {
    play,
    ...(settleMs !== undefined && Number.isFinite(settleMs) ? { settleMs } : {}),
    stateNames: statesMatch?.[1] !== undefined ? parseStateNames(statesMatch[1]) : [],
  };
}

export function parseCreditFromConfig(configSource: string): GameCredit | null {
  const match = configSource.match(CREDIT_EXPORT_RE);
  if (match?.[1] === undefined) return null;
  return parseCreditExport(match[1]);
}

export function parseCreditFromPackageJson(packageSource: string): GameCredit | null {
  const jgIndex = packageSource.indexOf('"jgengine"');
  if (jgIndex === -1) return null;
  const slice = packageSource.slice(jgIndex, jgIndex + 800);
  const textMatch = slice.match(PKG_CREDIT_TEXT);
  if (textMatch?.[1] === undefined) return null;
  const text = unescapeJsonString(textMatch[1]).trim();
  if (text.length === 0) return null;
  const urlMatch = slice.match(PKG_CREDIT_URL);
  const handleMatch = slice.match(PKG_CREDIT_HANDLE);
  return {
    text,
    ...(urlMatch?.[1] !== undefined ? { url: unescapeJsonString(urlMatch[1]) } : {}),
    ...(handleMatch?.[1] !== undefined ? { handle: unescapeJsonString(handleMatch[1]) } : {}),
  };
}

export function resolveGameSettings(input: {
  id: string;
  configSource: string | null;
  packageSource: string | null;
}): GameSettings {
  const displayName =
    input.configSource !== null
      ? parseDisplayName(input.configSource, input.id)
      : input.id;
  const capture =
    input.configSource !== null
      ? parseCaptureSettings(input.configSource)
      : { play: [], stateNames: [] };
  const creditFromConfig =
    input.configSource !== null ? parseCreditFromConfig(input.configSource) : null;
  const creditFromPkg =
    input.packageSource !== null ? parseCreditFromPackageJson(input.packageSource) : null;
  return {
    id: input.id,
    displayName,
    capture,
    credit: creditFromConfig ?? creditFromPkg,
  };
}

function formatPlayArray(play: readonly string[]): string {
  if (play.length === 0) return "[]";
  return `[${play.map((entry) => JSON.stringify(entry)).join(", ")}]`;
}

function formatCreditExport(credit: GameCredit): string {
  if (credit.url === undefined && credit.handle === undefined) {
    return `export const credit = ${JSON.stringify(credit.text)};\n`;
  }
  const fields = [`text: ${JSON.stringify(credit.text)}`];
  if (credit.url !== undefined) fields.push(`url: ${JSON.stringify(credit.url)}`);
  if (credit.handle !== undefined) fields.push(`handle: ${JSON.stringify(credit.handle)}`);
  return `export const credit = { ${fields.join(", ")} };\n`;
}

export function patchDisplayName(configSource: string, displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) throw new Error("display name must not be empty");
  if (NAME_RE.test(configSource)) {
    return configSource.replace(NAME_RE, `name: ${JSON.stringify(trimmed)}`);
  }
  const defineIdx = configSource.search(/defineGame\s*\(\s*\{/);
  if (defineIdx === -1) {
    throw new Error("game.config.ts: could not find defineGame({ ... }) to insert name");
  }
  const brace = configSource.indexOf("{", defineIdx);
  return `${configSource.slice(0, brace + 1)}\n  name: ${JSON.stringify(trimmed)},${configSource.slice(brace + 1)}`;
}

export function patchCapturePlay(configSource: string, play: readonly string[]): string {
  if (/capture\s*:\s*\{/.test(configSource)) {
    if (/play\s*:\s*\[/.test(configSource)) {
      return configSource.replace(
        /(capture\s*:\s*\{[\s\S]*?play\s*:\s*)\[[\s\S]*?\]/,
        `$1${formatPlayArray(play)}`,
      );
    }
    return configSource.replace(
      /(capture\s*:\s*\{)/,
      `$1\n    play: ${formatPlayArray(play)},`,
    );
  }
  const nameMatch = configSource.match(NAME_RE);
  if (nameMatch?.index !== undefined) {
    const insertAt = nameMatch.index + nameMatch[0].length;
    const insertion = `,\n  capture: {\n    play: ${formatPlayArray(play)},\n  }`;
    return `${configSource.slice(0, insertAt)}${insertion}${configSource.slice(insertAt)}`;
  }
  throw new Error("game.config.ts: could not find a place to write capture.play");
}

export function patchCreditExport(configSource: string, credit: GameCredit | null): string {
  if (credit === null) {
    return configSource.replace(CREDIT_EXPORT_RE, "").replace(/\n{3,}/g, "\n\n");
  }
  const next = formatCreditExport(credit);
  if (CREDIT_EXPORT_RE.test(configSource)) {
    return configSource.replace(CREDIT_EXPORT_RE, next.trimEnd());
  }
  const trimmed = configSource.endsWith("\n") ? configSource : `${configSource}\n`;
  return `${trimmed}\n${next}`;
}

export function applyGameSettingsPatch(
  configSource: string,
  patch: GameSettingsPatch,
): string {
  let next = configSource;
  if (patch.displayName !== undefined) next = patchDisplayName(next, patch.displayName);
  if (patch.capturePlay !== undefined) next = patchCapturePlay(next, patch.capturePlay);
  if (patch.credit !== undefined) next = patchCreditExport(next, patch.credit);
  return next;
}

export function validateNewGameId(id: string): string | null {
  if (!GAME_ID_PATTERN.test(id)) {
    return "id must be kebab-case: lowercase letters, digits, dashes";
  }
  return null;
}
