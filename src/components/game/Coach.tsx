import { useEffect, useState } from "react";
import { coachLesson, type CoachLesson } from "@/lib/game/coach";
import type { WorldSnapshot } from "@/lib/game/types";
import { Btn } from "./ui";

export function CoachCard({
  world,
  acked,
  boot,
  onHide,
  onAck,
  onGo,
  onClaim,
}: {
  world: WorldSnapshot;
  acked: readonly string[];
  boot: number;
  onHide: () => void;
  onAck: (id: string) => void;
  onGo: (lesson: CoachLesson) => void;
  onClaim: (id: string) => void;
}) {
  const lesson = coachLesson(world, acked);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    setOpen(true);
  }, [boot]);
  return (
    <section className="border-b border-line border-s-2 border-s-accent bg-surface px-3 py-2" aria-label="المرشد">
      <div className="flex items-start gap-2">
        <button type="button" onClick={() => setOpen((value) => !value)} className="min-w-0 flex-1 text-start">
          <p className="text-[11px] text-accent">
            المرشد · الخطوة {lesson.step} من {lesson.total}
            {lesson.reward ? ` · الهدية ${lesson.reward}` : ""}
          </p>
          <p className="text-sm font-medium">{lesson.title}</p>
        </button>
        <button type="button" onClick={onHide} className="min-h-11 shrink-0 px-1 text-xs text-muted">
          أخفِ
        </button>
      </div>
      <div className="mt-1.5 flex gap-1" aria-hidden="true">
        {Array.from({ length: lesson.total }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i === lesson.step - 1 ? "bg-accent task-dot" : i < lesson.step ? "bg-accent/70" : "bg-line"}`}
          />
        ))}
      </div>
      {open && <p className="mt-2 text-sm text-pretty text-muted">{lesson.body}</p>}
      <div className="mt-2 flex gap-2">
        {lesson.goLabel && (
          <Btn
            className="min-w-0 flex-1 px-3"
            variant={lesson.claim ? "primary" : "ghost"}
            onClick={() => {
              if (lesson.claim) onClaim(lesson.id);
              else {
                if (lesson.ack || lesson.ackOnGo) onAck(lesson.id);
                if (!lesson.ack) onGo(lesson);
              }
            }}
          >
            {lesson.goLabel}
          </Btn>
        )}
        <button type="button" onClick={() => setOpen((value) => !value)} className="min-h-11 shrink-0 px-2 text-xs text-muted">
          {open ? "اطوِ الكلام" : "اقرأ الخطوة"}
        </button>
      </div>
    </section>
  );
}