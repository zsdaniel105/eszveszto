import { useLayoutEffect } from "react";

// Attribute-only locking leaves the caller's inline styles untouched. The
// lifetime is GameView, including reconnects, but excludes lobby/entry/error views.
export function useGameViewport() {
  useLayoutEffect(() => {
    const elements = [document.documentElement, document.body];
    const previous = elements.map((el) => el.getAttribute("data-gameplay"));
    elements.forEach((el) => el.setAttribute("data-gameplay", ""));
    window.scrollTo(0, 0);
    return () =>
      elements.forEach((el, i) => {
        if (previous[i] === null) el.removeAttribute("data-gameplay");
        else el.setAttribute("data-gameplay", previous[i]!);
      });
  }, []);
}
