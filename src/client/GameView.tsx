import { useGameViewport } from "./useGameViewport";
import { CharacterPortrait } from "./CharacterPortrait";
import { SabotageSelection, AttackSummary } from "./SabotageView";
import { QuestionEffects } from "./QuestionEffects";
import { useEffect, useState } from "react";
import {
  categoryById,
  type Action,
  type PublicRoom,
  type Ranking,
} from "../shared/game";

function Ranks({
  players,
  me,
  final = false,
  total,
}: {
  players: Ranking[];
  me: string;
  final?: boolean;
  total: number;
}) {
  return (
    <ol className="rank-list">
      {players.map((p) => {
        const delta = p.previousRank - p.rank;
        return (
          <li
            key={p.id}
            className={`${p.id === me ? "is-me" : ""} ${delta > 0 ? "rank-up" : delta < 0 ? "rank-down" : ""}`}
          >
            <b className="rank-number">{p.rank}.</b>
            <CharacterPortrait character={p.character} />
            <div className="rank-person">
              <strong>
                {p.nickname}
                {p.id === me && <small> (te)</small>}
              </strong>
              <span>
                {final
                  ? `${p.correctAnswers}/${total} helyes · ${Math.round((p.correctAnswers / total) * 100)}%`
                  : p.left
                    ? "Kilépett"
                    : !p.connected
                      ? "Visszavárjuk"
                      : delta > 0
                        ? `↑ ${delta} helyet javított`
                        : delta < 0
                          ? `↓ ${-delta} helyet visszaesett`
                          : "Tartja a helyét"}
              </span>
            </div>
            <strong className="rank-score">
              {p.score}
              <small> pont</small>
            </strong>
          </li>
        );
      })}
    </ol>
  );
}
export function GameView({
  room,
  playerId,
  clockOffset,
  online,
  connectionLabel,
  busy,
  error,
  storageWarning,
  onAction,
}: {
  room: PublicRoom;
  playerId: string;
  clockOffset: number;
  online: boolean;
  connectionLabel: string;
  busy: boolean;
  error: string;
  storageWarning: boolean;
  onAction: (action: Action) => Promise<void>;
}) {
  useGameViewport();
  const game = room.game!;
  const controller = room.mode === "tv-party";
  const [showQuestion, setShowQuestion] = useState(() => {
    try {
      return localStorage.getItem("eszveszto:controller-question") === "true";
    } catch {
      return false;
    }
  });
  const displayUnavailable = controller && !room.display?.connected;
  function toggleQuestion() {
    const next = !showQuestion;
    setShowQuestion(next);
    try {
      localStorage.setItem("eszveszto:controller-question", String(next));
    } catch {
      /* Individual optional preference. */
    }
  }
  useEffect(() => {
    if (room.phase === "question") return;
    try {
      const prefix = `eszveszto:slime:${playerId}:`;
      for (const key of Object.keys(localStorage))
        if (key.startsWith(prefix)) localStorage.removeItem(key);
    } catch {
      /* Optional visual state. */
    }
  }, [room.phase, game.phaseId, playerId]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(tick);
  }, []);
  const remaining =
    game.deadline === null
      ? 0
      : Math.max(0, Math.ceil((game.deadline - now - clockOffset) / 1000));
  const disabled = busy || !online || remaining === 0;
  const context = {
    sessionId: game.sessionId,
    phaseId: game.phaseId,
    round: game.round,
  };
  const category = game.categoryId ? categoryById(game.categoryId) : null;
  const me = game.ranking.find((p) => p.id === playerId);
  const result = game.result?.players.find((p) => p.playerId === playerId);
  const q = game.question;
  const winners = game.ranking.filter((p) => p.rank === 1);
  return (
    <main
      className={`game-layout phase-${room.phase} ${controller ? "controller-mode" : ""}`}
    >
      <div className="game-status">
        <span className="step-chip">
          {room.phase === "final-results"
            ? "VÉGEREDMÉNY"
            : `${game.round}. / ${game.totalQuestions} KÉRDÉS`}
        </span>
        <span className={`connection ${online ? "online" : ""}`} role="status">
          <i />
          {connectionLabel}
        </span>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {!online && (
        <div className="notice info" role="status">
          {room.phase === "sabotage-selection"
            ? "Újracsatlakozunk. A választási idő tovább telik; az ajánlataid és a rögzített támadásod megmaradnak."
            : "Újracsatlakozunk. A parti közben tovább halad; a mentett válaszod és pontjaid megmaradnak."}
        </div>
      )}
      {storageWarning && (
        <div className="notice info">
          A böngésző nem engedi a belépés mentését. Frissítéskor új belépésre
          lehet szükség.
        </div>
      )}
      <section
        key={game.phaseId}
        className="game-card"
        data-phase={room.phase}
        tabIndex={0}
        aria-label="Játékterület"
      >
        {room.phase !== "final-results" && (
          <div className="phase-meta">
            <span>
              {room.phase === "category-vote"
                ? "A KÖVETKEZŐ 3 KÉRDÉS"
                : category
                  ? `${category.icon} ${category.name}`
                  : "DÖNTŐ"}
              {game.isFinale && room.phase !== "finale" && (
                <b className="double-tag">DUPLA PONT</b>
              )}
            </span>
            <span
              className={`timer ${remaining <= 5 ? "urgent" : ""}`}
              aria-label={`${remaining} másodperc hátra`}
            >
              {remaining}
              <small> mp</small>
            </span>
          </div>
        )}
        {room.phase === "category-vote" && (
          <>
            <h1>Milyen témából jöjjön a következő három kérdés?</h1>
            <p className="game-subtitle">
              Válassz kategóriát! A szavazatod az idő lejártáig módosítható.
            </p>
            <div className="vote-options">
              {game.categoryOptions.map((id) => {
                const c = categoryById(id)!;
                return (
                  <button
                    className={`vote-card ${game.myVote === id ? "selected" : ""}`}
                    key={id}
                    disabled={disabled}
                    aria-pressed={game.myVote === id}
                    onClick={() =>
                      void onAction({
                        type: "vote",
                        categoryId: id,
                        ...context,
                      })
                    }
                  >
                    <span aria-hidden="true">{c.icon}</span>
                    <strong>{c.name}</strong>
                    <small>
                      {game.myVote === id
                        ? "✓ A te szavazatod"
                        : "Erre szavazok"}
                    </small>
                  </button>
                );
              })}
            </div>
            <p className="phase-note">
              {game.myVote
                ? "Szavazatod megérkezett. Várjuk a többieket! Még választhatsz másik témát."
                : "A legtöbb szavazat nyer. Döntetlennél a sors dönt."}
            </p>
          </>
        )}
        {room.phase === "sabotage-selection" && game.sabotage && (
          <SabotageSelection
            key={game.phaseId}
            game={game}
            busy={busy}
            disabled={disabled}
            onAction={onAction}
          />
        )}
        {room.phase === "sabotage-reveal" && (
          <div className="attack-reveal">
            <h1>
              {game.sabotage?.incoming.length
                ? "Jön a meglepetés!"
                : "Felkészültél?"}
            </h1>
            <AttackSummary game={game} full />
            <p className="phase-note">
              Mindjárt jön a kérdés. Minden hatásnak van határa!
            </p>
          </div>
        )}
        {room.phase === "question" && q && (
          <>
            {(game.round - 1) % 3 === 0 && (
              <p className="vote-result">
                A választott téma: {category?.name} ·{" "}
                {game.voteCounts[game.categoryId!] ?? 0} szavazat
              </p>
            )}
            <AttackSummary game={game} />
            {controller && (
              <div className="controller-controls">
                <strong>{me?.score ?? 0} pontod van</strong>
                <button
                  className="text-button"
                  aria-pressed={showQuestion}
                  onClick={toggleQuestion}
                >
                  {showQuestion ? "Kérdés elrejtése" : "Kérdés mutatása"}
                </button>
              </div>
            )}
            {displayUnavailable && (
              <p className="controller-fallback" role="status">
                A közös kijelző nincs kapcsolatban. A kérdést most a telefonodon
                is látod.
              </p>
            )}
            <QuestionEffects
              key={game.phaseId}
              question={q}
              showQuestion={!controller || showQuestion || displayUnavailable}
              effects={game.sabotage?.effects ?? null}
              now={now + clockOffset}
              phaseId={game.phaseId}
              playerId={playerId}
              myAnswer={game.myAnswer}
              disabled={disabled}
              ice={game.myIce}
              finale={game.myFinale}
              online={online && remaining > 0}
              onIceTap={() => onAction({ type: "ice-tap", ...context })}
              onAnswer={(index) =>
                void onAction({
                  type: "answer",
                  optionIndex: index,
                  ...context,
                })
              }
            />
            <p className="answer-status" role="status">
              {game.myAnswer !== null
                ? "✓ Válaszod rögzítve. Várjuk a többieket!"
                : remaining === 0
                  ? "Lejárt az idő. Érkezik az eredmény…"
                  : game.myFinale
                    ? game.myFinale.wrongAttempts
                      ? `Nem talált! Próbáld újra! ${game.myFinale.wrongAttempts} hibás tipp · −${game.myFinale.wrongAttempts * 30} alappont`
                      : "Döntő: próbálkozhatsz újra. Hibánként −30 alappont, a végén dupla pont!"
                    : "Egy válasz, egy esély. Válassz, amíg tart az idő!"}
            </p>
            {!controller && (
              <div className="question-bottom">
                <span>
                  {game.answeredPlayerIds.length}/
                  {game.ranking.filter((p) => !p.left).length} válaszolt
                </span>
                <strong>{me?.score ?? 0} pontod van</strong>
              </div>
            )}
          </>
        )}
        {room.phase === "results" && q && game.result && (
          <>
            <h1>
              {result?.correct
                ? "Ez telitalálat!"
                : result?.optionIndex === null
                  ? "Ez most kimaradt."
                  : "Majd a következő!"}
            </h1>
            <p className="result-prompt">{q.prompt}</p>
            <div className="correct-answer">
              <span>✓ HELYES VÁLASZ</span>
              <strong>{q.options[game.result.correctIndex]}</strong>
            </div>
            <p>
              A válaszod:{" "}
              <strong>
                {result?.optionIndex != null
                  ? q.options[result.optionIndex]
                  : "Nem érkezett válasz"}
              </strong>
            </p>
            {game.result.explanation && (
              <p className="explanation">{game.result.explanation}</p>
            )}
            <div className="score-breakdown">
              <div>
                <span>Alappont</span>
                <strong>{result?.basePoints ?? 0}</strong>
              </div>
              <b>+</b>
              <div>
                <span>Gyorsaság</span>
                <strong>{result?.speedBonus ?? 0}</strong>
              </div>
              {game.isFinale && <b>× 2</b>}
              <b>=</b>
              <div className="earned">
                <span>Ebben a körben</span>
                <strong>+{result?.total ?? 0}</strong>
              </div>
            </div>
            {result?.wrongAttempts !== undefined && (
              <p className="finale-breakdown">
                {result.attempts?.length ?? 0} tipp · {result.wrongAttempts}{" "}
                hibás · −{result.mistakePenalty} alappont
                {result.correct
                  ? ` · 100 − ${result.mistakePenalty} = ${result.basePoints} megmaradt alappont`
                  : " · Helyes válasz nélkül 0 pont"}
              </p>
            )}
            <details className="result-attacks">
              <summary>Szabotázs ebben a körben</summary>
              <AttackSummary game={game} full />
            </details>
            <p className="phase-note">Mindjárt jön a ranglista.</p>
          </>
        )}
        {room.phase === "leaderboard" && (
          <>
            <h1>Hogy áll a csapat?</h1>
            <p className="game-subtitle">
              {game.round}. kérdés után · Azonos pontszám, közös helyezés.
            </p>
            <Ranks
              players={
                controller
                  ? game.ranking.filter((p) => p.id === playerId)
                  : game.ranking
              }
              me={playerId}
              total={game.totalQuestions}
            />
            <p className="phase-note">
              {game.round === game.totalQuestions
                ? "Érkezik a végeredmény!"
                : "Mindjárt folytatjuk."}
            </p>
          </>
        )}
        {room.phase === "finale" && (
          <div className="finale-announcement">
            <span aria-hidden="true">⚡</span>
            <h1>
              {controller
                ? "🔥 Döntő – dupla pont!"
                : "🔥 DÖNTŐ – TÖBB ESÉLY, KEVESEBB PONT!"}
            </h1>
            <p>
              A hibás válasz kiesik, és újra próbálkozhatsz. Hibánként{" "}
              <strong>−30 alappont.</strong>
            </p>
            <p>
              (100 − hibák × 30 + gyorsaság) × 2. Csak a helyes válaszért jár
              pont, 15 másodpercen belül!
            </p>
          </div>
        )}
        {room.phase === "final-results" && (
          <>
            <div className="winner-banner">
              <span aria-hidden="true">🏆</span>
              <h1>
                {winners.length > 1 ? "Közös győzelem!" : "Megvan a győztes!"}
              </h1>
              <p>{winners.map((p) => p.nickname).join(" és ")}</p>
            </div>
            <Ranks
              players={
                controller
                  ? game.ranking.filter((p) => p.id === playerId)
                  : game.ranking
              }
              me={playerId}
              total={game.totalQuestions}
              final
            />
            {me && (
              <div className="personal-summary">
                <strong>
                  A te partid: {me.rank}. hely · {me.score} pont
                </strong>
                <span>
                  {me.correctAnswers}/{game.totalQuestions} helyes válasz ·{" "}
                  {Math.round((me.correctAnswers / game.totalQuestions) * 100)}%
                  pontosság
                </span>
                {me.answeredQuestions > 0 && (
                  <span>
                    Átlagos válaszidőd:{" "}
                    {(me.responseTimeTotalMs / me.answeredQuestions / 1000)
                      .toFixed(1)
                      .replace(".", ",")}{" "}
                    mp
                  </span>
                )}
              </div>
            )}
            {room.hostRole === "player" && room.hostId === playerId ? (
              <button
                className="primary wide"
                disabled={busy || !online}
                onClick={() =>
                  void onAction({
                    type: "rematch",
                    sessionId: game.sessionId,
                    phaseId: game.phaseId,
                  })
                }
              >
                Új parti <span aria-hidden="true">↻</span>
              </button>
            ) : (
              <p className="waiting-host" role="status">
                A házigazda indíthat új partit.
              </p>
            )}
            <p className="phase-note">
              Az új parti előtt az előszobában ismét jelezzétek, hogy készen
              álltok.
            </p>
          </>
        )}
      </section>
      <button
        className="text-button leave"
        disabled={busy || !online}
        onClick={() => void onAction({ type: "leave" })}
      >
        Kilépés a szobából
      </button>
    </main>
  );
}
