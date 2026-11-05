the home and /why pages' 2D canvas demos (car, keys, saves and the rest) stop drawing while offscreen or in a background tab, like the three.js demos already did

Root cause: mountCanvas2d and useLitLines ran their loops forever; mountLive's offscreen pause was never shared. The rule now lives in apps/web/src/live/shown.ts and all three use it.

### Fixed

- the home and /why pages' 2D canvas demos (car, keys, saves and the rest) stop drawing while offscreen or in a background tab, like the three.js demos already did
- traced code panels stop re-reading their lit lines every 90 ms while offscreen or in a background tab
