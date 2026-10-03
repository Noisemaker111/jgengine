### Fixed

- AO and depth-of-field scene prepasses reuse the beauty pass's shadow maps instead of redrawing shadow casters; failed prepasses restore shadow update settings and overlay visibility.
- Depth-of-field resizing and cleanup use the pass lifecycle, fixing a crash on current Three releases and duplicate resource disposal.
