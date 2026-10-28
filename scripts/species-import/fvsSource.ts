/** One Carmean 1989 (NC-128) site-index curve as FVS `htcalc.f` codes it: 6 coefficients and its label. */
export interface CarmeanCurveRow {
  curve: number;
  label: string;
  b1: number;
  b2: number;
  b3: number;
  b4: number;
  b5: number;
  breastHeightFt: number;
}

/**
 * Every curve in the `LTBHEC` DATA blocks of an FVS `htcalc.f`: each `C n:LABEL` comment line is
 * followed by a continuation line of six numbers.
 */
export function parseCarmeanCurves(source: string): CarmeanCurveRow[] {
  const lines = source.split(/\r?\n/);
  const curves: CarmeanCurveRow[] = [];
  for (let i = 0; i + 1 < lines.length; i += 1) {
    const label = /^C\s*(\d+):(.+)$/.exec(lines[i] ?? "");
    if (label === null) continue;
    const numbers = (lines[i + 1] ?? "").replace(/^\s*&/, "").split(",").map((part) => Number(part.replace("/", "").trim())).filter((x) => Number.isFinite(x));
    if (numbers.length < 6) continue;
    const [b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, breastHeightFt = 0] = numbers;
    curves.push({ curve: Number(label[1]), label: (label[2] ?? "").trim(), b1, b2, b3, b4, b5, breastHeightFt });
  }
  return curves;
}

/**
 * Bechtold 2003 forest-grown crown width `CW = a + b·D + cr·CR% + hi·HI` (feet from DBH inches) of FIA
 * species `fiaCode` in an FVS `cwcalc.f` (case `<code>01`), or undefined when FVS has none.
 */
export function parseBechtoldCrownWidth(source: string, fiaCode: number): { a: number; b: number; cr: number; hi: number } | undefined {
  const code = `${String(fiaCode).padStart(3, "0")}01`;
  const at = source.indexOf(`CASE ('${code}')`);
  if (at < 0) return undefined;
  const header = source.lastIndexOf("CASE", at - 1);
  if (!source.slice(header, at).includes("BECHTOLD 2003")) return undefined;
  const line = /CW\s*=\s*([-\d.]+)\s*([+-])\s*([\d.]+)\*D([^\n]*)/.exec(source.slice(at, at + 400));
  if (line === null) return undefined;
  const term = (name: string): number => {
    const found = new RegExp(`([+-])\\s*([\\d.]+)\\*${name}\\b`).exec(line[4] ?? "");
    return found === null ? 0 : (found[1] === "-" ? -1 : 1) * Number(found[2]);
  };
  return { a: Number(line[1]), b: (line[2] === "-" ? -1 : 1) * Number(line[3]), cr: term("CR"), hi: term("HI") };
}

/**
 * Ek 1974 open-grown crown width `CW = a + b·D^c` (feet from DBH inches) of FIA species `fiaCode` in
 * an FVS `cwcalc.f` (case `<code>03`), or undefined when FVS has none.
 */
export function parseEkCrownWidth(source: string, fiaCode: number): { a: number; b: number; c: number } | undefined {
  const code = `${String(fiaCode).padStart(3, "0")}03`;
  const at = source.indexOf(`CASE ('${code}')`);
  if (at < 0) return undefined;
  const header = source.lastIndexOf("CASE", at - 1);
  if (!source.slice(header, at).includes("EK 1974")) return undefined;
  const body = source.slice(at, at + 400);
  const match = /CW\s*=\s*([\d.]+)\s*\+\s*([\d.]+)\*D\*\*([\d.]+)/.exec(body);
  if (match === null) return undefined;
  return { a: Number(match[1]), b: Number(match[2]), c: Number(match[3]) };
}
