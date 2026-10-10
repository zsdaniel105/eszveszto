import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  clearedFraction,
  drawSlime,
  eraseSlime,
  readSlime,
  slimeComplete,
  type WipePoint,
} from "./slime";
import type { MaskRect } from "./obstruction";
import { sound } from "./sound";

// One canvas and one clearing budget for the entire splash, not per lobe.
export function SlimeSurface({
  regions,
  lobes,
  steps,
  storageKey,
  cleared,
  onComplete,
}: {
  regions: MaskRect[];
  lobes: number;
  steps: number;
  storageKey: string;
  cleared: boolean;
  onComplete: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [initial] = useState(() => readSlime(storageKey));
  const progress = useRef({
    ...initial,
    complete: initial.complete || cleared,
  });
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
  const latest = useRef({ regions, lobes, steps });
  latest.current = { regions, lobes, steps };

  function paint() {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const [i, r] of latest.current.regions.entries()) {
      const count =
        Math.floor(latest.current.lobes / latest.current.regions.length) +
        (i < latest.current.lobes % latest.current.regions.length ? 1 : 0);
      // Organic lobes overlap within each text mask. Only six/eight shapes,
      // independently of how many attacks are recorded.
      for (let n = 0; n < count; n++) {
        ctx.save();
        const width = r.width / (count - 0.15);
        ctx.translate(
          (r.x + (count > 1 ? (n * (r.width - width)) / (count - 1) : 0)) *
            c.width,
          r.y * c.height,
        );
        drawSlime(
          ctx,
          Math.min(r.width, width) * c.width,
          r.height * c.height,
          [],
          true,
        );
        ctx.restore();
      }
    }
    // Sample only once per stroke/resize, never per pointer frame.
    baseline.current = maskPixels(ctx, c.width, c.height);
    for (const trail of [
      ...progress.current.trails,
      ...(active.current ? [active.current.trail] : []),
    ])
      for (let i = 1; i < trail.length; i++)
        eraseSlime(ctx, c.width, c.height, trail[i - 1], trail[i]);
    if (progress.current.keyboardSteps) {
      ctx.globalCompositeOperation = "destination-out";
      for (const r of latest.current.regions)
        ctx.clearRect(
          r.x * c.width,
          r.y * c.height,
          (r.width * c.width * progress.current.keyboardSteps) /
            latest.current.steps,
          r.height * c.height,
        );
    }
    if (progress.current.complete) ctx.clearRect(0, 0, c.width, c.height);
  }
  useEffect(() => {
    const c = canvas.current!;
    const resize = () => {
      const box = c.getBoundingClientRect(),
        ratio = Math.min(2, devicePixelRatio || 1);
      c.width = Math.max(1, Math.min(768, Math.round(box.width * ratio)));
      c.height = Math.max(1, Math.min(768, Math.round(box.height * ratio)));
      paint();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(c);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    paint();
  }, [regions, lobes]);
  function point(e: PointerEvent): WipePoint {
    const rect = canvas.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.x) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.y) / rect.height)),
    };
  }
  function save() {
    const c = canvas.current!,
      p = progress.current;
    const erased = clearedFraction(
      c.getContext("2d")!,
      c.width,
      c.height,
      baseline.current,
    );
    p.complete ||= slimeComplete(p, erased, steps);
    try {
      localStorage.setItem(storageKey, JSON.stringify(p));
    } catch {
      /* Optional visual progress. */
    }
    setStatus({ complete: p.complete, steps: p.keyboardSteps, erased });
    if (p.complete) {
      c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
      sound.play("slime-complete", storageKey + ":done", !document.hidden);
      onComplete();
    } else sound.play("slime-wipe", undefined, !document.hidden);
  }
  function move(e: PointerEvent) {
    const g = active.current;
    if (!g || g.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const next = point(e),
      prev = g.trail.at(-1)!;
    const distance = Math.hypot(next.x - prev.x, next.y - prev.y);
    if (distance < 0.012 || g.trail.length >= 64) return;
    const c = canvas.current!;
    eraseSlime(c.getContext("2d")!, c.width, c.height, prev, next);
    g.trail.push(next);
    g.distance += distance;
  }
  function finish(e: PointerEvent, canceled = false) {
    const g = active.current;
    if (!g || g.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    if (!canceled) move(e);
    active.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (g.trail.length < 2) return;
    const p = progress.current;
    p.trails = [...p.trails, g.trail].slice(-12);
    p.strokes = Math.min(
      12,
      p.strokes + (!canceled && g.distance >= 0.28 ? 1 : 0),
    );
    p.distance = Math.min(32, p.distance + g.distance);
    save();
  }
  return (
    <div
      className={`slime-surface wipe-patch ${status.complete ? "is-clean" : ""}`}
      data-lobes={lobes}
    >
      <canvas
        ref={canvas}
        aria-hidden="true"
        data-cleared={status.erased.toFixed(2)}
      />
      {regions.map((r, i) => (
        <div
          key={i}
          className="wipe-hit"
          style={{
            left: `${r.x * 100}%`,
            top: `${r.y * 100}%`,
            width: `${r.width * 100}%`,
            height: `${r.height * 100}%`,
          }}
          onPointerDown={(e) => {
            if (status.complete || active.current) return;
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            active.current = {
              pointerId: e.pointerId,
              trail: [point(e)],
              distance: 0,
            };
          }}
          onPointerMove={move}
          onPointerUp={(e) => finish(e)}
          onPointerCancel={(e) => finish(e, true)}
          onLostPointerCapture={(e) => finish(e, true)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      ))}
      {!status.complete && (
        <button
          className="wipe-alternative"
          aria-label={`Takony: akadálymentes törlés (${status.steps}/${steps})`}
          onClick={(e) => {
            e.stopPropagation();
            progress.current.keyboardSteps = Math.min(
              steps,
              progress.current.keyboardSteps + 1,
            );
            paint();
            save();
          }}
        >
          Törlés {status.steps}/{steps}
        </button>
      )}
    </div>
  );
}
function maskPixels(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const data = ctx.getImageData(0, 0, w, h).data;
  const step = Math.max(1, Math.ceil((w * h) / 4096));
  let n = 0;
  for (let i = 0; i < w * h; i += step) if (data[i * 4 + 3] > 30) n++;
  return n;
}
