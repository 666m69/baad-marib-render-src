import { useEffect, useRef, useState } from "react";
import { THREAT_RANGE, WORLD, chebyshev } from "@/lib/game/balance";
import { clashCaption } from "@/lib/game/names";
import { clampCamera } from "@/lib/game/camera";
import { fmtRemain } from "@/lib/game/format";
import { terrainAt } from "@/lib/game/terrain";
import type { PublicClash, PublicMarch, WorldSnapshot } from "@/lib/game/types";
import { TribeBanner } from "./Mark";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function progress(march: PublicMarch, now: number) {
  const span = Math.max(1, march.arriveAt - march.departAt);
  return clamp((now - march.departAt) / span, 0, 1);
}

export function MapView({
  world,
  now,
  selected,
  onSelect,
}: {
  world: WorldSnapshot;
  now: number;
  selected: { x: number; y: number } | null;
  onSelect: (x: number, y: number) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 360, h: 480 });
  const you = world.you;
  const [cam, setCam] = useState({ x: (you?.x ?? 14) - 3, y: (you?.y ?? 14) - 4 });
  const camRef = useRef(cam);
  camRef.current = cam;
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ dist: number; cell: number } | null>(null);
  const drag = useRef<{ id: number; sx: number; sy: number; cx: number; cy: number; moved: boolean } | null>(null);
  const [cell, setCell] = useState(48);
  const cellRef = useRef(cell);
  cellRef.current = cell;
  const [readClash, setReadClash] = useState(0);
  const centered = useRef(false);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const watch = new ResizeObserver(() => {
      setBox({ w: el.clientWidth, h: el.clientHeight });
    });
    watch.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setCell((size) => clamp(size + (event.deltaY > 0 ? -8 : 8), 32, 72));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      watch.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  useEffect(() => {
    if (!you || centered.current || box.w < 20) return;
    centered.current = true;
    setCam(clampCamera(you.x - box.w / cell / 2 + 0.5, you.y - box.h / cell / 2 + 0.5, box.w / cell, box.h / cell, WORLD));
  }, [you, box.w, box.h, cell]);

  // Zooming or resizing must not reveal space past the valley's edge either.
  useEffect(() => {
    setCam((c) => {
      const next = clampCamera(c.x, c.y, box.w / cell, box.h / cell, WORLD);
      return next.x === c.x && next.y === c.y ? c : next;
    });
  }, [cell, box.w, box.h]);

  const cols = Math.ceil(box.w / cell) + 2;
  const rows = Math.ceil(box.h / cell) + 2;
  const x0 = Math.floor(cam.x);
  const y0 = Math.floor(cam.y);
  const ox = -(cam.x - x0) * cell;
  const oy = -(cam.y - y0) * cell;

  const campAt = (x: number, y: number) => world.camps.find((c) => c.x === x && c.y === y);
  const banditAt = (x: number, y: number) => world.bandits.find((b) => b.x === x && b.y === y);
  const saalikAt = (x: number, y: number) => (world.saalik ?? []).find((man) => man.x === x && man.y === y);
  const pastureAt = new Map((world.pastures ?? []).map((cell) => [`${cell.x}:${cell.y}`, cell]));

  function recenter() {
    if (!you) return;
    setCam(clampCamera(you.x - box.w / cell / 2 + 0.5, you.y - box.h / cell / 2 + 0.5, box.w / cell, box.h / cell, WORLD));
  }

  function focusAt(x: number, y: number) {
    setCam(clampCamera(x - box.w / cell / 2 + 0.5, y - box.h / cell / 2 + 0.5, box.w / cell, box.h / cell, WORLD));
    onSelect(x, y);
  }

  const marks = new Map<string, { kind: "clash" | "march" | "saalik"; label: string }>();
  if (you) {
    for (const bandit of world.bandits) {
      if (chebyshev(bandit.x, bandit.y, you.x, you.y) <= THREAT_RANGE) {
        marks.set(`${bandit.x}:${bandit.y}`, { kind: "march", label: `خطر: ${bandit.label}` });
      }
    }
    const nearest = [...(world.saalik ?? [])]
      .sort((a, b) => chebyshev(a.x, a.y, you.x, you.y) - chebyshev(b.x, b.y, you.x, you.y))
      .slice(0, 2);
    for (const man of nearest) {
      const spot = `${man.x}:${man.y}`;
      if (!marks.has(spot)) marks.set(spot, { kind: "saalik", label: `صعلوك: ${man.name}` });
    }
  }
  for (const march of world.marches) {
    const word =
      march.purpose === "scout"
        ? "طليعة"
        : march.purpose === "spoil"
          ? march.role === "in"
            ? "دخيل"
            : "إسكات"
          : march.role === "in"
            ? "هجوم قادم"
            : march.phase === "return"
              ? "عودة"
              : "مسير";
    marks.set(`${march.toX}:${march.toY}`, { kind: "march", label: `${word}: ${march.attackerName}` });
  }
  for (const clash of world.clashes ?? []) {
    marks.set(`${clash.x}:${clash.y}`, {
      kind: "clash",
      label: `معركة: ${clashCaption(clash.attacker, clash.defender)}`,
    });
  }
  const latestClash = (world.clashes ?? [])[0] ?? null;
  const caption = latestClash && latestClash.id !== readClash ? latestClash : null;
  const pins = [...marks.entries()].map(([key, mark]) => {
    const [x, y] = key.split(":").map(Number);
    return { x, y, ...mark };
  });
  const centerX = cam.x + box.w / cell / 2;
  const centerY = cam.y + box.h / cell / 2;
  const edges = pins
    .map((pin) => ({ pin, ...edgeSpot(pin.x, pin.y, centerX, centerY, box.w, box.h, cell) }))
    .filter((item) => item.off)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 4);

  return (
    <div
      ref={frame}
      dir="ltr"
      className="map-frame relative h-full min-h-64 w-full touch-none overflow-hidden bg-bg select-none"
      style={{ ["--cell" as string]: `${cell}px` }}
      onPointerDown={(e) => {
        frame.current?.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size >= 2) {
          const [a, b] = [...pointers.current.values()];
          pinch.current = { dist: Math.max(8, Math.hypot(a.x - b.x, a.y - b.y)), cell: cellRef.current };
          drag.current = null;
          return;
        }
        drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cx: camRef.current.x, cy: camRef.current.y, moved: false };
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch.current && pointers.current.size >= 2) {
          const [a, b] = [...pointers.current.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          setCell(clamp((pinch.current.cell * dist) / pinch.current.dist, 32, 72));
          return;
        }
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const dx = e.clientX - d.sx;
        const dy = e.clientY - d.sy;
        if (Math.hypot(dx, dy) > 6) d.moved = true;
        const el = frame.current;
        const size = cellRef.current;
        setCam(clampCamera(d.cx - dx / size, d.cy - dy / size, (el?.clientWidth ?? 0) / size, (el?.clientHeight ?? 0) / size, WORLD));
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size < 2) pinch.current = null;
        const d = drag.current;
        if (d?.id === e.pointerId) drag.current = null;
        if (!d || d.id !== e.pointerId || d.moved || pinch.current || !frame.current) return;
        const rect = frame.current.getBoundingClientRect();
        const current = camRef.current;
        const size = cellRef.current;
        const gx0 = Math.floor(current.x);
        const gy0 = Math.floor(current.y);
        const gox = -(current.x - gx0) * size;
        const goy = -(current.y - gy0) * size;
        const gx = gx0 + Math.floor((e.clientX - rect.left - gox) / size);
        const gy = gy0 + Math.floor((e.clientY - rect.top - goy) / size);
        if (gx >= 0 && gy >= 0 && gx < WORLD && gy < WORLD) onSelect(gx, gy);
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size < 2) pinch.current = null;
        if (drag.current?.id === e.pointerId) drag.current = null;
      }}
    >
      <div className="absolute top-0 left-0" style={{ transform: `translate(${ox}px, ${oy}px)` }}>
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex">
            {Array.from({ length: cols }, (_, col) => {
              const x = x0 + col;
              const y = y0 + row;
              if (x < 0 || y < 0 || x >= WORLD || y >= WORLD) {
                return <div key={col} className="cell bg-bg" />;
              }
              const terrain = terrainAt(x, y);
              const camp = campAt(x, y);
              const bandit = banditAt(x, y);
              const outlaw = saalikAt(x, y);
              const pasture = pastureAt.get(`${x}:${y}`);
              const land = pasture?.dispute
                ? "cell-dispute"
                : pasture?.own && pasture.silent
                  ? "cell-silent"
                  : pasture?.own
                    ? "cell-mine"
                    : pasture?.foreign && pasture.silent
                      ? "cell-silent-foreign"
                      : pasture?.foreign
                        ? "cell-foreign"
                        : "";
              const picked = selected?.x === x && selected?.y === y;
              const mark = marks.get(`${x}:${y}`);
              const pending = you?.chain.claim;
              const claiming = pending?.x === x && pending?.y === y;
              return (
                <div
                  key={col}
                  className={`cell cell-${terrain} ${land} ${camp ? "cell-camp" : ""} ${picked ? "cell-pick" : ""} ${mark?.kind === "clash" ? "cell-fight" : ""}`}
                  title={camp ? camp.name : undefined}
                >
                  {mark && (
                    <span
                      className={mark.kind === "clash" ? "pin pin-fight" : mark.kind === "saalik" ? "pin pin-saalik" : "pin pin-march"}
                      aria-label={mark.label}
                    >
                      {mark.kind === "clash" ? "قتال" : ""}
                    </span>
                  )}
                  {camp && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="flex items-center gap-0.5">
                        <TribeBanner name={camp.name} />
                        <TentMark own={camp.own} peace={camp.peace} />
                      </span>
                      <span data-testid="tile-name" dir="rtl" className="tile-name mt-0.5 rounded-sm bg-bg/90 px-1 text-fg">{camp.name}</span>
                      {camp.structures > 1 && (
                        <span className="mt-0.5 flex gap-0.5" aria-hidden="true">
                          {Array.from({ length: Math.min(camp.structures, 5) }, (_, i) => (
                            <span key={i} className="size-1 rounded-full bg-accent" />
                          ))}
                        </span>
                      )}
                    </div>
                  )}
                  {bandit && !camp && (
                    <div className="absolute inset-0 grid place-items-center">
                      <span className="grid size-6 place-items-center rounded-sm bg-danger text-xs font-medium text-danger-fg">
                        {bandit.tier}
                      </span>
                    </div>
                  )}
                  {outlaw && !camp && !bandit && (
                    <div className="absolute inset-0 grid place-items-center">
                      <span className="grid size-6 place-items-center rounded-full border border-accent bg-bg text-[10px] font-medium text-accent">
                        ص
                      </span>
                    </div>
                  )}
                  {pasture && !camp && !bandit && !outlaw && (
                    <span className="pointer-events-none absolute bottom-0.5 start-1 text-[10px] leading-none text-fg/80">
                      {pasture.good === "water" ? "م" : pasture.good === "food" ? "و" : pasture.good === "wood" ? "ع" : pasture.good === "stone" ? "ك" : "·"}
                    </span>
                  )}
                  {you?.move && you.move.x === x && you.move.y === y && (
                    <span className="absolute inset-1 rounded-sm border border-dashed border-accent" />
                  )}
                  {claiming && <span className="absolute inset-1 rounded-sm border border-dashed border-accent" />}
                </div>
              );
            })}
          </div>
        ))}
        <MotionLayer
          marches={world.marches}
          clashes={world.clashes ?? []}
          x0={x0}
          y0={y0}
          width={cols * cell}
          height={rows * cell}
          cell={cell}
          skew={now - Date.now()}
        />
      </div>
      <div className="pointer-events-none absolute top-2 z-20 flex items-center gap-2 rounded-full border border-line bg-bg/90 px-2 py-1 text-[10px] text-muted" dir="rtl" style={{ insetInlineStart: 8 }}>
        <span className="size-2 rounded-sm bg-accent" />
        سلسلتك
        <span className="size-2 rounded-sm bg-[#c8c2b6]" />
        غيرك
        <span className="size-2 rounded-sm bg-danger" />
        نزاع
      </div>
      <MapNotices world={world} now={now} onFocus={focusAt} />
      {edges.map((edge) => (
        <button
          key={`edge-${edge.pin.kind}-${edge.pin.x}-${edge.pin.y}`}
          type="button"
          dir="rtl"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => focusAt(edge.pin.x, edge.pin.y)}
          style={{ left: edge.left, top: edge.top }}
          className={`absolute z-20 min-h-11 -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 text-xs ${edge.pin.kind === "clash" ? "border-danger bg-danger text-danger-fg" : edge.pin.kind === "saalik" ? "border-accent bg-surface text-accent" : "border-line bg-surface text-fg"}`}
        >
          {edge.pin.kind === "clash" ? "معركة" : edge.pin.kind === "saalik" ? "صعلوك" : "مسير"} · {edge.dist}
        </button>
      ))}
      {caption && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            setReadClash(caption.id);
            focusAt(caption.x, caption.y);
          }}
          className="absolute bottom-3 left-3 z-20 max-w-[16rem] rounded-md border border-line bg-surface/95 px-3 py-2 text-start text-sm text-fg"
        >
          <p className="text-xs text-accent">محاكاة المعركة</p>
          <p className="mt-1 text-pretty">
            {clashCaption(caption.attacker, caption.defender)}
          </p>
          <p className={caption.attackerWins ? "text-accent" : "text-danger"}>{caption.summary}</p>
        </button>
      )}
      <div className="absolute end-2 bottom-3 z-20 flex flex-col gap-1" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" aria-label="تكبير" onClick={() => setCell((size) => clamp(size + 8, 32, 72))} className="grid size-11 place-items-center rounded-md border border-line bg-surface/95 text-fg">
          +
        </button>
        <button type="button" onClick={recenter} className="grid h-11 w-11 place-items-center rounded-md border border-line bg-surface/95 text-[10px] leading-tight text-fg">
          مضاربي
        </button>
        <button type="button" aria-label="تصغير" onClick={() => setCell((size) => clamp(size - 8, 32, 72))} className="grid size-11 place-items-center rounded-md border border-line bg-surface/95 text-fg">
          −
        </button>
      </div>
    </div>
  );
}

