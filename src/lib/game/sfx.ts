let ctx: AudioContext | null = null;

export function unlockAudio() {
  if (typeof window === "undefined") return;
  const AC = window.AudioContext;
  if (!AC) return;
  ctx ??= new AC();
  if (ctx.state === "suspended") void ctx.resume();
}

export function thud(kind: "build" | "march" | "good" | "bad") {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = kind === "bad" ? 96 : kind === "march" ? 148 : kind === "good" ? 220 : 176;
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.035, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(t);
  o.stop(t + 0.2);
}
