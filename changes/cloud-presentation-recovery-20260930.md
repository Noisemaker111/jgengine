### Fixed
- Shared game presentations report render failures with an explicit display retry while retaining the live game context and realm connection.
- Terrain material retry clears only pending exact texture groups owned by the failed presentation, including failures before Suspense commits, while preserving successful caches.
- Player-facing recovery explains the failure plainly, keeps technical details collapsed, and restores game focus after a committed retry. A recovered draw retires only its handled presentation diagnostic.
- Keyboard, touch release, control suspension and shell unmount publish input outside the render loop. Discrete intent supersedes older pending input acknowledgements without replaying held controls.
