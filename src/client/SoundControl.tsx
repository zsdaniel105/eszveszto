import { useEffect, useSyncExternalStore } from "react";
import { sound } from "./sound";
export function SoundControl() {
  const muted = useSyncExternalStore(sound.subscribe, sound.getMuted);
  useEffect(() => {
    const gesture = (event: Event) => {
      if (
        event instanceof KeyboardEvent &&
        event.key !== "Enter" &&
        event.key !== " "
      )
        return;
      void sound.unlock(event.isTrusted);
    };
    const selected = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLButtonElement>(
        "button[data-ui-sound]",
      );
      if (
        button &&
        !button.disabled &&
        button.getAttribute("aria-disabled") !== "true"
      )
        sound.play("select", undefined, !document.hidden);
    };
    const visibility = () => {
      if (document.hidden) sound.suspend();
    };
    document.addEventListener("pointerdown", gesture, true);
    document.addEventListener("keydown", gesture, true);
    document.addEventListener("click", selected);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("pointerdown", gesture, true);
      document.removeEventListener("keydown", gesture, true);
      document.removeEventListener("click", selected);
      document.removeEventListener("visibilitychange", visibility);
      sound.suspend();
    };
  }, []);
  return (
    <button
      className="sound-control"
      aria-label={muted ? "Hang bekapcsolása" : "Hang kikapcsolása"}
      aria-pressed={muted}
      onClick={(event) => {
        sound.toggle();
        void sound.unlock(event.isTrusted);
      }}
    >
      <span aria-hidden="true">{muted ? "♩̸" : "♪"}</span>
      <small>{muted ? "Néma" : "Hang"}</small>
    </button>
  );
}
