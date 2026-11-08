Capture tools report a dead browser daemon as a failure, restart it once, and the broker no longer dies with a fairshare slot

Root cause: the dev broker, kept dev servers and the daemon's Chrome were started with Start-Process, which stays in the caller's Windows job; fairshare ends a slot's kill-on-close job when the command's shell exits, so the broker died with whichever slotted capture run started it (about ten unlogged restarts between 00:20 and 01:13 UTC on 2026-11-08), its dev servers stopped a minute later, and each run on it fell back to a cold launch that exited 0. Verified by killing the broker mid perf run: beta prints one cold line and exits 0 on a cold browser; this change prints a daemon failure line naming the broker, reruns on a restarted broker, and a broker started inside a slot outlives the slot.

### Changed

- Capture tools report a dead browser daemon as a failure, restart it once, and the broker no longer dies with a fairshare slot
