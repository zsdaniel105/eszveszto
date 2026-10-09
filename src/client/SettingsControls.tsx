import { DIFFICULTIES, type Action, type PublicRoom } from "../shared/game";
export function SettingsControls({
  room,
  disabled,
  onAction,
}: {
  room: PublicRoom;
  disabled: boolean;
  onAction: (action: Action) => Promise<void>;
}) {
  return (
    <>
      <fieldset disabled={disabled}>
        <legend>Kérdések száma</legend>
        <div className="segmented">
          {([6, 12, 18] as const).map((n) => (
            <button
              type="button"
              key={n}
              aria-pressed={room.settings.questionCount === n}
              onClick={() =>
                void onAction({
                  type: "settings",
                  value: { ...room.settings, questionCount: n },
                })
              }
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>Nehézség</legend>
        <div className="difficulty-options">
          {(Object.keys(DIFFICULTIES) as (keyof typeof DIFFICULTIES)[]).map(
            (d) => (
              <button
                type="button"
                key={d}
                aria-pressed={room.settings.difficulty === d}
                onClick={() =>
                  void onAction({
                    type: "settings",
                    value: { ...room.settings, difficulty: d },
                  })
                }
              >
                <span>{DIFFICULTIES[d]}</span>
                <span aria-hidden="true">
                  {d === "easy" ? "◉○○" : d === "normal" ? "◉◉○" : "◉◉◉"}
                </span>
              </button>
            ),
          )}
        </div>
      </fieldset>
    </>
  );
}
