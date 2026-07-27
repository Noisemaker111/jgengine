# JGengine repository governance

Read [README.md](README.md) first. It owns stable project truth: repository map, packages, layering, stack, commands, publishing model, and license. Do not duplicate those facts here or in skills.

## Write short — everywhere

Long prose is a defect, not thoroughness. This applies to **every** surface a human reads: chat replies, PR bodies, issues, commit messages, PR comments, review replies. One idea per line; no idea gets a paragraph.

**Chat reply.** What you did, what is still open, the links. A few lines, not a page — if it runs past a phone screen, cut it.

**PR body.** A line of context, a bullet per changed area (file plus what changed, not why it is good), `Closes #N`, verification as command names and their verdict, screenshots. Bugfixes add a sentence of root cause. Scale with the diff — a two-file change does not get the same body as a twelve-file one — but never pad.

**Issue.** Problem in a sentence, acceptance criteria as bullets. No background essay.

**Commit message.** Subject line, then only the body a reader actually needs.

**Never write, anywhere:** plan recaps, what you read or considered and rejected, per-file walkthroughs, justifications nobody asked for, restated tool output, closing summaries that repeat the body, apologies, victory laps, "let me know if you want…". Bold section headers belong in a PR body, never in a chat reply. Numbered lists are for real enumerations, never for narrating reasoning.

**Expand only on request.** "Explain", "why", or a direct design question earns depth — answer that question and stop. A decision that needs the user is one concrete question with the options named, never an essay ending in a question.

**Subagents.** A worker's report to the main agent may be dense. The user-facing synthesis is not, and a subagent report is never pasted into chat or a PR body.

## Global writing style

Write in plain, natural language. This governs every generated word — chat replies, PR bodies, issues, commit messages, review replies, code comments, docs, skill text, and in-game copy — and it applies alongside the length rules above, not instead of them. Short and stylized is still wrong.

Do not:

- sound theatrical, smug, combative, managerial, or self-important
- turn an ordinary point into a slogan
- use punchy fragments for dramatic effect
- state something with more certainty than you have
- write lines like "the honest answer", "the best word", "this kills the problem", "you never confirmed", or "in case you want to fight me"
- imitate the voice of a critic, creative director, prosecutor, or brand copywriter
- add attitude, tension, wit, or rhetorical flourish unless the user asks for it

Prefer:

- normal conversational sentences
- literal wording
- clear explanations
- neutral descriptions
- explicit uncertainty
- collaborative phrasing

When generating any text: state the point directly, explain it simply, keep facts, assumptions, and suggestions separate, avoid compressed or stylized phrasing, and do not invent emotional subtext.

Aim for the tone of a calm, competent coworker. The goal is clarity, not personality. Before sending, rewrite any sentence that reads like a line from a trailer, manifesto, argument, pitch deck, or dramatic monologue.

## Asking and proposing

Four failures that cost real rework. They apply to design work, code review, planning, and any turn where you hand the user something to react to.

**Define a term in the sentence that introduces it, or do not introduce it.** Invented vocabulary — a system name, a category, a coined noun for a mechanic — is unreadable to everyone but you until it is defined. Never ship a document, PR body, or reply whose reader has to infer what your own words mean. If a term needs a paragraph to justify, it is the wrong term.

**Ask decisions, not worries.** "Can this hold under load?" and "is four resources one too many?" are you thinking out loud with a question mark attached, and they cannot be answered. Name the decision and the options: "three pools or four?" Reserve open-ended framing for a genuine request for the user's read, and even then say what you would pick.

**Propose the frame before building the artifact.** Ten lines showing the shape — the categories, one example each, the rule that generates the rest — costs one message and catches a wrong premise before it becomes hundreds of lines you delete. Volume is not progress when the reader cannot parse the units.

**A merge is not approval, and silence is not agreement.** Users clear queues to keep moving. Treat "landed" as landed; treat only an explicit answer as a decision. When a user rejects a name, ask whether the thing survives before renaming it — a rejected label is usually a rejected concept. And use the user's words for their own domain rather than better ones you invented; if they said "common, uncommon, rare", that is the vocabulary, and improving on it is not your call.

## Comments in code

Default to none. Well-named code needs no narration, and a comment on every block is the same defect as a wall of prose in chat.

- **JSDoc on exported public API stays** — it is the source for generated `api.md`/`capabilities.md` and the reason a consumer can discover a seam. Keep it tight: what it is and when to reach for it, not an essay.
- **Inside a function body, a comment must earn its line.** Non-obvious *why* only: a workaround and what breaks without it, an invariant the types cannot express, a formula's source, a deliberate perf tradeoff. One line.
- **Delete on sight:** restating the next line in English, section banners (`// ---- setup ----`), step numbering, `// TODO` with no issue link, commented-out code, changelog notes about what you just changed, and multi-line block comments explaining ordinary logic.
- Match the density of the file you are editing. Do not add comments to code you are only passing through.

