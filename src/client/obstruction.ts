import { SABOTAGE_BALANCE } from "../shared/sabotage";

export interface MaskRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface TextRegion extends MaskRect {
  index: number;
}
// Normalized answer-text bounds only. No question or answer key enters placement.
export function obstructionLayout(
  text: TextRegion[],
  slime: boolean,
  ink: number,
  seed: string,
) {
  const offset = [...seed].reduce(
    (n, c) => (n * 31 + c.charCodeAt(0)) >>> 0,
    0,
  );
  const ordered = [...text].sort((a, b) => a.index - b.index);
  const fragment = (
    r: TextRegion,
    fraction: number,
    right: boolean,
  ): MaskRect => ({
    x: r.x + (right ? r.width * (1 - fraction) : 0),
    y: r.y + r.height * 0.06,
    width: r.width * fraction,
    height: r.height * 0.88,
  });
  const slimeRects = slime
    ? ordered.map((r) => fragment(r, ink ? 0.43 : 0.85, false))
    : [];
  const inkRects = Array.from(
    { length: Math.min(ink, ordered.length) },
    (_, n) => {
      const r = ordered[(n + offset) % ordered.length];
      return fragment(r, slime ? 0.29 : 0.43, slime || !!((offset + n) % 2));
    },
  );
  // Touch hit areas may be larger; only visible masks consume this budget.
  const area = [...slimeRects, ...inkRects].reduce(
    (n, r) => n + r.width * r.height,
    0,
  );
  const scale = Math.min(
    1,
    Math.sqrt(SABOTAGE_BALANCE.maxObstructionFraction / (area || 1)),
  );
  const bounded = (r: MaskRect) => ({
    x: r.x + (r.width * (1 - scale)) / 2,
    y: r.y + (r.height * (1 - scale)) / 2,
    width: r.width * scale,
    height: r.height * scale,
  });
  return { slime: slimeRects.map(bounded), ink: inkRects.map(bounded) };
}
