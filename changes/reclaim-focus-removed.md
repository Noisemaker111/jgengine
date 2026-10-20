### Fixed

- After a click on a control that then unmounts (a start screen's "Play", a menu's last button), `@jgengine/shell` returns focus to the play surface instead of leaving it on `<body>`, so gameplay keys work without an extra click on the canvas.
