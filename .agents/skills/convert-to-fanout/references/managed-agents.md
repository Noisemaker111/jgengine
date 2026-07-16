# Claude Managed Agents — coordinator + workers reference

From the Anthropic cookbook `managed_agents/CMA_plan_big_execute_small.ipynb`. Architecture: a **coordinator** (Fable 5) holds planning, judgment, and synthesis and carries no heavy tools; **workers** (Sonnet 5) run the token-heavy legs in parallel, each in an isolated context with its own prompt cache.

## Worker definition

Workers get a scoped toolset, not full capability:

```python
tools=[
    {
        "type": "agent_toolset_20260401",
        "default_config": {"enabled": False},
        "configs": [
            {"name": "web_search", "enabled": True},
            {"name": "web_fetch", "enabled": True},
        ],
    }
]
```

Scope the toolset to the leg the worker runs (file reading for codebase sweeps, fetch/search for research, bash for test runs). Workers automatically receive `submit_result` and `send_to_parent`.

## Coordinator definition

```python
multiagent={
    "type": "coordinator",
    "agents": [{"type": "agent", "id": worker.id}],
}
```

This grants the coordinator `create_agent`, `send_to_agent`, `wait_for_agents`, and `list_agents`. Everything the coordinator believes about its workers comes from its own system prompt — it cannot inspect worker prompts, names, or descriptions. Describe each worker's capabilities and brief format in the coordinator's system prompt explicitly.

## Observability

Session-level stream events expose the delegation:

- `session.thread_created` — worker spawned
- `agent.thread_message_sent` — coordinator delegated a brief
- `agent.thread_message_received` — worker returned findings

## Usage metering

Every session thread carries typed cumulative `usage`; session-level usage totals the team:

```python
threads = list(client.beta.sessions.threads.list(session_id, betas=BETAS))
primary = next(t.usage for t in threads if t.parent_thread_id is None)
workers = [t.usage for t in threads if t.parent_thread_id is not None]
```

Target after conversion: the large majority of input tokens on worker threads (the cookbook's research run billed 84–98% of input at the worker rate; team came out ~2.5x cheaper and ~3x faster than solo Fable 5 at equal reading rigor).

## Calibration caveats (all measured in the cookbook)

- **Brief granularity has an optimum.** Splitting into too many narrow briefs *increased* cost. Merge legs until each worker does a substantial chunk of reading/doing.
- **Rigor matching.** A solo frontier agent left to its own judgment reads less (one source per fact) and can look cheaper — that's a lower-rigor product, not a fairer baseline. Compare team vs. solo at the same evidence standard.
- **Coordinator blindness.** Workers verify facts, but premise-level errors (which items to even compare) come from the coordinator's own knowledge — keep a verification leg for premises, not just facts.
- **Poor fits.** Narrow questions with minimal reading, tasks the coordinator can answer without delegating, and tasks needing frontier judgment on the raw material itself.
- The pattern generalizes to any token-heavy mechanical leg: document review, log analysis, codebase sweeps — not just web research.

## Composing with the advisor

Managed Agents supports both directions in one team: workers can escalate up to a Fable 5 advisor, and the coordinator delegates down to Sonnet 5 workers. Each sub-agent keeps its own cache, so repeat calls don't re-pay for the same context.
