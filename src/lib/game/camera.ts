/**
 * Keep the map camera on the valley (QA #16: wide screens showed empty space
 * past the edge). `view` is how many cells fit on screen. When the valley is
 * smaller than the view on an axis it is centred on that axis instead.
 */
export function clampCamera(x: number, y: number, viewW: number, viewH: number, world: number) {
  const axis = (v: number, view: number) => (view >= world ? (world - view) / 2 : Math.min(Math.max(v, 0), world - view));
  return { x: axis(x, viewW), y: axis(y, viewH) };
}
