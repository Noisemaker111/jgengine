import { afterAll, expect, test } from "bun:test";
import { createDialogueRun } from "../../../core/src/game/dialogueGraph";
import type { NarrativeBatch, NarrativeCanon } from "../../../core/src/game/narrativeAuthoring";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as Snippet from "./snippets/narrative-authoring";

const compiled = await Bun.build({
  entrypoints: [new URL("./snippets/narrative-authoring.ts", import.meta.url).pathname],
  target: "bun",
  plugins: [{ name: "recipe-sdk", setup(build) {
    build.onResolve({ filter: /^@jgengine\/core\/game\/narrativeAuthoring$/ }, () => ({
      path: new URL("../../../core/src/game/narrativeAuthoring.ts", import.meta.url).pathname,
    }));
  } }],
});
if (!compiled.success) throw new Error(compiled.logs.join("\n"));
const temp = mkdtempSync(join(tmpdir(), "jgengine-narrative-recipe-"));
afterAll(() => rmSync(temp, { recursive: true, force: true }));
const compiledPath = join(temp, "recipe.mjs");
writeFileSync(compiledPath, await compiled.outputs[0]!.text());
const { authorNarrative } = await import(compiledPath) as typeof Snippet;

const limits = { maxDialogues: 1, maxNodes: 3, maxChoices: 2, maxClaims: 3, maxTextCharacters: 500 };
const slices: { brief: string; canon: NarrativeCanon; batch: NarrativeBatch; ending: string }[] = [
  {
    brief: "Undersea inquiry: spare procedural testimony; deciding whether to publish risks the witness's anonymity.",
    canon: { revision: "inquiry-r7", characterIds: ["diver"], facts: { hatch: "sealed" }, eventIds: ["descent", "alarm"] },
    batch: { canonRevision: "inquiry-r7", dialogues: [{ id: "deposition", graph: { start: "witness", nodes: [
      { id: "witness", speaker: "Witness 4", text: "The descent preceded the alarm. The hatch stayed sealed.", choices: [{ text: "Publish under seal", to: "seal" }, { text: "Release the testimony", to: "public" }] },
      { id: "seal", text: "The evidence is preserved. The witness remains unnamed." },
      { id: "public", text: "The public can challenge the account. The witness is exposed." },
    ] }, claims: [
      { nodeId: "witness", kind: "character", characterId: "diver" },
      { nodeId: "witness", kind: "fact", factId: "hatch", value: "sealed" },
      { nodeId: "witness", kind: "before", earlier: "descent", later: "alarm" },
    ] }] }, ending: "The evidence is preserved. The witness remains unnamed.",
  },
  {
    brief: "Absurd rooftop tea diplomacy: playful bargaining; a pigeon values ceremonial titles over biscuits.",
    canon: { revision: "tea-r2", characterIds: ["pigeon"], facts: { title: "Acting Crumb Marshal" }, eventIds: ["invitation", "tea"] },
    batch: { canonRevision: "tea-r2", dialogues: [{ id: "tea-treaty", graph: { start: "marshal", nodes: [
      { id: "marshal", speaker: "Acting Crumb Marshal", text: "You invited me before tea. Kindly address my hat, not my appetite.", choices: [{ text: "Salute the hat", to: "title" }, { text: "Offer a biscuit", to: "crumbs" }] },
      { id: "title", text: "The hat bows. Rooftop airspace is yours until teatime." },
      { id: "crumbs", text: "The biscuit vanishes. Negotiations remain formally delicious and unresolved." },
    ] }, claims: [
      { nodeId: "marshal", kind: "character", characterId: "pigeon" },
      { nodeId: "marshal", kind: "fact", factId: "title", value: "Acting Crumb Marshal" },
      { nodeId: "marshal", kind: "before", earlier: "invitation", later: "tea" },
    ] }] }, ending: "The hat bows. Rooftop airspace is yours until teatime.",
  },
];

for (const slice of slices) test(`caller-owned slice: ${slice.canon.revision}`, async () => {
  let reviews = 0;
  const result = await authorNarrative({ ...slice, limits, maxAttempts: 2,
    async generate(request) {
      expect(request.brief).toBe(slice.brief);
      return request.attempt === 1 ? { ...slice.batch, canonRevision: "stale" } : slice.batch;
    },
    async review(request) {
      reviews++;
      expect(request.issues).toEqual([]);
      expect(request.candidate).toEqual(slice.batch);
      return { approved: true, issues: [] };
    },
  });
  expect(result.status).toBe("accepted");
  expect(result.attempts).toBe(2);
  expect(reviews).toBe(1);
  if (result.status !== "accepted") throw new Error("expected accepted fixture");
  expect(result.batch).not.toBe(slice.batch);
  const run = createDialogueRun(result.batch.dialogues[0]!.graph);
  expect(run.choose(0)?.text).toBe(slice.ending);
});

