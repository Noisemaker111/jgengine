### Fixed

- The post-processing chain, graphics settings and textured terrain material keep a stable identity across renders. Before, every render rebuilt the effect composer and recompiled shaders, which dropped games to single-digit FPS.
