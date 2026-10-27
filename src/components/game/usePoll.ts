import { useEffect, useRef } from "react";
import { pollInterval } from "@/lib/game/polling";

/** A react-query `refetchInterval` that pauses when the tab is hidden or the player is idle. */
export function usePoll(base: number) {
  const lastInput = useRef(Date.now());
  useEffect(() => {
    const mark = () => {
      lastInput.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const name of events) window.addEventListener(name, mark, { passive: true });
    document.addEventListener("visibilitychange", mark);
    return () => {
      for (const name of events) window.removeEventListener(name, mark);
      document.removeEventListener("visibilitychange", mark);
    };
  }, []);
  return () =>
    pollInterval(base, {
      visible: typeof document === "undefined" || document.visibilityState === "visible",
      idleForMs: Date.now() - lastInput.current,
    });
}