test("await boundaries preserve original canon, limits, callback selection and candidate", async () => {
  const source = structuredClone(slices[0]!);
  const callerLimits = { ...limits };
  let generated: NarrativeBatch | undefined;
  const options = { canon: source.canon, brief: source.brief, limits: callerLimits, maxAttempts: 1,
    async generate(request: Parameters<Parameters<typeof authorNarrative>[0]["generate"]>[0]) {
      source.canon = { ...source.canon, revision: "changed" };
      (source.canon.facts as Record<string, string>).hatch = "open";
      callerLimits.maxNodes = 0;
      options.review = async () => ({ approved: false, issues: [] });
      expect(Object.isFrozen(request)).toBe(true);
      expect(Object.isFrozen(request.canon.facts)).toBe(true);
      expect(Object.isFrozen(request.limits)).toBe(true);
      generated = structuredClone(source.batch);
      await Promise.resolve();
      return generated;
    },
    async review(request: Parameters<Parameters<typeof authorNarrative>[0]["review"]>[0]) {
      expect(request.canon.revision).toBe("inquiry-r7");
      expect(request.canon.facts.hatch).toBe("sealed");
      expect(request.limits.maxNodes).toBe(3);
      expect(Object.isFrozen(request.candidate.dialogues[0]!.graph.nodes)).toBe(true);
      generated!.dialogues[0]!.graph.nodes[0]!.text = "Mutated after generation";
      await Promise.resolve();
      expect(request.candidate.dialogues[0]!.graph.nodes[0]!.text).toContain("hatch stayed sealed");
      return { approved: true, issues: [] };
    },
  };
  expect((await authorNarrative(options)).status).toBe("accepted");
});

test("semantic rejection is repaired with located diagnostics and finite attempts", async () => {
  let count = 0;
  const slice = slices[1]!;
  const result = await authorNarrative({ ...slice, limits, maxAttempts: 2,
    async generate(request) {
      count++;
      if (request.attempt === 2) {
        expect(request.previous).toEqual(slice.batch);
        expect(Object.isFrozen(request.previous!.dialogues[0]!.claims)).toBe(true);
        expect(request.issues[0]?.path).toBe("/dialogues/0/graph/nodes/0/choices/1");
      }
      return slice.batch;
    },
    async review() { return { approved: false, issues: [{ code: "consequence", severity: "error", path: "/dialogues/0/graph/nodes/0/choices/1", message: "Author requests a lasting consequence for the biscuit offer." }] }; },
  });
  expect(result.status).toBe("needs-review");
  expect(result.attempts).toBe(2);
  expect(count).toBe(2);
});

test("missing semantic approval never accepts; invalid attempts fail before generation", async () => {
  const slice = slices[0]!;
  const options = { ...slice, limits, maxAttempts: 1, async generate() { return slice.batch; }, async review() { return { approved: false, issues: [] }; } };
  const result = await authorNarrative(options);
  expect(result.status).toBe("needs-review");
  if (result.status === "needs-review") expect(result.issues[0]?.code).toBe("semantic-review");
  for (const maxAttempts of [0, -1, Infinity, NaN, 1.5]) expect(authorNarrative({ ...options, maxAttempts })).rejects.toThrow();
  expect(authorNarrative({ ...options, review: async () => { throw new Error("review unavailable"); } })).rejects.toThrow("review unavailable");
});

test("oversized candidates are discarded before snapshot copying or semantic review", async () => {
  const slice = slices[0]!;
  const result = await authorNarrative({ ...slice, limits, maxAttempts: 2,
    async generate(request) {
      if (request.attempt === 2) {
        expect(request.previous).toBeUndefined();
        expect(request.issues[0]?.code).toBe("batch-budget");
        return slice.batch;
      }
      return { canonRevision: slice.canon.revision, dialogues: [{ id: "too-large", claims: [], graph: {
        start: "x", nodes: Array.from({ length: 4 }, () => ({ id: "x", get text() { throw new Error("oversized content must not be copied"); } })),
      } }] };
    },
    async review() { return { approved: true, issues: [] }; },
  });
  expect(result.status).toBe("accepted");
});

test("structural repair preserves canon and semantic approval cannot waive errors", async () => {
  const slice = slices[0]!;
  const result = await authorNarrative({ ...slice, limits, maxAttempts: 2,
    async generate(request) {
      if (request.attempt === 2) {
        expect(request.issues.some((issue) => issue.code === "fact-conflict" && issue.path === "/dialogues/0/claims/1/value")).toBe(true);
        expect(request.canon.facts.hatch).toBe("sealed");
        return slice.batch;
      }
      const incorrect = structuredClone(slice.batch);
      const dialogue = incorrect.dialogues[0]!;
      return { ...incorrect, dialogues: [{ ...dialogue, claims: dialogue.claims.map((claim) => claim.kind === "fact" ? { ...claim, value: "open" } : claim) }] };
    },
    async review() { return { approved: true, issues: [{ code: "motivation", severity: "error", path: "/dialogues/0/graph/nodes/0", message: "Explain why the witness risks speaking." }] }; },
  });
  expect(result.status).toBe("needs-review");
  if (result.status === "needs-review") expect(result.issues.some((issue) => issue.code === "motivation")).toBe(true);
  expect(slice.canon.facts.hatch).toBe("sealed");
});
