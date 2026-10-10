import { useEffect, useRef, useState } from "react";
import type { MaskRect } from "./obstruction";
import { SABOTAGE_BALANCE } from "../shared/sabotage";
import { sound } from "./sound";

export function InkBlot({
  id,
  rect,
  onComplete,
  eventKey,
}: {
  id: number;
  rect: MaskRect;
  onComplete: () => void;
  eventKey: string;
}) {
  const [holding, setHolding] = useState(false);
  const [absorbed, setAbsorbed] = useState(false);
  const hold = useRef<{
    timer: ReturnType<typeof setTimeout>;
    pointerId: number | null;
    done: boolean;
  } | null>(null);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  useEffect(
    () => () => {
      if (hold.current) clearTimeout(hold.current.timer);
    },
    [],
  );
  function start(pointerId: number | null) {
    if (hold.current) return;
    setHolding(true);
    const timer = setTimeout(() => {
      if (!hold.current) return;
      hold.current.done = true;
      setAbsorbed(true);
      sound.play("ink-clear", eventKey + ":done", !document.hidden);
      // Keep pointer capture until release, even when the mask has disappeared.
      if (pointerId === null) complete.current();
    }, SABOTAGE_BALANCE.inkHoldMs);
    hold.current = { timer, pointerId, done: false };
  }
  function end(canceled: boolean) {
    const h = hold.current;
    if (!h) return;
    clearTimeout(h.timer);
    hold.current = null;
    setHolding(false);
    if (h.done) complete.current();
    else if (canceled) setAbsorbed(false);
  }
  return (
    <button
      className={`ink-patch hold-ink ${holding ? "is-holding" : ""} ${absorbed ? "is-absorbed" : ""}`}
      aria-label={`Tintafolt ${id + 1}: tartsd lenyomva a tisztításhoz; billentyűzettel Enter`}
      style={
        {
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.width * 100}%`,
          height: `${rect.height * 100}%`,
          "--hold-ms": `${SABOTAGE_BALANCE.inkHoldMs}ms`,
        } as React.CSSProperties
      }
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!hold.current) {
          e.currentTarget.setPointerCapture(e.pointerId);
          start(e.pointerId);
        }
      }}
      onPointerUp={(e) => {
        if (hold.current?.pointerId !== e.pointerId) return;
        e.preventDefault();
        e.stopPropagation();
        end(false);
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => end(true)}
      onLostPointerCapture={() => end(true)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.detail === 0) start(null);
      }}
      onBlur={() => end(true)}
    >
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
        <path d="M4 24 13 12 29 17 37 2 47 13 62 4 70 16 94 10 87 27 99 39 82 44 77 59 61 48 46 57 34 45 14 52 18 37 1 34Z" />
      </svg>
      <span className="ink-hold-ring" aria-hidden="true">
        ◌
      </span>
      <span className="sr-only" role="status">
        {absorbed ? "A tintafolt eltűnt." : holding ? "Tinta felszívása…" : ""}
      </span>
    </button>
  );
}
