import { useEffect, useState, type PointerEvent } from "react";
import type { PublicQuestion, PublicIce, PublicFinale } from "../shared/game";
import { SlimePatch } from "./SlimePatch";
import { IceBarrier } from "./IceBarrier";
import { sound } from "./sound";
import {
  presentationAt,
  SABOTAGE_BALANCE,
  type PlayerEffects,
} from "../shared/sabotage";
interface Clearing {
  phaseId: string;
  slime: number[];
  ink: number[];
  inkHits: Record<number, number>;
}
function readClearing(key: string, phaseId: string): Clearing {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      saved?.phaseId === phaseId &&
      Array.isArray(saved.slime) &&
      Array.isArray(saved.ink) &&
      saved.inkHits &&
      typeof saved.inkHits === "object"
    )
      return saved;
  } catch {
    /* Visual progress is best effort when browser storage is disabled. */
  }
  return { phaseId, slime: [], ink: [], inkHits: {} };
}
export function QuestionEffects({
  question,
  effects,
  now,
  phaseId,
  playerId,
  myAnswer,
  disabled,
  onAnswer,
  ice,
  finale,
  online,
  onIceTap,
  showQuestion = true,
}: {
  question: PublicQuestion;
  effects: PlayerEffects | null;
  now: number;
  phaseId: string;
  playerId: string;
  myAnswer: number | null;
  disabled: boolean;
  onAnswer: (index: number) => void;
  ice: PublicIce | null;
  finale: PublicFinale | null;
  online: boolean;
  onIceTap: () => Promise<void>;
  showQuestion?: boolean;
}) {
  const key = `eszveszto:clearing:${playerId}`;
  const [clearing, setClearing] = useState(() => readClearing(key, phaseId));
  const [attempted, setAttempted] = useState(false);
  const [pointer, setPointer] = useState<{
    id: number;
    x: number;
    y: number;
    pointerId: number;
  } | null>(null);
  const view = presentationAt(effects, now, question.options.length, ice);
  const slimePrefix = `eszveszto:slime:${playerId}:`;
  const slimePhaseKey = `${slimePrefix}${phaseId}:`;
  const expired = !!effects && now >= effects.overlaysUntil;
  useEffect(() => {
    try {
      for (const savedKey of Object.keys(localStorage))
        if (
          savedKey.startsWith(slimePrefix) &&
          (expired || !savedKey.startsWith(slimePhaseKey))
        )
          localStorage.removeItem(savedKey);
    } catch {
      /* Optional browser progress. */
    }
  }, [slimePrefix, slimePhaseKey, expired]);
  useEffect(() => {
    if (view.overlays && effects?.slimePatches)
      sound.play("slime-arrive", slimePhaseKey + "arrival", !document.hidden);
  }, [view.overlays, effects?.slimePatches, slimePhaseKey]);
  const update = (next: Clearing) => {
    setClearing(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* Effects still auto-expire. */
    }
  };
  function hitInk(id: number) {
    const hits = (clearing.inkHits[id] ?? 0) + 1;
    update({
      ...clearing,
      inkHits: { ...clearing.inkHits, [id]: hits },
      ink: hits >= 2 ? [...clearing.ink, id] : clearing.ink,
    });
  }
  function inkDown(event: PointerEvent<HTMLButtonElement>, id: number) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setPointer({
      id,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    });
  }
  function inkUp(event: PointerEvent<HTMLButtonElement>, id: number) {
    // Keep the capturing surface mounted for the entire swipe. Only remove it
    // on release, so a gesture cannot turn into a tap on an underlying answer.
    if (
      pointer?.id === id &&
      pointer.pointerId === event.pointerId &&
      Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) >= 16
    ) {
      event.preventDefault();
      update({ ...clearing, ink: [...clearing.ink, id] });
    }
    setPointer(null);
  }
  const seconds = effects
    ? Math.max(
        0,
        ((view.frozen ? effects.freezeUntil : effects.motionUnlockAt) - now) /
          1000,
      )
        .toFixed(1)
        .replace(".", ",")
    : "0";
  const hasOverlay =
    view.overlays &&
    effects &&
    (effects.slimePatches > clearing.slime.length ||
      effects.inkPatches > clearing.ink.length);
  const b = SABOTAGE_BALANCE;
  return (
    <>
      <div
        className={`effect-status ${view.frozen ? "ice-status" : ""}`}
        role="status"
      >
        {view.locked
          ? view.frozen
            ? `❄️ Fagyasztás! Törd össze a jeget! Legfeljebb ${seconds} mp.`
            : `${effects?.counts.roulette ? "🎰 Rulett" : "🔀 Helycsere"}! ${seconds} mp, és megállnak a válaszok.`
          : view.upsideDown
            ? "🙃 Feje tetejére! Mindjárt helyreállnak a szövegek."
            : hasOverlay
              ? [
                  effects && effects.slimePatches > clearing.slime.length
                    ? "🟢 Töröld több söpréssel! (Tab + 4×Enter)"
                    : "",
                  effects && effects.inkPatches > clearing.ink.length
                    ? "🖋️ Söprés vagy két koppintás"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")
              : effects?.frames.length
                ? "✓ A válaszok megálltak. Válaszolhatsz!"
                : finale
                  ? "Döntő: több esély · hibánként −30 alappont"
                  : attempted
                    ? "Most már válaszolhatsz."
                    : "Egy válasz, egy esély."}
      </div>
      <div className={`effect-arena ${view.frozen ? "is-frozen" : ""}`}>
        {showQuestion && <h1 className="question-prompt">{question.prompt}</h1>}
        {showQuestion && question.image && (
          <img
            className="question-image"
            src={question.image.url}
            alt={question.image.alt}
          />
        )}
        <div className="answer-area">
          <div
            className={`answer-options ${view.upsideDown ? "is-upside-down" : ""} ${view.locked && effects?.frames.length ? `is-rearranging motion-${view.frameIndex % 2}` : ""}`}
            onPointerDownCapture={() => {
              if (view.locked) setAttempted(true);
            }}
          >
            {view.order.map((index) => (
              <button
                key={index}
                data-ui-sound
                className={`answer-card ${myAnswer === index ? "selected" : ""} ${finale?.eliminatedOptions.includes(index) ? "eliminated" : ""}`}
                disabled={
                  disabled ||
                  myAnswer !== null ||
                  finale?.eliminatedOptions.includes(index)
                }
                aria-disabled={
                  view.locked ||
                  disabled ||
                  myAnswer !== null ||
                  finale?.eliminatedOptions.includes(index)
                }
                aria-pressed={myAnswer === index}
                aria-label={
                  finale?.eliminatedOptions.includes(index)
                    ? `${question.options[index]} – kiesett válasz`
                    : undefined
                }
                onClick={() => {
                  if (view.locked) {
                    setAttempted(true);
                    return;
                  }
                  onAnswer(index);
                }}
              >
                <span className="answer-letter">
                  {String.fromCharCode(65 + index)}
                </span>
                <strong className="answer-text">
                  {question.options[index]}
                </strong>
                {finale?.eliminatedOptions.includes(index) && (
                  <span className="answer-marker" aria-hidden="true">
                    ✕
                  </span>
                )}
                {myAnswer === index && (
                  <span className="answer-marker" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
          {ice && (
            <IceBarrier
              ice={ice}
              active={view.frozen}
              online={online}
              onTap={onIceTap}
            />
          )}
          {view.overlays && effects && (
            <div className="patch-layer">
              {Array.from({ length: effects.slimePatches }, (_, id) => (
                <SlimePatch
                  key={`slime-${id}`}
                  id={id}
                  cleared={clearing.slime.includes(id)}
                  storageKey={`${slimePhaseKey}${id}`}
                  onComplete={() => {
                    if (!clearing.slime.includes(id))
                      update({ ...clearing, slime: [...clearing.slime, id] });
                  }}
                />
              ))}
              {Array.from(
                { length: effects.inkPatches },
                (_, id) =>
                  !clearing.ink.includes(id) && (
                    <button
                      key={`ink-${id}`}
                      className={`ink-patch ${(clearing.inkHits[id] ?? 0) > 0 ? "dispersing" : ""}`}
                      aria-label={`Tintafolt ${id + 1}: söprés vagy két megnyomás (${clearing.inkHits[id] ?? 0}/2)`}
                      style={{
                        left: `${5 + id * 35}%`,
                        top: `${40 + (id % 2) * 42}%`,
                        width: `${b.patchWidthPercent}%`,
                        height: `${b.inkHeightPercent}%`,
                      }}
                      onPointerDown={(e) => inkDown(e, id)}
                      onPointerUp={(e) => inkUp(e, id)}
                      onPointerCancel={() => setPointer(null)}
                      onClick={() => {
                        if (!clearing.ink.includes(id)) hitInk(id);
                      }}
                    >
                      <svg
                        viewBox="0 0 80 80"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <path d="M40 9 48 19 68 9 61 30 79 38 62 48 70 69 48 62 39 79 28 62 9 69 18 48 1 38 20 29 11 9 31 19Z" />
                      </svg>
                      <span aria-hidden="true">
                        {clearing.inkHits[id] ? "1/2" : "↔"}
                      </span>
                    </button>
                  ),
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
