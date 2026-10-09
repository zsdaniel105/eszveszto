import { useEffect, useState } from "react";
export function FullscreenControl() {
  const [active, setActive] = useState(!!document.fullscreenElement);
  const [error, setError] = useState("");
  const supported =
    document.fullscreenEnabled && !!document.documentElement.requestFullscreen;
  useEffect(() => {
    const changed = () => setActive(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  async function toggle() {
    setError("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setError(
        "A böngésző nem engedte a teljes képernyőt. Ablakban is játszhattok.",
      );
    }
  }
  return (
    <div className="fullscreen-control">
      <button
        className="text-button"
        disabled={!supported}
        onClick={() => void toggle()}
        aria-pressed={active}
      >
        {active ? "Kilépés a teljes képernyőből" : "Teljes képernyő"}
      </button>
      {!supported && (
        <small>A teljes képernyő ebben a böngészőben nem érhető el.</small>
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
