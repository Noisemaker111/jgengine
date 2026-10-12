### Fixed

- Runtime environment ground now renders editor-authored terrain paint surfaces, layer tints, opacity and weighted blends through the same sampler as the editor. Legacy unpainted terrain keeps descriptor shading. Layer texture tiling, roughness and triplanar controls remain serialized authoring metadata; this fix does not add layered PBR texture rendering.
