Timed runs share one machine-wide perf lock (scripts/perf-lock.ts), so two never overlap

Root cause: on 2026-11-08 six threads timed games at once (fps-gap, perf desktop, shadow-audit, drive); nothing kept two timed runs apart, so the PC sat at 87-99% CPU and no run got a trustworthy number. Now measureGame (perf play, gate, fps-gap, shadow-audit), perf network, perf desktop's launched app, perf native's rows and drive --hitches hold %LOCALAPPDATA%\jgengine\perf.lock for the timed part only; builds, installs and Vite startup stay outside it. A waiter prints 'waiting for perf lock held by <branch> (pid N, since HH:MM)' and starts when it frees; a dead or silent holder is taken over with 'degraded: stale perf lock'. Queue time is given back to guard.ts and withBrowserSession's deadlines. Shoot and a plain drive time no frames and do not wait. Shown: two 'perf fps-gap --games deepward' runs started together from two worktrees; one waited, then both printed numbers (5.1 ms and 5.8 ms p50).

### Changed

- Timed runs share one machine-wide perf lock (scripts/perf-lock.ts), so two never overlap
