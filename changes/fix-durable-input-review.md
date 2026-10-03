### Migrate

- Direct hosted-runner callers must join or resume a member before submitting its input; frames from nonmembers are ignored.

### Fixed

- Canvas mouse bindings now deliver brief presses, native mouse chords and held actions through the shared input tracker, release owned buttons on focus loss or suspension, and prevent a claimed mouse gesture from also firing the legacy hotbar action.
- Press edges survive release before a simulation sample and urgent neutral input arriving before a delayed press; each authoritative host or deterministic replay consumes an edge once.
- Owner resets always supersede delayed input, including an identical neutral release still carrying an unacknowledged press.
- Stateless hosted reconstruction retains input admission and pending presses in host-only save state, so replaying stored held intent never fires a consumed press again.
- Hosted input now compacts elapsed records in memory and retains departed admission marks within a configurable user/TTL window; `inputRetention` sets the policy and `inputStats()` reports retained storage. Explicit future replay edges and standalone input logs remain intact.