function edgeSpot(x: number, y: number, centerX: number, centerY: number, width: number, height: number, cell: number) {
  const dx = (x + 0.5 - centerX) * cell;
  const dy = (y + 0.5 - centerY) * cell;
  const pad = 36;
  const maxX = Math.max(1, width / 2 - pad);
  const maxY = Math.max(1, height / 2 - pad);
  const scale = Math.max(Math.abs(dx) / maxX, Math.abs(dy) / maxY, 1);
  return {
    off: scale > 1.05,
    left: width / 2 + dx / scale,
    top: height / 2 + dy / scale,
    dist: chebyshev(Math.round(centerX), Math.round(centerY), x, y),
  };
}

function TentMark({ own, peace }: { own: boolean; peace: boolean }) {
  const fill = own ? "var(--color-accent)" : "var(--color-fg)";
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">
      <path d="M1 15 L11 1 L21 15 Z" fill={fill} opacity={own ? 1 : 0.8} />
      <path d="M11 6 L11 15" stroke="var(--color-bg)" strokeWidth="1.4" />
      {peace && <circle cx="18" cy="3" r="2.2" fill="var(--color-oasis)" />}
    </svg>
  );
}

const CLASH_MS = 6400;

type LiveClash = { clash: PublicClash; born: number };

function marchColor(role: PublicMarch["role"]) {
  if (role === "in") return "var(--color-danger)";
  if (role === "watch") return "var(--color-muted)";
  return "var(--color-accent)";
}

