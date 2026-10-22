### Fixed

- `MissionView.remaining` (`@jgengine/core/gameplay`) now counts down from a `survive` objective's own `duration`, not only from a `timeout`. A defend or hold objective reports the seconds it still has to run, which is the one number its HUD needs; a completed run still reports null.
