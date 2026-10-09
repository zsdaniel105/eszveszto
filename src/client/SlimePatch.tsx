import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  clearedFraction,
  drawSlime,
  eraseSlime,
  readSlime,
  slimeComplete,
  type SlimeProgress,
  type WipePoint,
} from "./slime";
import { sound } from "./sound";
import { SABOTAGE_BALANCE } from "../shared/sabotage";
export function SlimePatch({
  id,
  storageKey,
  onComplete,
  cleared,
}: {
  id: number;
  storageKey: string;
  onComplete: () => void;
  cleared: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [initial] = useState(() => {
    const saved = readSlime(storageKey);
    return { ...saved, complete: saved.complete || cleared };
  });
  const progress = useRef<SlimeProgress>(initial);
  const active = useRef<{
    pointerId: number;
    trail: WipePoint[];
    distance: number;
  } | null>(null);
  const baseline = useRef(0);
  const [status, setStatus] = useState({
    complete: progress.current.complete,
    steps: progress.current.keyboardSteps,
    erased: 0,
  });
  useEffect(() => {
    const surface = canvas.current!;
    const resize = () => {
      const rect = surface.getBoundingClientRect();
      const ratio = Math.min(2, devicePixelRatio || 1);
      surface.width = Math.max(
        1,
        Math.min(512, Math.round(rect.width * ratio)),
      );
      surface.height = Math.max(
        1,
        Math.min(512, Math.round(rect.height * ratio)),
      );
      const ctx = surface.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        baseline.current = drawSlime(
          ctx,
          surface.width,
          surface.height,
          active.current
            ? [...progress.current.trails, active.current.trail]
            : progress.current.trails,
        );
        if (progress.current.complete)
          ctx.clearRect(0, 0, surface.width, surface.height);
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);
  function point(event: PointerEvent<HTMLCanvasElement>): WipePoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.x) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.y) / rect.height)),
    };
  }
  function save(next: SlimeProgress) {
    progress.current = next;
    const surface = canvas.current!,
      ctx = surface.getContext("2d")!;
    const erased = clearedFraction(
      ctx,
      surface.width,
      surface.height,
      baseline.current,
    );
    next.complete = next.complete || slimeComplete(next, erased);
    // Save completion too; never replay a completed task on a wrong guess.
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Optional storage. */
    }
    setStatus({ complete: next.complete, steps: next.keyboardSteps, erased });
    if (next.complete) {
      ctx.clearRect(0, 0, surface.width, surface.height);
      sound.play("slime-complete", storageKey + ":done", !document.hidden);
      onComplete();
    } else sound.play("slime-wipe", undefined, !document.hidden);
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    const gesture = active.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const next = point(event),
      prev = gesture.trail.at(-1)!;
    const distance = Math.hypot(next.x - prev.x, next.y - prev.y);
    if (distance < 0.018 || gesture.trail.length >= 64) return;
    const surface = event.currentTarget;
    eraseSlime(
      surface.getContext("2d")!,
      surface.width,
      surface.height,
      prev,
      next,
    );
    gesture.trail.push(next);
    gesture.distance += distance;
  }
  function finish(event: PointerEvent<HTMLCanvasElement>, canceled = false) {
    const gesture = active.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (!canceled) move(event);
    active.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (gesture.trail.length < 2) return; // A tap erases nothing.
    const p = progress.current;
    save({
      ...p,
      trails: [...p.trails, gesture.trail].slice(-12),
      strokes: Math.min(
        12,
        p.strokes + (!canceled && gesture.distance >= 0.28 ? 1 : 0),
      ),
      distance: p.distance + gesture.distance,
    });
  }
  function keyboardWipe() {
    if (progress.current.complete) return;
    const p = progress.current,
      step = Math.min(4, p.keyboardSteps + 1);
    const trail = [
      { x: 0.03, y: 0.15 + (step - 1) * 0.23 },
      { x: 0.97, y: 0.15 + (step - 1) * 0.23 },
    ];
    const surface = canvas.current!;
    eraseSlime(
      surface.getContext("2d")!,
      surface.width,
      surface.height,
      trail[0],
      trail[1],
    );
    save({
      ...p,
      trails: [...p.trails, trail].slice(-12),
      keyboardSteps: step,
    });
  }
  return (
    <div
      className={`slime-patch wipe-patch ${status.complete ? "is-clean" : ""}`}
      style={{
        left: `${5 + id * 35}%`,
        top: `${18 + (id % 2) * 42}%`,
        width: `${SABOTAGE_BALANCE.patchWidthPercent}%`,
        height: `${SABOTAGE_BALANCE.slimeHeightPercent}%`,
      }}
    >
      <canvas
        ref={canvas}
        aria-hidden="true"
        data-cleared={status.erased.toFixed(2)}
        onPointerDown={(event) => {
          if (
            status.complete ||
            active.current ||
            progress.current.trails.length >= 12
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          active.current = {
            pointerId: event.pointerId,
            trail: [point(event)],
            distance: 0,
          };
        }}
        onPointerMove={move}
        onPointerUp={(event) => finish(event)}
        onPointerCancel={(event) => finish(event, true)}
        onLostPointerCapture={(event) => finish(event, true)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      />
      {!status.complete && (
        <button
          className="wipe-alternative"
          onClick={(event) => {
            event.stopPropagation();
            keyboardWipe();
          }}
          aria-label={`Takonyfolt ${id + 1}: akadálymentes törlés (${status.steps}/4)`}
        >
          Törlés {status.steps}/4
        </button>
      )}
    </div>
  );
}
