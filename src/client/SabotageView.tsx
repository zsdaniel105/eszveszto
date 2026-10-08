import { CharacterPortrait } from "./CharacterPortrait";
import { useState, type CSSProperties } from "react";
import { type Action, type PublicGame } from "../shared/game";
import { abilityById, type AbilityId } from "../shared/sabotage";
export function SabotageSelection({
  game,
  busy,
  disabled,
  onAction,
}: {
  game: PublicGame;
  busy: boolean;
  disabled: boolean;
  onAction: (action: Action) => Promise<void>;
}) {
  const [selected, setSelected] = useState<AbilityId | null>(null);
  const s = game.sabotage!;
  const context = {
    sessionId: game.sessionId,
    phaseId: game.phaseId,
    round: game.round,
  };
  const chosen =
    s.myChoice?.type === "attack" ? abilityById(s.myChoice.abilityId) : null;
  const target =
    s.myChoice?.type === "attack"
      ? game.ranking.find(
          (p) => s.myChoice?.type === "attack" && p.id === s.myChoice.targetId,
        )
      : null;
  if (s.myChoice)
    return (
      <div className="attack-waiting" role="status">
        <span className="attack-big-icon" aria-hidden="true">
          {chosen?.icon ?? "🕊️"}
        </span>
        <h1>
          {busy
            ? "Visszaigazolás érkezik…"
            : chosen
              ? "Támadás rögzítve!"
              : "Ezt a támadást kihagyod."}
        </h1>
        {chosen && (
          <p>
            <strong>{chosen.name}</strong> →{" "}
            {target?.nickname ?? "Korábbi játékos"}
          </p>
        )}
        <p className="game-subtitle">
          Várjuk a többieket. A visszaszámlálás végén automatikusan indul a kör.
        </p>
      </div>
    );
  return (
    <>
      <h1>{selected ? "Ki kapja a meglepetést?" : "Jöhet a szabotázs!"}</h1>
      {!selected ? (
        <>
          <p className="game-subtitle">
            Válassz képességet, aztán ellenfelet! Egy ingyenes támadás, összesen
            10 mp.
          </p>
          <div className="ability-options">
            {s.offers.map((id) => {
              const a = abilityById(id);
              return (
                <button
                  key={id}
                  className="ability-card"
                  data-ui-sound
                  disabled={disabled}
                  style={{ "--ability-color": a.color } as CSSProperties}
                  onClick={() => setSelected(id)}
                >
                  <span aria-hidden="true">{a.icon}</span>
                  <div>
                    <strong>{a.name}</strong>
                    <small>{a.description}</small>
                  </div>
                  <b aria-hidden="true">→</b>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="chosen-ability">
            <span aria-hidden="true">{abilityById(selected).icon}</span>
            <strong>{abilityById(selected).name}</strong>
            <button
              className="text-button"
              disabled={disabled}
              onClick={() => setSelected(null)}
            >
              ← Másik képesség
            </button>
          </div>
          <p className="game-subtitle">
            Koppints az ellenfélre: ezzel elküldöd a támadást.
          </p>
          <div className="target-options">
            {s.targets.map((p) => {
              return (
                <button
                  key={p.id}
                  className="target-card"
                  data-ui-sound
                  aria-label={`Célpont: ${p.nickname}`}
                  disabled={disabled}
                  onClick={() =>
                    void onAction({
                      type: "attack",
                      abilityId: selected,
                      targetId: p.id,
                      ...context,
                    })
                  }
                >
                  <CharacterPortrait character={p.character} />
                  <strong>{p.nickname}</strong>
                  <small>{p.connected ? "Ő kapja!" : "Visszavárjuk"}</small>
                </button>
              );
            })}
          </div>
          {!s.targets.length && (
            <p className="notice info">
              Most nincs elérhető ellenfél. Ezt a támadást kihagyhatod.
            </p>
          )}
        </>
      )}
      <button
        className="secondary wide skip-attack"
        disabled={disabled}
        onClick={() => void onAction({ type: "skip-attack", ...context })}
      >
        {busy ? "Rögzítés…" : "Most nem támadok"}
      </button>
    </>
  );
}
export function AttackSummary({
  game,
  full = false,
}: {
  game: PublicGame;
  full?: boolean;
}) {
  const s = game.sabotage;
  if (!s?.resolved) return null;
  const count = s.incoming.length;
  const summary =
    count === 0
      ? "Most nem támadott meg senki."
      : count === 1
        ? `${abilityById(s.incoming[0].abilityId).name} érkezett!`
        : `${count} játékos támadott meg!`;
  const outgoing = s.outgoing;
  const target = outgoing
    ? game.ranking.find((p) => p.id === outgoing.targetId)
    : null;
  return (
    <div className={full ? "attack-report" : "attack-summary"}>
      <p role="status">
        {count > 1
          ? "⚡ "
          : count === 1
            ? `${abilityById(s.incoming[0].abilityId).icon} `
            : "🛡️ "}
        {summary}
      </p>
      {full && (
        <>
          {s.incoming.length > 0 && (
            <ul className="incoming-list">
              {s.incoming.map((a) => (
                <li key={a.attackerId}>
                  <span aria-hidden="true">
                    {abilityById(a.abilityId).icon}
                  </span>{" "}
                  {game.ranking.find((p) => p.id === a.attackerId)?.nickname ??
                    "Korábbi játékos"}{" "}
                  · {abilityById(a.abilityId).name}
                </li>
              ))}
            </ul>
          )}
          <p className="outgoing-report">
            {outgoing
              ? `${abilityById(outgoing.abilityId).name} → ${target?.nickname ?? "Korábbi játékos"}${outgoing.outcome === "target-left" ? " · A célpont kilépett; a támadás a nyilvántartásban marad." : " · A hatás beleszámít a korlátozott összhatásba."}`
              : s.myChoice?.type === "skip"
                ? s.myChoice.reason === "timeout"
                  ? "Lejárt a választási időd; ezt a támadást kihagytad."
                  : "Ezt a támadást kihagytad."
                : "Ebben a körben nem küldtél támadást."}
          </p>
          {count > 1 && (
            <p className="phase-note">
              Minden támadás beleszámít. A hatások erejét és idejét korlátozzuk.
            </p>
          )}
        </>
      )}
    </div>
  );
}
