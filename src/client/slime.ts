// Bounded normalized trails survive resize/refresh. Pixels are erased on the
// canvas, not hidden with a class; no React updates on pointer movement.
export interface WipePoint {
  x: number;
  y: number;
}
export interface SlimeProgress {
  trails: WipePoint[][];
  strokes: number;
  distance: number;
  keyboardSteps: number;
  complete: boolean;
}
export const emptySlime = (): SlimeProgress => ({
  trails: [],
  strokes: 0,
  distance: 0,
  keyboardSteps: 0,
  complete: false,
});
export function readSlime(key: string): SlimeProgress {
  try {
    const p = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      p &&
      Array.isArray(p.trails) &&
      p.trails.length <= 12 &&
      p.trails.every(
        (t: unknown) =>
          Array.isArray(t) &&
          t.length <= 64 &&
          t.every(
            (v: WipePoint) =>
              v &&
              Number.isFinite(v.x) &&
              Number.isFinite(v.y) &&
              v.x >= 0 &&
              v.x <= 1 &&
              v.y >= 0 &&
              v.y <= 1,
          ),
      ) &&
      Number.isInteger(p.strokes) &&
      p.strokes >= 0 &&
      p.strokes <= 12 &&
      Number.isFinite(p.distance) &&
      p.distance >= 0 &&
      Number.isInteger(p.keyboardSteps) &&
      p.keyboardSteps >= 0 &&
      p.keyboardSteps <= 4 &&
      typeof p.complete === "boolean"
    )
      return p;
  } catch {
    /* Browser visual state is best effort. */
  }
  return emptySlime();
}
export function drawSlime(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  trails: WipePoint[][],
  layer = false,
): number {
  if (!layer) ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
  ctx.save();
  ctx.scale(width / 100, height / 100);
  const blob = new Path2D(
    "M9 40C-1 13 27 0 42 15C59-3 86 11 84 31C109 36 97 61 86 67C90 96 64 103 48 85C25 108 7 83 17 66C-3 65-1 44 9 40Z",
  );
  const green = ctx.createLinearGradient(0, 0, 75, 100);
  green.addColorStop(0, layer ? "rgba(162,233,33,.98)" : "rgba(162,233,33,.84)");
  green.addColorStop(1, layer ? "rgba(54,132,18,.99)" : "rgba(54,132,18,.91)");
  ctx.fillStyle = green;
  ctx.fill(blob);
  ctx.fillStyle = "rgba(237,255,186,.5)";
  ctx.beginPath();
  ctx.ellipse(32, 28, 12, 5, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(32,94,10,.35)";
  for (const [x, y, r] of [
    [68, 43, 7],
    [36, 65, 5],
    [64, 74, 4],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  const initial = layer ? 0 : alphaPixels(ctx, width, height);
  for (const trail of trails)
    for (let i = 1; i < trail.length; i++)
      eraseSlime(ctx, width, height, trail[i - 1], trail[i]);
  return initial;
}
export function eraseSlime(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  a: WipePoint,
  b: WipePoint,
) {
  ctx.globalCompositeOperation = "destination-out";
  // Height-scaled wiping clears two broad horizontal passes consistently,
  // including tall patches caused by long mobile answers.
  ctx.lineWidth = height * 0.3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(a.x * width, a.y * height);
  ctx.lineTo(b.x * width, b.y * height);
  ctx.stroke();
}
function alphaPixels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): number {
  const data = ctx.getImageData(0, 0, width, height).data;
  let count = 0;
  // At most 4096 samples, once per completed stroke/resize, not per frame.
  const step = Math.max(1, Math.ceil((width * height) / 4096));
  for (let pixel = 0; pixel < width * height; pixel += step)
    if (data[pixel * 4 + 3] > 30) count++;
  return count;
}
export function clearedFraction(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  initial: number,
): number {
  return initial
    ? Math.max(0, Math.min(1, 1 - alphaPixels(ctx, width, height) / initial))
    : 0;
}
export function slimeComplete(
  progress: SlimeProgress,
  erased: number,
  steps?: number,
): boolean {
  return (
    progress.keyboardSteps >= (steps ?? 4) ||
    (progress.strokes >= (steps === 4 ? 3 : 2) &&
      progress.distance >= (steps === 4 ? 1.8 : 1.25) && erased >= 0.45)
  );
}