function MotionLayer({
  marches,
  clashes,
  x0,
  y0,
  width,
  height,
  cell,
  skew,
}: {
  marches: PublicMarch[];
  clashes: PublicClash[];
  x0: number;
  y0: number;
  width: number;
  height: number;
  cell: number;
  skew: number;
}) {
  const skewRef = useRef(skew);
  skewRef.current = skew;
  const known = useRef<Map<number, LiveClash>>(new Map());
  const [anim, setAnim] = useState(() => Date.now());
  const [live, setLive] = useState<LiveClash[]>([]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const step = reduce ? 400 : 80;
    const id = window.setInterval(() => setAnim(Date.now() + skewRef.current), step);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const born = Date.now();
    let added = false;
    for (const clash of clashes) {
      if (known.current.has(clash.id)) continue;
      known.current.set(clash.id, { clash, born });
      added = true;
    }
    if (added) setLive([...known.current.values()]);
  }, [clashes]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const nowMs = Date.now();
      for (const [idKey, item] of known.current) {
        if (nowMs - item.born > CLASH_MS + 400) known.current.delete(idKey);
      }
      setLive([...known.current.values()]);
    }, 400);
    return () => window.clearInterval(id);
  }, []);

  const clock = Date.now();
  const showing = live.filter((item) => clock - item.born < CLASH_MS);

  return (
    <>
      <svg className="pointer-events-none absolute inset-0 overflow-visible" width={width} height={height}>
        {marches.map((march) => {
          const t = progress(march, anim);
          const x1 = (march.fromX - x0) * cell + cell / 2;
          const y1 = (march.fromY - y0) * cell + cell / 2;
          const x2 = (march.toX - x0) * cell + cell / 2;
          const y2 = (march.toY - y0) * cell + cell / 2;
          const mx = x1 + (x2 - x1) * t;
          const my = y1 + (y2 - y1) * t;
          const ang = Math.atan2(y2 - y1, x2 - x1);
          const px = Math.cos(ang + Math.PI / 2);
          const py = Math.sin(ang + Math.PI / 2);
          const color = marchColor(march.role);
          return (
            <g key={march.id}>
              <line className="march-dash" x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1.5" />
              {[-1, 0, 1].map((slot) => (
                <circle key={slot} cx={mx + px * slot * 5} cy={my + py * slot * 5 - t * 0} r={slot === 0 ? 3.5 : 2.4} fill={color} />
              ))}
            </g>
          );
        })}
        {showing.map((item) => {
          const age = (clock - item.born) / CLASH_MS;
          const approach = Math.min(1, age / 0.42);
          const cx = (item.clash.x - x0) * cell + cell / 2;
          const cy = (item.clash.y - y0) * cell + cell / 2;
          const dist = 26 * (1 - approach);
          const atk = item.clash.attackerWins ? "var(--color-accent)" : "var(--color-danger)";
          const def = item.clash.attackerWins ? "var(--color-danger)" : "var(--color-accent)";
          return (
            <g key={item.clash.id}>
              {age > 0.38 && <circle className="clash-ring" cx={cx} cy={cy} r={cell * 0.42} fill="none" stroke="var(--color-danger)" strokeWidth="2.5" />}
              {[-1, 0, 1].map((slot) => (
                <circle key={`a${slot}`} cx={cx - dist} cy={cy + slot * 5} r="2.6" fill={atk} />
              ))}
              {[-1, 0, 1].map((slot) => (
                <circle key={`d${slot}`} cx={cx + dist} cy={cy + slot * 5} r="2.6" fill={def} />
              ))}
            </g>
          );
        })}
      </svg>
    </>
  );
}

