import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PlayerEffects } from "../shared/sabotage";
import { obstructionLayout, type TextRegion } from "./obstruction";
import { SlimeSurface } from "./SlimeSurface";
import { InkBlot } from "./InkBlot";

export function ObstructionLayer({
  effects,
  slimeActive,
  inkActive,
  phaseId,
  storageKey,
  slimeCleared,
  clearedInk,
  onSlime,
  onInk,
}: {
  effects: PlayerEffects;
  slimeActive: boolean;
  inkActive: boolean;
  phaseId: string;
  storageKey: string;
  slimeCleared: boolean;
  clearedInk: number[];
  onSlime: () => void;
  onInk: (id: number) => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [text, setText] = useState<TextRegion[]>([]);
  useLayoutEffect(() => {
    const arena = layer.current!.parentElement!;
    const measure = () => {
      const area = arena.getBoundingClientRect();
      if (!area.width || !area.height) return;
      const next = [...arena.querySelectorAll<HTMLElement>(".answer-text")].map(
        (el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const r = range.getBoundingClientRect();
          return {
            index: Number(el.parentElement!.dataset.optionIndex),
            x: (r.x - area.x) / area.width,
            y: (r.y - area.y) / area.height,
            width: r.width / area.width,
            height: r.height / area.height,
          };
        },
      );
      setText((before) =>
        JSON.stringify(before) === JSON.stringify(next) ? before : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(arena);
    arena
      .querySelectorAll(".answer-text")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  // Reserve both masks' space for this phase, even after one type was cleaned.
  // Remaining blots never jump position or expand into newly readable text.
  const layout = useMemo(
    () =>
      obstructionLayout(
        text,
        !!effects.counts.slime,
        effects.inkPatches,
        phaseId,
      ),
    [text, effects.counts.slime, effects.inkPatches, phaseId],
  );
  return (
    <div className="patch-layer" ref={layer}>
      {slimeActive && text.length > 0 && (
        <SlimeSurface
          regions={layout.slime}
          lobes={effects.slimeLobes ?? 6}
          steps={effects.slimeSteps ?? 3}
          storageKey={storageKey}
          cleared={slimeCleared}
          onComplete={onSlime}
        />
      )}
      {inkActive &&
        layout.ink.map(
          (rect, id) =>
            !clearedInk.includes(id) && (
              <InkBlot
                key={id}
                id={id}
                rect={rect}
                onComplete={() => onInk(id)}
                eventKey={`${storageKey}:ink:${id}`}
              />
            ),
        )}
    </div>
  );
}