## Product invariants

- **Author world content in the editor.** Scenes, placement, terrain, paths, zones, foliage, and assets belong in `editor.scene.json`, authored through the editor GUI or RPC/CLI. Any request that adds, moves, restyles, or removes visible world content — streets, buildings, props, enemy/NPC placement, phase or trigger locations, "design this world", "make it look better" — is an editor authoring task first, however it is phrased. Runtime and gameplay consume that document through shared engine primitives. If the editor cannot express required content, file a `[FEATURE]` issue before any code fallback; never hardcode geometry or coordinate arrays a scene can own. Use `jgengine-editor` for authoring and `jgengine-world` for runtime consumption.
- **Build reusable capability upstream.** Before editing `Games/*`, name the shared owner. Anything another game could need belongs in `packages/*` as a narrow, genre-agnostic seam with the game as its first adopter. Game-local code is reserved for genuinely game-specific content and feel. Extracting a primitive must preserve observable play.
- **Every game is custom; no genre kits.** Never build or reach for genre kits, presets, archetypes, class templates, or "default sports car / default RPG / default FPS" product shapes in the SDK or skills. Treat every pitch as a unique composition of needs, not a genre to fill in. `Games/*` are probes, never templates — prefer `capabilities.md`, recipes, or core APIs over reading another game's source. When a custom game needs something awkward, incomplete, or handrolled (catalog builders, loadout compose, boost meters, driving glue, and the like), lift a narrow, data-first, genre-agnostic seam into `packages/*` and skills; do not invent a game-local mini-framework or copy `Games/*`. If two custom games would re-handroll the same glue, that glue belongs in the SDK or a skill recipe, not duplicated under `Games/*`.
- **Respect package layering.** The dependency direction in [README.md](README.md#layering) is authoritative. Never import from a higher layer or make `core` depend on frameworks, rendering, browser, backend, or game code.
- **Scale by default.** Prefer serializable state, deterministic injected randomness, bounded work, and allocation-aware hot paths. Avoid full-world per-frame scans and single-player-only contracts.
- **Stateful primitives keep their state, storage, and policy reachable.** Data-first helpers that take state and return state are already fine — this is about `create*` factories that own mutable state behind a closure, which is where the engine's defects cluster. Three requirements, each with a shipped exemplar. **State out and back in:** the handle exposes a state-out method (`snapshot()`/`state()`) and its counterpart (`restore(next)`/`reset(next)`) — `cards/cardPile.ts` pairs pure state functions with a stateful wrapper over the same `CardPileState`. **Storage is the caller's if it could be:** where the state lives is a narrow injected interface, not a private field — `game/keyValueStore.ts`'s `KeyValueStorage`, `combat/magazine.ts`'s `MagazineReserve`. **Config is not frozen at construction:** anything that changes during play (parts, damage, buffs, difficulty) is retunable — `physics/kinematicVehicle.ts`'s `retune`, `combat/abilityKit.ts`'s `retuneSlot`. `check-stateful-ratchet` enforces the first mechanically against a shrink-only baseline; the other two are review's job. Do not weld policy a game might want to vary into the component — take it as a callback or a config field.
- **Every game owns its UI composition; the engine ships the common parts.** Presentation is game content: each game arranges, skins, names, and art-directs its HUD, menus, and feedback. But the parts almost every game needs — inventory grids with real drag/stack/split mechanics, toggleable windows (bag, character sheet, spellbook, quest log), stat and vitals bars, action bars, currency counters, minimaps — ship as good, drop-in-ready building blocks in `packages/*` that a game wires in a line or two and reskins with HudTheme tokens. Reaching for those is using the engine correctly, not "incomplete work": a game should start from the building blocks it needs, never re-derive inventory, windowing, or a paperdoll from raw divs. What the engine still does not ship is a whole finished game *face* or a genre theme preset as the product — games own the overall look, layout, placement, terminology, and their single main menu — a real game front-end (New Game/Continue/Load, character or class select, settings, credits as the game supports them), not a marketing splash — plus a game-owned settings surface reachable from a sensible place and reachable in-game credits. An empty `HudCanvas` plus a UI art-direction block is a valid starting point; so is composing the shipped building blocks. Judge UI by the rendered result, not by whether stock widgets were used.
- **Never use Kenney assets.** Do not add, fetch, index, alias, credit, or reference Kenney.nl content. Prefer Quaternius or KayKit for CC0 3D, game-icons.net for icons, and ambientCG for PBR.
- **Ports copy behavior and data, not implementation.** Harvest numbers, tables, layouts, palettes, formulas, and feel, then rebuild on engine seams. Do not transplant another project's functions, renderers, or DOM/canvas workarounds.
- **Credit borrowed work.** Record inspiration, ports, and copied permissive assets in `CREDITS.md`; player-facing game work also carries HUD and website credit.

## Agent runtime (Claude / Codex / Grok)

Cold checkouts and git worktrees are not ready until bootstrapped. Do this before recon thrash, issue storms, or package typechecks:

1. **Bootstrap** — `bun run agent:bootstrap` (installs if needed, then full package build so `@jgengine/*` dist exists; ~2–3 min cold). On Claude cloud sessions the SessionStart hook auto-starts it in the background on a cold tree (log: `.agent-bootstrap.log`) — do not start another; recon while it runs and confirm with `bun run agent:bootstrap --check` (reports live progress while one is running) before any build-dependent command. On other runtimes (Codex/Grok/local worktrees) start it yourself in a background task. NEVER kill a slow install — a killed `bun install` leaves half-hardlinked `node_modules` and forces a wipe-and-reinstall loop. Bootstrap is lock-guarded (re-invoking joins the running one) and self-heals partial trees, including killed installs (`.agent-bootstrap.installing` marker → wipe and reinstall).
2. **Package scripts** — prefer `bun --cwd=packages/<pkg> run <script>` (the `=` form). The space form `bun --cwd packages/<pkg> run <script>` mis-parses and prints bun-run help with exit 0 without running the script; `bun run --cwd packages/<pkg> <script>` can hit the wrong root script.
3. **Worktrees are for local parallelism only** — multiple agents sharing one machine's checkout: `bun run agent:worktree -- <name>` or Claude `claude --worktree <name>` (both land under `.claude/worktrees/` and bootstrap themselves; never nest one under another, never `C:\tmp\...` on Windows Codex). Cloud/container sessions (Claude web, Codex cloud, Grok) are already isolated — never create a worktree there; just branch from `origin/main`. Cloud environments should set their setup script to `bash scripts/cloud-setup.sh` so sessions start from a warm snapshot instead of a cold install.
4. **Process order** — bootstrap first; then claim **one** issue (or the slice the user named); implement; focused tests; `bun run gate` / `bun run ship:preflight` when shipping. Do not open a multi-issue program before the tree can run Bun.
5. **Papercuts** — log only after bootstrap works (`bun run papercut -m <model> "..."`). Do not thrash on papercut path while install/build is broken.
6. **Evidence** — deterministic tests first. Screenshots only for pixel claims (`jgengine-verify`); use `bun run shoot` / `drive`, not a hand-rolled Vite app. Arbitrary `--url` pages must set `document.documentElement.dataset.jgCapture = "ready"`. Capture fails twice → stop and report lower-rung evidence.

## Change governance

- Preserve user work. Never discard or overwrite unrelated changes. Start a new task branch from current `origin/main`; do not stack new work on a parked or merged task branch.
- Move in slices; bound recon. Read only what the smallest end-to-end change needs, then act — recon must terminate in a commit or an approved plan, never in open-ended narration. Prefer a working vertical slice over broad discovery.
- Parallelize by default. When the task has two or more legs that do not need each other's output — separate subsystems, separate files, independent audits or verification suites — spawn one Opus subagent per leg in a single batch instead of working them serially. Keep planning, overlapping edits, and final synthesis in the main agent; never give two workers the same files; judge worker evidence rather than trusting claims. Small edits, quick greps, and waiting stay inline. Serial work on independent legs is the exception and needs a reason.
- Route drudge work to Haiku. Long mechanical sequences that need no judgment — babysitting `bun run gate`/preflight runs and reporting the verdict, regenerating manifests/artifacts, commit + push + PR-open choreography, tailing logs for a known marker, capturing screenshot galleries, mass renames from an explicit list — go to a `model: haiku` subagent instead of occupying the main model. The main agent writes a precise prompt with exact commands and success criteria, then judges the returned evidence. Anything requiring design decisions, debugging, or code authorship stays on the stronger model.
- Claim a tracked issue before implementation. A fixed issue is closed by the PR with `Closes #N` (or explicitly when auto-close cannot work).
- A PR is one coherent, independently reviewable and revertible change. Combine work sharing a root cause, API migration, files, acceptance criteria, and verification story. Split work that is independently releasable, reviewable, revertible, or likely to conflict. Issue count never determines PR count.
- Follow the `workflow` skill for issue → change → verify → ship. Push with a standalone `git push` command. In the `Noisemaker111` repo, enable squash auto-merge when you open the PR so GitHub lands it itself once CI is green — the user never merges by hand. Never enable auto-merge or merge for any other owner/repo (park the PR there). Never bump versions or publish npm releases unless the user explicitly asks; the user owns release and publish timing.
- Public API, workflow, convention, or tooling changes update their owning skill/reference and generated artifacts in the same PR. Do not create ADRs, audit reports, or freestanding design docs; durable guidance belongs here, an existing README, or the owning skill.
- Log papercuts in the moment. Whenever work hits a small non-blocking friction — a preview build error on main, a retried or dead-end command, a misleading error, a flaky script, a confusing setup step, a task that took far longer than it should have, or any solvable bump in the road — log it immediately with `bun run papercut -m <your-model-id> "what you were doing → what got in the way"` and keep going. Do not wait for session end or ask permission; `/papercut` mines a whole session, and `improve` passes sweep `PAPERCUTS.md` (research each entry, fix the easy ones, remove fixed entries).
- Reinforce the root cause, not just the symptom. A bugfix is complete only when its PR body answers three questions: (a) which engine seam, permissive default, or missing contract allowed the bug; (b) whether any other game or consumer could hit the same class — if yes, the systemic fix goes upstream into `packages/*` (explicit contracts, safe defaults, dev-mode warnings) and/or a gate or conformance check (`check-game-shape`, ratchet baselines) so silence fails CI; (c) if the reinforcement is too big for the fix PR, a tracked `[FEATURE]` issue is filed before the patch ships — the patch may land first, but the hole gets a ticket. Keep it proportionate: prefer making the wrong state unrepresentable or loudly detectable over flipping defaults, heavy process, or speculative frameworks; one sentence of root cause per bugfix PR is the ceiling of ceremony.
- Treat completion as an evidence claim. Inspect the actual diff and acceptance criteria; run verification proportional to risk. `bun run gate` is the full local verdict and `bun run ship:preflight` is the final shipping check. Visual claims also follow `jgengine-verify` and include screenshot evidence.
- Attach screenshots to the PR itself, not just to your local notes. Most changes here touch a rendered surface — HUD, menus, editor, scene, gameplay, any visible world content — and for those the PR body must embed before/after screenshots (or a short capture) of the affected view, captured via `jgengine-verify` (`bun run shoot` / `drive`). Assume a change needs screenshots unless it genuinely has no rendered surface (pure types, build config, docs, internal refactors with identical output); if you skip them, say why in the PR body. A visual or gameplay change without PR screenshots is incomplete work — the reviewer must see the result without checking out the branch.
- Behavior over time gets a clip, and every behavior change gets *tried* — drive the actual game and watch the new behavior happen before claiming it works; tests alone never complete a runtime-behavior change. Present motion as **video or still images — never a GIF**, and never send video files into the conversation. See `jgengine-verify` for recording, `pr-video`, and clip-presentation mechanics.

## Skill architecture

- `jgengine` is intake and routing only. Load only domains the task needs; use each selected domain's `capabilities.md` for intent-to-import discovery, `api.md` for generated export inventory, and references for deeper workflows.
- Each concept has one skill owner. `workflow` owns delivery, `jgengine-verify` owns evidence, `improve` owns backlog passes and post-fix friction retrospectives, `ce-handoff` owns agent session continuity (create/resume handoffs for a fresh agent), and domain skills own their package/API boundaries. Concurrency has no skill: the parallelize-by-default invariant above is the whole policy.
- Skill descriptions stay short and trigger-oriented. `SKILL.md` holds decisions and canonical workflows, not export catalogs or repeated project facts. The repository gates root mirroring, route integrity, and duplicate prose.

## Model identity

- State the model you are (name and ID) at the start of every conversation.
- Model index — `$` is relative cost, `IQ` is relative capability, both rough and directional, not measured:

  | Model | $ | IQ |
  | --- | --- | --- |
  | Fable | 9 | 10 |
  | GPT 5.6 | 4 | 7 |
  | Grok 4.5 | 3 | 6 |
  | Opus | 4 | 5 |
  | Sonnet | 3 | 4 |
  | Haiku | 1 | 1 |

  Route work by this index: Haiku for the mechanical drudge work described above, Sonnet for default implementation, Opus/GPT 5.6/Grok 4.5/Fable reserved for design decisions, hard debugging, or judgment calls that justify their cost.