function MapNotices({
  world,
  now,
  onFocus,
}: {
  world: WorldSnapshot;
  now: number;
  onFocus: (x: number, y: number) => void;
}) {
  const incoming = world.marches
    .filter((march) => march.role === "in")
    .sort((a, b) => a.arriveAt - b.arriveAt);
  const outgoing = world.marches.find((march) => march.role === "out" && march.phase === "march");
  const lead = incoming[0];
  if (!lead && !outgoing) return null;
  return (
    <div className="pointer-events-none absolute inset-x-2 top-11 z-20">
      {lead ? (
        <button
          type="button"
          dir="rtl"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onFocus(lead.toX, lead.toY)}
          className="pointer-events-auto min-h-11 w-full truncate rounded-md border border-danger bg-surface/95 px-3 text-start text-sm text-danger"
        >
          {lead.attackerName} يصل خلال {fmtRemain(Math.max(0, lead.arriveAt - now))}
          {incoming.length > 1 ? ` · ${incoming.length}` : ""}
        </button>
      ) : outgoing ? (
        <button
          type="button"
          dir="rtl"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onFocus(outgoing.toX, outgoing.toY)}
          className="pointer-events-auto min-h-11 w-full truncate rounded-md border border-line bg-surface/95 px-3 text-start text-sm text-accent"
        >
          {outgoing.purpose === "scout" ? "طليعتك" : outgoing.purpose === "spoil" ? "إسكاتك" : "مسيرك"} نحو {outgoing.targetName} ·{" "}
          {fmtRemain(Math.max(0, outgoing.arriveAt - now))}
        </button>
      ) : null}
    </div>
  );
}
