import { strToU8, zipSync } from "fflate";

import type { FetchLike } from "./download";
import type { PolyPizzaBundleDownload } from "./manifest";

/** One model card on a Poly Pizza bundle page. */
export interface PolyPizzaModel {
  /** Poly Pizza model id: the page is `poly.pizza/m/<id>`. */
  id: string;
  title: string;
  /** Static resource id: the model is `static.poly.pizza/<resource>.glb`. */
  resource: string;
  /** The licence chip on the card, e.g. "CC0" or "CC-BY". */
  license: string;
}

const USER_AGENT = { "user-agent": "Mozilla/5.0 (jgengine asset mirror)" };

/** Parse every model card on a Poly Pizza bundle page. @internal */
export function parsePolyPizzaBundle(html: string): PolyPizzaModel[] {
  const models: PolyPizzaModel[] = [];
  const seen = new Set<string>();
  const card = /src="https:\/\/static\.poly\.pizza\/([0-9a-f-]{36})\.webp"[^>]*alt="([^"]*)"[\s\S]*?to="\/m\/([A-Za-z0-9_-]+)"[\s\S]*?MuiChip-label[^>]*>([^<]+)</g;
  for (const match of html.matchAll(card)) {
    const [, resource, title, id, license] = match;
    if (resource === undefined || title === undefined || id === undefined || license === undefined || seen.has(id)) continue;
    seen.add(id);
    models.push({ id, title: title.replace(/&amp;/g, "&"), resource, license: license.trim() });
  }
  return models;
}

/** A model's title as a file name: "Character Soldier" -> "Character_Soldier". */
function fileStem(title: string): string {
  return title.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Zip every model of a Poly Pizza bundle as `<Title>.glb`, plus a `LICENSE.txt` naming each
 * model's page and licence. Refuses the bundle when a model's licence is neither CC0 nor
 * `expectedLicense`, so a re-licensed upload can never slip into a mirror under the wrong terms.
 */
export async function polyPizzaBundleArchive(
  download: PolyPizzaBundleDownload,
  expectedLicense: string,
  maxBytes: number,
  fetchImpl: FetchLike = fetch,
): Promise<Uint8Array<ArrayBuffer>> {
  const page = `https://poly.pizza/bundle/${download.polyPizzaBundle}`;
  const response = await fetchImpl(page, { headers: USER_AGENT });
  if (!response.ok) throw new Error(`${page}: HTTP ${response.status}`);
  const models = parsePolyPizzaBundle(await response.text());
  if (models.length === 0) throw new Error(`${page}: no model cards found`);
  const offLicence = models.filter((model) => model.license !== "CC0" && model.license !== expectedLicense);
  if (offLicence.length > 0) {
    throw new Error(`${page}: ${offLicence.map((model) => `${model.title} is ${model.license}`).join(", ")}, not CC0 or ${expectedLicense}`);
  }
  const files: Record<string, Uint8Array> = {};
  const credits: string[] = [page, "Licence per model, as Poly Pizza lists it:", ""];
  let total = 0;
  for (const model of models) {
    const url = `https://static.poly.pizza/${model.resource}.glb`;
    const glb = await fetchImpl(url, { headers: USER_AGENT });
    if (!glb.ok) throw new Error(`${url}: HTTP ${glb.status}`);
    const bytes = new Uint8Array(await glb.arrayBuffer());
    total += bytes.byteLength;
    if (total > maxBytes) throw new Error(`${page}: bundle passes the ${maxBytes} byte cap`);
    let stem = fileStem(model.title);
    if (`${stem}.glb` in files) stem = `${stem}_${model.id}`;
    files[`${stem}.glb`] = bytes;
    credits.push(`${stem}.glb  ${model.title}  https://poly.pizza/m/${model.id}  ${model.license}`);
  }
  files["LICENSE.txt"] = strToU8(`${credits.join("\n")}\n`);
  const zipped = zipSync(files, { level: 6 });
  const out = new Uint8Array(new ArrayBuffer(zipped.byteLength));
  out.set(zipped);
  return out;
}
