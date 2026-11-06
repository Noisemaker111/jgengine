the demo nudge ring and arrow pause while their demo is off screen or the tab is hidden, so a page scrolled past a demo stops restyling it every frame

Root cause: the nudge ring animates box-shadow forever, which needs a main-thread style and paint every frame even when nobody can see it. LiveSpecimen now marks its root data-shown through watchShown, and styles.css pauses both animations when it is false; on screen they look and cost the same.

### Fixed

- the demo nudge ring and arrow pause while their demo is off screen or the tab is hidden, so a page scrolled past a demo stops restyling it every frame
