---
name: convert-to-fanout
description: Rebuild a one-model agent as orchestrator plus cheap workers. Invoke to cut cost.
---

# Convert to Fan-out

A monolithic agent pays frontier rates for every token, but most of an agent's tokens are mechanical — reading files, fetching pages, running tools, transcribing output. Only a thin slice is planning and judgment. The conversion moves the mechanical tokens to a cheaper model while the frontier model keeps the judgment. Anthropic's measured results:

- **Advisor** (Sonnet 5 executor + Fable 5 advisor): ~92% of Fable 5's SWE-bench Pro score at ~63% of the price; the advisor fires roughly once per task.
- **Orchestrator** (Fable 5 coordinator + Sonnet 5 workers): 96% of Fable 5's BrowseComp performance at 46% of the price; in the cookbook run the team was ~2.5x cheaper and ~3x faster than solo Fable, with 84–98% of input tokens billed at the worker rate.

## Step 1 — Diagnose the current setup

Read the existing agent code or config and answer three questions:

1. **Which model runs the main loop, and what share of its tokens are mechanical?** Grep for the `model` field in API calls, agent framework config, or Claude Code settings. If a frontier model (Fable 5, Opus) is generating tool calls for bulk reading/fetching/transcribing, those tokens are the waste.
2. **Is the work fan-out-shaped or long-horizon-shaped?** Fan-out: independent parallel legs (research N sources, sweep M files, review K dimensions). Long-horizon: one sequential thread where each step depends on the last (a coding agent, computer use, a multi-step pipeline).
3. **Where does judgment actually live?** Decomposing the task, choosing an approach, verifying and synthesizing results. That's what stays on the frontier model.

Done when you can state: current model(s), the mechanical-token share, and the task shape.

## Step 2 — Pick the target pattern

| Task shape | Pattern | Frontier model does | Cheap model does |
|---|---|---|---|
| Fan-out (parallel independent legs) | **Orchestrator** | Plans, delegates, synthesizes — no heavy tools | Token-heavy legs in isolated contexts |
| Long-horizon sequential (coding, computer use) | **Advisor** | On-demand plan / course-correction, ~once per task | Every turn of the main loop |

The two compose: Claude Managed Agents supports both escalating up to a Fable 5 advisor and delegating down to Sonnet 5 workers, and each sub-agent keeps its own prompt cache so repeat calls don't re-pay for the same context.

Stay monolithic when: the task is single-turn Q&A (nothing to plan), a narrow question with minimal reading, or every turn genuinely needs frontier judgment on the raw material itself. Converting those makes the product worse or costlier, not cheaper.

## Step 3 — Apply the conversion

Pick the branch matching where the agent runs:

### Branch A: raw Anthropic API (Messages API loop)

- **Advisor**: keep the existing loop and model-swap it — executor `model` becomes `claude-sonnet-5`, add the advisor server tool `{"type": "advisor_20260301", "name": "advisor", "model": "claude-fable-5"}` and beta header `advisor-tool-2026-03-01`. The executor's system prompt, tools, and loop logic are otherwise untouched. Exact payloads, response handling (Fable 5 returns encrypted `advisor_redacted_result` — round-trip it verbatim), pause/resume, nudge tuning, and billing breakdown: read [references/advisor-tool.md](references/advisor-tool.md).
- **Orchestrator**: split the agent into a coordinator definition (`claude-fable-5`, `multiagent: {"type": "coordinator", ...}`, no heavy tools) and a worker definition (`claude-sonnet-5`, scoped toolset). The platform grants the coordinator `create_agent` / `send_to_agent` / `wait_for_agents` / `list_agents` and workers `submit_result` / `send_to_parent`. Exact definitions, stream events, and usage metering: read [references/managed-agents.md](references/managed-agents.md).

### Branch B: Claude Code (or Agent SDK)

No API surgery needed — the primitives already exist:

- **Orchestrator**: run the session on Fable 5. Delegate mechanical high-volume work to Sonnet workers: `Agent` tool with `model: "sonnet"` for one-off legs, `Workflow` with `agent(prompt, {model: 'sonnet'})` for structured fan-out (pipelines, verify passes). When N independent units each *ship* (branch → commit → PR), launch them together as `Agent({ isolation: "worktree", model: "sonnet" })` so parallel git ceremony doesn't stomp the shared tree — N tasks → N PRs at once. Keep planning, decomposition, and synthesis in the main loop; never forward raw worker dumps to the user — synthesize.
- **Advisor**: when the session runs on Sonnet, consult a Fable advisor before committing to a non-obvious approach: `Agent` with `model: "fable"`, prompt carrying the full task context and the instruction to return a plan or course-correction only (no edits). One consult per task is the calibrated rate.
- **Make it standing**: put the policy in `CLAUDE.md` — user-global (`~/.claude/CLAUDE.md`) for all local projects, repo-level (checked in) for cloud sessions, which read only the repo's `.claude/`. A repo that needs cloud coverage also needs this skill copied into its `.claude/skills/`.

## Step 4 — Verify parity, then measure

1. Run 2–3 representative tasks on the old and new setup; compare output quality. Watch for **rigor mismatch**: a solo frontier agent left alone often reads *less* than a well-briefed team, so "the team costs more than solo" can mean the team is doing a higher-rigor job, not that the conversion failed. Compare at equal rigor.
2. Tune brief granularity: if cost went *up*, the briefs are too narrow — merge legs until each worker does a substantial chunk.
3. Measure the split: advisor pattern → `usage.iterations[]` (advisor iterations billed at advisor rates, executor at executor rates); orchestrator → per-thread `usage` on session threads. Target: the large majority of input tokens billed at the worker/executor rate (the cookbook run hit 84–98%).

Done when the new setup matches old-setup quality on the test tasks and the token split confirms mechanical work moved to the cheap model.
