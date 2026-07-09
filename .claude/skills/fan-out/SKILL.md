---
name: fan-out
description: >-
  Cheap workers do the dumb work. Use on almost every non-trivial turn — whenever
  you are about to run lint, typecheck, tests, build, preview, screenshot, shoot,
  Playwright, GitHub PR/issue ceremony, bulk file reads, research sweeps, renames, doc
  sweeps, or log triage on the frontier model; whenever another skill says to
  verify or fan mechanical legs; whenever you catch yourself about to do a
  mechanical batch inline. Standing authorization — do not ask first.
---

# Cheap workers do the dumb work

Frontier model: plan, design, judge, synthesize.  
Cheap worker (Sonnet / cheaper Task model): every mechanical leg below.

## Always fan these — never run them on the frontier model

- lint · typecheck · test · build
- preview · screenshot · `bun run shoot` · Playwright
- GitHub ceremony after the decision is made (PR create, comments, issue ops — MCP tools or `gh` where it exists)
- bulk file reads · research sweeps · renames · doc sweeps · log triage

Announce workers on a 🤖 line, job-named. Judge their output; never dump raw worker text to the user.

## Never fan these

- engine / product design, API surface, layering, gnarly types
- synthesizing worker results into the user-facing answer
- trivial single-file edits and direct Q&A

## Research is not free

Do **not** spawn research workers to rediscover scaffolding, HUD idioms, or anything already in skills. Research only for novel engine seams the skills do not document — then stop.

## Done when

Mechanical work ran on cheap workers; this session only planned and judged.
