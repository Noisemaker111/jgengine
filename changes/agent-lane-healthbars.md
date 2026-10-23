### Changed

- World health bars and nameplates derive their range from the render camera and the target height when a game sets no `maxDistance`: an overhead camera reaches the units it looks down at, and a bar is kept while the target it annotates still covers 18 px, instead of hiding every target past a fixed 60 units.
- A configured `worldHealthBars.maxDistance` or `nameplates.maxDistance` that hides every target in view now warns once with the nearest measured distance and the prop to raise, instead of rendering nothing.
