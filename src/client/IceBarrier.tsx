import { useRef, useState } from "react";
import type { PublicIce } from "../shared/game";
export function IceBarrier({
  ice,
  active,
  online,
  onTap,
}: {
  ice: PublicIce;
  active: boolean;
  online: boolean;
  onTap: () => Promise<void>;
}) {
  const [pending, setPending] = useState<number[]>([]);
  const [error, setError] = useState("");
  const nextTap = useRef(-Infinity);
  const pendingRef = useRef<number[]>([]);
  const cracks = Math.max(ice.acceptedTaps, ...pending, 0);
  function tap() {
    if (!active || !online || performance.now() < nextTap.current) return;
    const target = Math.max(ice.acceptedTaps, ...pendingRef.current, 0) + 1;
    if (target > ice.requiredTaps) return;
    nextTap.current = performance.now() + 100;
    pendingRef.current = [...pendingRef.current, target];
    setPending(pendingRef.current);
    setError("");
    void onTap()
      .catch((e) =>
        setError(
          e instanceof Error
            ? e.message
            : "Nem érkezett visszajelzés. Próbáld újra!",
        ),
      )
      .finally(() => {
        pendingRef.current = pendingRef.current.filter((n) => n !== target);
        setPending([...pendingRef.current]);
      });
  }
  return (
    <>
      <button
        className={`ice-barrier ${!active ? (ice.broken ? "ice-shattered" : "ice-melted") : ""}`}
        disabled={!active || !online}
        aria-busy={pending.length > 0}
        onClick={tap}
        aria-label={`Törd össze a jeget! Jég feltörése: ${ice.acceptedTaps}/${ice.requiredTaps}`}
      >
        <svg
          viewBox="0 0 300 180"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {Array.from({ length: Math.min(7, cracks) }, (_, n) => (
            <path
              key={n}
              className="ice-crack"
              d={
                [
                  "M150 0 144 39 167 67 129 97 151 180",
                  "M0 63 66 58 104 91 159 86 212 127 300 116",
                  "M300 24 234 48 216 83 170 70 145 107 77 130 55 180",
                  "M25 0 70 38 58 74 89 102 74 160 99 180",
                  "M215 180 231 149 213 121 249 94 240 52 277 0",
                  "M115 0 106 27 130 53 91 67 108 107 52 118 0 145",
                  "M300 163 259 141 272 117 207 93 190 42 163 28 170 0",
                ][n]
              }
            />
          ))}
        </svg>
        <span className="sr-only">❄️ Törd össze a jeget!</span>
        <small className="sr-only">
          Jég: {ice.acceptedTaps}/{ice.requiredTaps}
          {pending.length ? " · Küldés…" : ""}
        </small>
      </button>
      {error && active && (
        <span className="ice-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
