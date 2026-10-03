### Added

- Bounded SFX reservations (default 64 simultaneous playbacks) with configurable total/per-sound caps, priorities, reject/steal policy, injected allocator storage, snapshot/restore, and live retuning.

### Fixed

- Cancel pending audio before graph creation and release sample/synth graphs on completion, stealing, stop, failed load, graph construction/start failure, and teardown. Explicit retained-loop start requests can retry stolen/stopped voices. Preserve authored spatial gain without double attenuation and keep nonpositional cues flat.
