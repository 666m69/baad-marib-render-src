/**
 * How often the client asks the server for news. Every poll runs a tick on the
 * database, so we poll slowly, never from a hidden tab, and not at all once the
 * player has been idle for a while (the next click or key press wakes it up,
 * and returning to the tab refetches at once).
 */
export const POLL_WORLD_MS = 20_000;
export const POLL_GATE_MS = 120_000;
export const IDLE_AFTER_MS = 5 * 60_000;

export function pollInterval(base: number, state: { visible: boolean; idleForMs: number }): number | false {
  if (!state.visible) return false;
  if (state.idleForMs >= IDLE_AFTER_MS) return false;
  return base;
}
