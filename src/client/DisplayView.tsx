import { memo, useEffect, useState, type KeyboardEvent } from "react";
import {
  categoryById,
  type Action,
  type PublicGame,
  type PublicRoom,
  type Ranking,
} from "../shared/game";
import { abilityById } from "../shared/sabotage";
import { CharacterPortrait } from "./CharacterPortrait";
import { JoinQr } from "./JoinQr";
import { SettingsControls } from "./SettingsControls";
import { FullscreenControl } from "./FullscreenControl";
import { useGameViewport } from "./useGameViewport";

// The only ticking state lives in this small component. Shared question and
// portraits redraw on room changes, not ten times a second. A future narration
// hook can consume the same server-owned question ID/deadline in the display.
function DisplayTimer({
  deadline,
  clockOffset,
}: {
  deadline: number | null;
  clockOffset: number;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);
  const remaining =
    deadline === null
      ? 0
      : Math.max(0, Math.ceil((deadline - now - clockOffset) / 1000));
  return (
    <span
      className={`display-timer ${remaining <= 5 ? "urgent" : ""}`}
      aria-label={`${remaining} másodperc hátra`}
    >
      {remaining}
      <small>mp</small>
    </span>
  );
}
const DisplayRanks = memo(function DisplayRanks({
  players,
  result,
}: {
  players: Ranking[];
  result?: PublicGame["result"];
}) {
  return (
    <ol className="display-ranks">
      {players.map((p) => {
        const points = result?.players.find((r) => r.playerId === p.id);
        const delta = p.previousRank - p.rank;
        return (
          <li key={p.id} className={p.rank === 1 ? "display-leader" : ""}>
            <b>{p.rank}.</b>
            <CharacterPortrait character={p.character} />
            <span className="display-name">
              <strong>{p.nickname}</strong>
              <small>
                {points
                  ? `Ebben a körben: +${points.total}`
                  : delta > 0
                    ? `↑ ${delta} helyet lépett előre`
                    : delta < 0
                      ? `↓ ${-delta} helyet lépett vissza`
                      : "Tartja a helyét"}
              </small>
            </span>
            <strong>
              {p.score}
              <small> pont</small>
            </strong>
          </li>
        );
      })}
    </ol>
  );
});
function focusDirection(event: KeyboardEvent<HTMLElement>) {
  if (
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) ||
    !(event.target instanceof HTMLButtonElement)
  )
    return;
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
  ).filter((b) => !b.matches(":disabled"));
  const current = buttons.indexOf(event.target);
  if (current < 0 || !buttons.length) return;
  event.preventDefault();
  const step = ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1;
  buttons[(current + step + buttons.length) % buttons.length].focus();
}
export function DisplayView({
  room,
  identityId,
  clockOffset,
  online,
  connectionLabel,
  busy,
  error,
  storageWarning,
  onAction,
}: {
  room: PublicRoom;
  identityId: string;
  clockOffset: number;
  online: boolean;
  connectionLabel: string;
  busy: boolean;
  error: string;
  storageWarning: boolean;
  onAction: (action: Action) => Promise<void>;
}) {
  useGameViewport();
  const game = room.game;
  const host = room.hostRole === "display" && room.hostId === identityId;
  const disabled = busy || !online;
  const ready = room.players.filter((p) => p.ready && p.connected).length;
  const canStart =
    room.players.length >= 2 &&
    room.players.every((p) => p.ready && p.connected);
  const link = `${location.origin}/join/${room.code}`;
  const category = game?.categoryId ? categoryById(game.categoryId) : null;
  const winners = game?.ranking.filter((p) => p.rank === 1) ?? [];
  return (
    <main className="display-layout" onKeyDown={focusDirection}>
      <div className="display-hud">
        <span className="step-chip">TV PARTY · {room.code}</span>
        <strong>
          {game
            ? `${game.round}. / ${game.totalQuestions} kérdés`
            : `${room.players.length}/8 játékos · ${ready} kész`}
        </strong>
        <span className={`connection ${online ? "online" : ""}`} role="status">
          <i />
          {connectionLabel}
        </span>
      </div>
      {error && (
        <div className="notice error display-notice" role="alert">
          {error}
        </div>
      )}
      {!online && (
        <div className="notice info display-notice" role="status">
          Újracsatlakozunk. A szerver folytatja a partit, a telefonok szükség
          esetén megmutatják a kérdést.
        </div>
      )}
      {storageWarning && (
        <div className="notice info display-notice">
          A kijelző belépését nem tudjuk menteni. Frissítés után nem garantált a
          visszatérés.
        </div>
      )}
      {!host && (
        <div className="display-viewer-note" role="status">
          Kijelzőként követed a partit. A házigazdai vezérlés egy játékosnál
          van.
        </div>
      )}
      {!game ? (
        <section className="display-lobby" data-phase="lobby">
          <aside className="display-invite">
            <span className="eyebrow">HOZD A TELEFONOD!</span>
            <h1>Csatlakozzatok!</h1>
            <strong className="display-code">{room.code}</strong>
            <JoinQr url={link} />
            <p>
              Olvasd be a QR-kódot, vagy írd be a szobakódot. Válassz karaktert,
              és jelezd, ha kész vagy!
            </p>
            <a className="display-invite-url" href={link}>
              {link}
            </a>
          </aside>
          <div className="display-team">
            <div>
              <span className="eyebrow">A CSAPAT</span>
              <h2>
                {room.players.length
                  ? "Gyülekezik a káosz!"
                  : "Várjuk az első játékosokat!"}
              </h2>
            </div>
            <ul className="display-player-grid">
              {room.players.map((p) => (
                <li key={p.id} className={!p.connected ? "is-offline" : ""}>
                  <CharacterPortrait character={p.character} />
                  <strong>{p.nickname}</strong>
                  <span>
                    {!p.connected
                      ? "Visszavárjuk"
                      : p.ready
                        ? "✓ Kész"
                        : "Készülődik"}
                    {room.hostRole === "player" && p.id === room.hostId
                      ? " · Házigazda"
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
            <div className="display-settings">
              <h2>A parti receptje</h2>
              <SettingsControls
                room={room}
                disabled={!host || disabled}
                onAction={onAction}
              />
              <div className="display-start">
                <p id="display-start-reason">
                  {room.players.length < 2
                    ? "Legalább két telefonos játékos kell."
                    : !canStart
                      ? "Még nem mindenki kapcsolódott és áll készen."
                      : "A csapat kész. Indulhat a parti!"}
                </p>
                {host ? (
                  <button
                    className="primary"
                    disabled={disabled || !canStart}
                    aria-describedby="display-start-reason"
                    onClick={() =>
                      void onAction({
                        type: "start",
                        settingsRevision: room.settingsRevision,
                      })
                    }
                  >
                    Indulhat a játék!
                  </button>
                ) : (
                  <span>A házigazda indítja a játékot.</span>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section
          className={`display-stage display-phase-${room.phase}`}
          data-phase={room.phase}
          tabIndex={0}
          aria-label="Közös kijelző"
        >
          {room.phase !== "final-results" && (
            <div className="display-phase-meta">
              <span>
                {category
                  ? `${category.icon} ${category.name}`
                  : room.phase === "category-vote"
                    ? "TI VÁLASZTOTOK TÉMÁT"
                    : "KÖZÖS PARTI"}
                {game.isFinale && <b className="double-tag">DUPLA PONT</b>}
              </span>
              <DisplayTimer
                deadline={game.deadline}
                clockOffset={clockOffset}
              />
            </div>
          )}
          {room.phase === "category-vote" && (
            <div className="display-intermission">
              <h1>Melyik témát választjátok?</h1>
              <div className="display-categories">
                {game.categoryOptions.map((id) => {
                  const c = categoryById(id)!;
                  return (
                    <div key={id}>
                      <span>{c.icon}</span>
                      <strong>{c.name}</strong>
                    </div>
                  );
                })}
              </div>
              <p>
                Szavazzatok a telefonon! · {game.votedPlayerIds.length}/
                {game.ranking.filter((p) => !p.left).length} játékos szavazott
              </p>
            </div>
          )}
          {room.phase === "sabotage-selection" && (
            <div className="display-intermission">
              <span className="display-burst" aria-hidden="true">
                ✳
              </span>
              <h1>Indul a szivatás!</h1>
              <p>Válassz képességet és ellenfelet a telefonodon!</p>
              <strong>
                {game.sabotage?.submittedPlayerIds.length ?? 0}/
                {game.ranking.filter((p) => !p.left).length} játékos döntött
              </strong>
            </div>
          )}
          {room.phase === "sabotage-reveal" && (
            <div className="display-intermission">
              <h1>
                {game.sharedAttacks.length
                  ? "Jön a meglepetés!"
                  : "Ez most békés kör lesz."}
              </h1>
              <ul className="display-attacks">
                {game.sharedAttacks.map((a) => {
                  const from = game.ranking.find((p) => p.id === a.attackerId),
                    to = game.ranking.find((p) => p.id === a.targetId),
                    ability = abilityById(a.abilityId);
                  return (
                    <li key={a.attackerId}>
                      <span>{ability.icon}</span>
                      <strong>
                        {from?.nickname} → {to?.nickname}
                      </strong>
                      <small>
                        {ability.name}
                        {a.outcome === "target-left"
                          ? " · a célpont kilépett"
                          : ""}
                      </small>
                    </li>
                  );
                })}
              </ul>
              <p>Mindjárt jön a kérdés!</p>
            </div>
          )}
          {room.phase === "question" && game.question && (
            <div className="display-question">
              <h1>{game.question.prompt}</h1>
              <p>
                {game.answeredPlayerIds.length}/
                {game.ranking.filter((p) => !p.left).length} játékos befejezte ·
                Válaszoljatok a telefonon!
              </p>
            </div>
          )}
          {room.phase === "results" && game.question && game.result && (
            <div className="display-results">
              <h1>A helyes válasz</h1>
              <strong className="display-correct">
                {game.question.options[game.result.correctIndex]}
              </strong>
              {game.result.explanation && <p>{game.result.explanation}</p>}
              <DisplayRanks players={game.ranking} result={game.result} />
            </div>
          )}
          {room.phase === "leaderboard" && (
            <div className="display-scoreboard">
              <h1>Hogy áll a csapat?</h1>
              <DisplayRanks players={game.ranking} />
            </div>
          )}
          {room.phase === "finale" && (
            <div className="display-intermission finale-announcement">
              <span aria-hidden="true">🔥</span>
              <h1>Döntő – dupla pont!</h1>
              <p>
                Rossz válasz? Kiesik, és tippelhetsz tovább.
                <br />
                Hibánként −30 alappont. Siess, a gyorsaság is számít!
              </p>
            </div>
          )}
          {room.phase === "final-results" && (
            <div className="display-scoreboard display-final">
              <span className="eyebrow">MEGVAN A VÉGEREDMÉNY</span>
              <h1>
                {winners.length > 1
                  ? "Holtverseny!"
                  : `${winners[0]?.nickname ?? "A csapat"} nyert!`}
              </h1>
              <DisplayRanks players={game.ranking} />
              {host ? (
                <button
                  className="primary"
                  disabled={disabled}
                  onClick={() =>
                    void onAction({
                      type: "rematch",
                      sessionId: game.sessionId,
                      phaseId: game.phaseId,
                    })
                  }
                >
                  Új parti
                </button>
              ) : (
                <p>A játékos házigazda indíthat új partit.</p>
              )}
            </div>
          )}
        </section>
      )}
      {game &&
        !["results", "leaderboard", "final-results"].includes(room.phase) && (
          <ul className="display-player-rail">
            {game.ranking.map((p) => (
              <li key={p.id}>
                <CharacterPortrait character={p.character} />
                <strong>{p.nickname}</strong>
                <small>
                  {p.left
                    ? "Kilépett"
                    : !p.connected
                      ? "Visszavárjuk"
                      : game.answeredPlayerIds.includes(p.id)
                        ? "✓ Befejezte"
                        : `${p.score} pont`}
                </small>
              </li>
            ))}
          </ul>
        )}
      <div className="display-tools">
        <FullscreenControl />
        <button
          className="text-button"
          disabled={disabled}
          onClick={() => void onAction({ type: "leave" })}
        >
          Kijelző bezárása
        </button>
      </div>
    </main>
  );
}
