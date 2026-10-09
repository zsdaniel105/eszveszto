// Bounded existing history field; no storage schema change is needed.
export const RECENT_QUESTION_LIMIT = 180;
import { SABOTAGE_BALANCE } from "../shared/sabotage";
import {
  createSabotage,
  commitSabotage,
  resolveSabotage,
  publicSabotage,
  type StoredSabotage,
} from "./sabotage";
import {
  CATEGORIES,
  FINALE_LENGTH,
  GAME_TIMING,
  type Action,
  type AnswerResult,
  type Difficulty,
  type MatchPlayer,
  type PublicGame,
  type Ranking,
  type RoundResult,
} from "../shared/game";
import { RoomError, type StoredRoom } from "./model";
import { QUESTIONS, questionById, type PublishedQuestion } from "./questions";
interface SubmittedAnswer {
  optionIndex: number;
  receivedAt: number;
}
export interface FinaleAttempt extends SubmittedAnswer {
  correct: boolean;
  order: number;
}
export interface IceProgress {
  acceptedTaps: number;
  lastTapAt: number;
  brokenAt: number | null;
}
export interface StoredQuiz {
  sessionId: string;
  phaseId: string;
  startedAt: number;
  phaseStartedAt: number;
  deadline: number | null;
  round: number;
  categoryOptions: string[];
  categoryId: string | null;
  votes: Record<string, string>;
  voteCounts: Record<string, number>;
  offeredCategories: string[];
  blockQuestionIds: string[];
  usedQuestionIds: string[];
  currentQuestionId: string | null;
  options: string[];
  correctIndex: number;
  answers: Record<string, SubmittedAnswer>;
  answeringMode: "single" | "multi-guess";
  finaleAttempts: Record<string, FinaleAttempt[]>;
  iceProgress: Record<string, IceProgress>;
  eligiblePlayerIds: string[];
  participants: MatchPlayer[];
  result: RoundResult | null;
  previousRanks: Record<string, number>;
  finaleAnnounced: boolean;
  sabotage: StoredSabotage | null;
}
export function randomIndex(length: number): number {
  if (!Number.isInteger(length) || length < 1)
    throw new Error("Empty random selection");
  const ceiling = Math.floor(0x100000000 / length) * length;
  let value: number;
  do {
    value = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (value >= ceiling);
  return value % length;
}
function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function availableCategories(
  used: string[],
  bank = QUESTIONS,
): string[] {
  return CATEGORIES.filter(
    (c) =>
      bank.filter(
        (q) =>
          q.status === "published" &&
          q.categoryId === c.id &&
          !used.includes(q.id),
      ).length >= 3,
  ).map((c) => c.id);
}
export function preferredDifficulty(
  preset: Difficulty,
  round: number,
  total: number,
): Difficulty {
  const pattern: Difficulty[] =
    preset === "easy"
      ? ["easy", "easy", "normal"]
      : preset === "hard"
        ? ["normal", "hard", "hard"]
        : round <= total / 2
          ? ["easy", "normal", "hard"]
          : ["normal", "hard", "hard"];
  return pattern[(round - 1) % 3];
}
export function selectBlock(
  categoryId: string,
  room: StoredRoom,
  bank = QUESTIONS,
): string[] {
  const q = room.quiz!;
  const selected: string[] = [];
  for (let offset = 0; offset < 3; offset++) {
    const remaining = bank.filter(
      (item) =>
        item.status === "published" &&
        item.categoryId === categoryId &&
        !q.usedQuestionIds.includes(item.id) &&
        !selected.includes(item.id),
    );
    if (!remaining.length)
      throw new RoomError(
        "CONTENT_SHORTAGE",
        "Ehhez a témához nincs elegendő új kérdés. Indítsatok új partit!",
        409,
      );
    const fresh = remaining.filter(
      (item) => !room.recentQuestionIds.includes(item.id),
    );
    const pool = fresh.length ? fresh : remaining;
    const preferred = preferredDifficulty(
      room.settings.difficulty,
      q.round + offset,
      room.settings.questionCount,
    );
    const order: Difficulty[] =
      preferred === "easy"
        ? ["easy", "normal", "hard"]
        : preferred === "hard"
          ? ["hard", "normal", "easy"]
          : ["normal", "easy", "hard"];
    const choices = order
      .map((level) => pool.filter((item) => item.difficulty === level))
      .find((group) => group.length)!;
    selected.push(choices[randomIndex(choices.length)].id);
  }
  return selected;
}
export function chooseVoteWinner(
  options: string[],
  votes: Record<string, string>,
  pick = randomIndex,
): string {
  if (!options.length)
    throw new RoomError("CONTENT_SHORTAGE", "Nincs elérhető témakör.", 409);
  const counts = options.map(
    (id) => Object.values(votes).filter((v) => v === id).length,
  );
  const max = Math.max(...counts);
  const tied = options.filter((_, i) => counts[i] === max);
  return tied[pick(tied.length)];
}
function phase(
  room: StoredRoom,
  next: StoredRoom["phase"],
  now: number,
  duration: number | null,
) {
  const q = room.quiz!;
  room.phase = next;
  q.phaseId = crypto.randomUUID();
  q.phaseStartedAt = now;
  q.deadline = duration === null ? null : now + duration;
  room.revision++;
  room.lastActivityAt = Math.max(room.lastActivityAt, now);
}
function beginVote(room: StoredRoom, now: number) {
  const q = room.quiz!;
  const available = availableCategories(q.usedQuestionIds);
  if (!available.length)
    throw new RoomError(
      "CONTENT_SHORTAGE",
      "Elfogytak az új kérdéseket kínáló témák.",
      409,
    );
  const newCategories = available.filter(
    (id) => !q.offeredCategories.includes(id),
  );
  // Prefer entirely new offers; recycle only as needed, within available content.
  q.categoryOptions = [
    ...shuffle(newCategories),
    ...shuffle(available.filter((id) => !newCategories.includes(id))),
  ].slice(0, 3);
  q.offeredCategories = [
    ...new Set([...q.offeredCategories, ...q.categoryOptions]),
  ];
  q.votes = {};
  q.voteCounts = {};
  q.categoryId = null;
  q.currentQuestionId = null;
  q.answers = {};
  q.result = null;
  q.sabotage = null;
  phase(room, "category-vote", now, GAME_TIMING.vote);
}
export function initializeQuiz(room: StoredRoom, now: number) {
  if (
    QUESTIONS.length < room.settings.questionCount ||
    !availableCategories([]).length
  )
    throw new RoomError(
      "CONTENT_SHORTAGE",
      "Nincs elegendő közzétett kérdés a játékhoz.",
      409,
    );
  const sessionId = crypto.randomUUID();
  room.session = { id: sessionId, startedAt: now };
  room.quiz = {
    sessionId,
    phaseId: "",
    startedAt: now,
    phaseStartedAt: now,
    deadline: null,
    round: 1,
    categoryOptions: [],
    categoryId: null,
    votes: {},
    voteCounts: {},
    offeredCategories: [],
    blockQuestionIds: [],
    usedQuestionIds: [],
    currentQuestionId: null,
    options: [],
    correctIndex: 0,
    answers: {},
    answeringMode: "single",
    finaleAttempts: {},
    iceProgress: {},
    eligiblePlayerIds: [],
    participants: room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      character: p.character,
      joinedAt: p.joinedAt,
      score: 0,
      correctAnswers: 0,
      answeredQuestions: 0,
      responseTimeTotalMs: 0,
      left: false,
    })),
    result: null,
    previousRanks: {},
    finaleAnnounced: false,
    sabotage: null,
  };
  beginVote(room, now);
}
export function isFinale(room: StoredRoom): boolean {
  return (
    !!room.quiz &&
    room.quiz.round >
      room.settings.questionCount - FINALE_LENGTH[room.settings.questionCount]
  );
}
function beforeQuestion(room: StoredRoom, now: number) {
  const q = room.quiz!;
  if (isFinale(room) && !q.finaleAnnounced) {
    q.finaleAnnounced = true;
    phase(room, "finale", now, GAME_TIMING.finale);
    return;
  }
  beginSabotage(room, now);
}
function beginSabotage(room: StoredRoom, now: number) {
  const q = room.quiz!;
  const item = questionById(q.blockQuestionIds[(q.round - 1) % 3]);
  const raw = item.type === "true-false" ? ["Igaz", "Hamis"] : item.options;
  const answer =
    item.type === "true-false" ? Number(!item.correct) : item.correctIndex;
  const order = shuffle(raw.map((_, i) => i));
  q.options = order.map((i) => raw[i]);
  q.correctIndex = order.indexOf(answer);
  q.currentQuestionId = item.id;
  q.answers = {};
  q.answeringMode = isFinale(room) ? "multi-guess" : "single";
  q.finaleAttempts = {};
  q.iceProgress = {};
  q.result = null;
  q.eligiblePlayerIds = room.players
    .filter(
      (p) =>
        !p.graceExpired && q.participants.some((m) => m.id === p.id && !m.left),
    )
    .map((p) => p.id);
  q.sabotage = createSabotage(room);
  phase(room, "sabotage-selection", now, SABOTAGE_BALANCE.selectionMs);
}
function revealAttacks(room: StoredRoom, now: number) {
  resolveSabotage(room, now + SABOTAGE_BALANCE.revealMs);
  phase(room, "sabotage-reveal", now, SABOTAGE_BALANCE.revealMs);
}
function openQuestion(room: StoredRoom, now: number) {
  room.quiz!.eligiblePlayerIds = room.players
    .filter(
      (p) =>
        !p.graceExpired &&
        room.quiz!.participants.some((m) => m.id === p.id && !m.left),
    )
    .map((p) => p.id);
  phase(room, "question", now, GAME_TIMING.question);
}
export function scoreAnswer(
  correct: boolean,
  startedAt: number,
  deadline: number,
  receivedAt: number | null,
  finale: boolean,
  wrongAttempts = 0,
) {
  const multiplier: 1 | 2 = finale ? 2 : 1;
  if (
    !correct ||
    receivedAt === null ||
    receivedAt < startedAt ||
    receivedAt >= deadline
  )
    return { basePoints: 0, speedBonus: 0, multiplier, total: 0 };
  // Fifteen one-second buckets: first second earns 50, last second 0.
  // No client timestamps or sub-second bonus differences.
  const elapsedSeconds = Math.floor((receivedAt - startedAt) / 1000);
  const lastBucket = GAME_TIMING.question / 1000 - 1;
  const speedBonus = Math.floor(
    (50 * Math.max(0, lastBucket - elapsedSeconds)) / lastBucket,
  );
  const basePoints =
    100 - (finale ? Math.min(3, Math.max(0, wrongAttempts)) * 30 : 0);
  return {
    basePoints,
    speedBonus,
    multiplier,
    total: (basePoints + speedBonus) * multiplier,
  };
}
export function ranking(room: StoredRoom): Ranking[] {
  const q = room.quiz!;
  const sorted = [...q.participants].sort(
    (a, b) =>
      b.score - a.score || a.joinedAt - b.joinedAt || a.id.localeCompare(b.id),
  );
  return sorted.map((p) => ({
    ...p,
    rank: sorted.findIndex((other) => other.score === p.score) + 1,
    previousRank:
      q.previousRanks[p.id] ??
      sorted.findIndex((other) => other.score === p.score) + 1,
    connected: room.players.some(
      (member) => member.id === p.id && member.connected,
    ),
  }));
}
function resolveQuestion(room: StoredRoom, now: number) {
  const q = room.quiz!;
  const deadline = q.deadline!;
  const item = questionById(q.currentQuestionId!);
  q.previousRanks = Object.fromEntries(
    ranking(room).map((p) => [p.id, p.rank]),
  );
  const players: AnswerResult[] = q.participants.map((p) => {
    const attempts = q.finaleAttempts[p.id] ?? [];
    // An unsolved finale with attempts counts as one answered question; its
    // response time is the last accepted wrong attempt, never all guesses.
    const a = q.answers[p.id] ?? attempts.at(-1);
    const wrongAttempts = attempts.filter((attempt) => !attempt.correct).length;
    const correct = !!a && a.optionIndex === q.correctIndex;
    const points = scoreAnswer(
      correct,
      q.phaseStartedAt,
      deadline,
      a?.receivedAt ?? null,
      isFinale(room),
      wrongAttempts,
    );
    if (a) {
      p.answeredQuestions++;
      p.responseTimeTotalMs += a.receivedAt - q.phaseStartedAt;
    }
    if (correct) p.correctAnswers++;
    p.score += points.total;
    return {
      playerId: p.id,
      optionIndex: a?.optionIndex ?? null,
      correct,
      ...points,
      responseTimeMs: a ? a.receivedAt - q.phaseStartedAt : null,
      ...(q.answeringMode === "multi-guess"
        ? {
            wrongAttempts,
            mistakePenalty: wrongAttempts * 30,
            attempts: attempts.map(({ optionIndex, correct }) => ({
              optionIndex,
              correct,
            })),
          }
        : {}),
    };
  });
  q.result = {
    correctIndex: q.correctIndex,
    explanation: item.explanation ?? null,
    players,
  };
  phase(room, "results", now, GAME_TIMING.results);
}
export function advanceQuiz(room: StoredRoom, now: number): boolean {
  if (!room.quiz) return false;
  let changed = false;
  // Anchoring to the expired deadline catches up delayed alarms without resetting
  // timers or double-scoring. Maximum normal match has fewer than 120 transitions.
  for (
    let steps = 0;
    room.quiz.deadline !== null && room.quiz.deadline <= now && steps < 160;
    steps++
  ) {
    const q = room.quiz;
    const at = q.deadline!;
    changed = true;
    switch (room.phase) {
      case "category-vote": {
        q.categoryId = chooseVoteWinner(q.categoryOptions, q.votes);
        q.voteCounts = Object.fromEntries(
          q.categoryOptions.map((id) => [
            id,
            Object.values(q.votes).filter((v) => v === id).length,
          ]),
        );
        q.blockQuestionIds = selectBlock(q.categoryId, room);
        q.usedQuestionIds.push(...q.blockQuestionIds);
        beforeQuestion(room, at);
        break;
      }
      case "finale":
        beginSabotage(room, at);
        break;
      case "sabotage-selection":
        revealAttacks(room, at);
        break;
      case "sabotage-reveal":
        openQuestion(room, at);
        break;
      case "question":
        resolveQuestion(room, at);
        break;
      case "results":
        phase(room, "leaderboard", at, GAME_TIMING.leaderboard);
        break;
      case "leaderboard":
        if (q.round === room.settings.questionCount) {
          phase(room, "final-results", at, null);
        } else {
          q.round++;
          if ((q.round - 1) % 3 === 0) beginVote(room, at);
          else beforeQuestion(room, at);
        }
        break;
      default:
        throw new Error("Persisted quiz phase cannot advance");
    }
  }
  return changed;
}
export function quizAction(
  room: StoredRoom,
  playerId: string,
  action: Extract<
    Action,
    {
      type:
        | "vote"
        | "answer"
        | "rematch"
        | "attack"
        | "skip-attack"
        | "ice-tap";
    }
  >,
  now: number,
) {
  const q = room.quiz;
  if (
    !q ||
    action.sessionId !== q.sessionId ||
    action.phaseId !== q.phaseId ||
    ("round" in action && action.round !== q.round)
  )
    throw new RoomError(
      "STALE_PHASE",
      "Ez a kör már lezárult. Várd meg az új állapotot!",
      409,
    );
  if (action.type === "rematch") {
    if (room.phase !== "final-results")
      throw new RoomError(
        "INVALID_PHASE",
        "Az új partihoz előbb fejezzétek be a mostanit!",
        409,
      );
    if (playerId !== room.hostId)
      throw new RoomError(
        "HOST_ONLY",
        "Az új partit a házigazda nyitja meg.",
        403,
      );
    room.recentQuestionIds = [
      ...new Set([...q.usedQuestionIds, ...room.recentQuestionIds]),
    ].slice(0, RECENT_QUESTION_LIMIT);
    room.players = room.players.filter((p) => !p.graceExpired);
    room.players.forEach((p) => {
      p.ready = false;
    });
    room.phase = "lobby";
    room.session = null;
    room.quiz = null;
    room.settingsRevision++;
    room.notice = null;
  } else {
    const participant = q.participants.find(
      (p) => p.id === playerId && !p.left,
    );
    if (!participant)
      throw new RoomError(
        "NOT_PARTICIPANT",
        "Nem vagy ennek a partinak a résztvevője.",
        403,
      );
    if (q.deadline === null || now >= q.deadline)
      throw new RoomError(
        "DEADLINE",
        "Lejárt az idő. A következő körben újra próbálkozhatsz!",
        409,
      );
    if (action.type === "attack" || action.type === "skip-attack") {
      const complete = commitSabotage(
        room,
        playerId,
        action.type === "attack"
          ? {
              type: "attack",
              abilityId: action.abilityId,
              targetId: action.targetId,
            }
          : { type: "skip", reason: "explicit" },
      );
      if (complete) revealAttacks(room, now);
    } else if (action.type === "vote") {
      if (
        room.phase !== "category-vote" ||
        !q.categoryOptions.includes(action.categoryId)
      )
        throw new RoomError(
          "INVALID_VOTE",
          "Válassz a felkínált témák közül!",
          400,
        );
      q.votes[playerId] = action.categoryId; // one changeable vote per player, never client counts
    } else if (action.type === "ice-tap") {
      const effects = q.sabotage?.effects[playerId];
      const progress = q.iceProgress[playerId];
      if (
        room.phase !== "question" ||
        !effects?.iceRequiredTaps ||
        now < q.phaseStartedAt ||
        now >= effects.freezeUntil ||
        progress?.brokenAt != null ||
        q.answers[playerId]
      )
        throw new RoomError(
          "ICE_INACTIVE",
          "A jégzár már nincs aktív. Válaszolj, amint megállnak a gombok!",
          409,
        );
      if (
        progress &&
        now - progress.lastTapAt < SABOTAGE_BALANCE.iceTapSpacingMs
      )
        throw new RoomError(
          "ICE_TOO_FAST",
          "Egy kicsit lassabban törd a jeget!",
          429,
        );
      const acceptedTaps = (progress?.acceptedTaps ?? 0) + 1;
      q.iceProgress[playerId] = {
        acceptedTaps,
        lastTapAt: now,
        brokenAt: acceptedTaps >= effects.iceRequiredTaps ? now : null,
      };
    } else {
      if (
        room.phase !== "question" ||
        now < q.phaseStartedAt ||
        !Number.isInteger(action.optionIndex) ||
        action.optionIndex < 0 ||
        action.optionIndex >= q.options.length
      )
        throw new RoomError(
          "INVALID_ANSWER",
          "Válassz az aktuális válaszok közül!",
          400,
        );
      if (q.answers[playerId])
        throw new RoomError(
          "ANSWER_LOCKED",
          "Ezt a választ már rögzítettük. Ebben a körben nem módosíthatod.",
          409,
        );
      const effects = q.sabotage?.effects[playerId];
      const frozen =
        !!effects &&
        now < effects.freezeUntil &&
        q.iceProgress[playerId]?.brokenAt == null;
      if (effects && (frozen || now < effects.motionUnlockAt))
        throw new RoomError(
          frozen ? "FROZEN" : "ANSWERS_MOVING",
          frozen
            ? "Még tart a fagyasztás! Törd össze a jeget, vagy várd meg, amíg felolvad."
            : "Még rendeződnek a válaszok. Egy pillanat, és válaszolhatsz!",
          409,
        );
      if (q.answeringMode === "multi-guess") {
        const attempts = q.finaleAttempts[playerId] ?? [];
        if (
          attempts.some((attempt) => attempt.optionIndex === action.optionIndex)
        )
          throw new RoomError(
            "OPTION_ELIMINATED",
            "Ezt a választ már kipróbáltad. Válassz másikat!",
            409,
          );
        if (attempts.length >= q.options.length)
          throw new RoomError(
            "ANSWER_LOCKED",
            "Ebben a körben már minden választ kipróbáltál.",
            409,
          );
        q.finaleAttempts[playerId] = [
          ...attempts,
          {
            optionIndex: action.optionIndex,
            receivedAt: now,
            correct: action.optionIndex === q.correctIndex,
            order: attempts.length + 1,
          },
        ];
      }
      if (q.answeringMode === "single" || action.optionIndex === q.correctIndex)
        q.answers[playerId] = {
          optionIndex: action.optionIndex,
          receivedAt: now,
        };
      if (!q.eligiblePlayerIds.includes(playerId))
        q.eligiblePlayerIds.push(playerId);
      const required = q.eligiblePlayerIds.filter((id) =>
        room.players.some((p) => p.id === id && !p.graceExpired),
      );
      if (required.length && required.every((id) => !!q.answers[id]))
        resolveQuestion(room, now);
    }
  }
  room.revision++;
  room.lastActivityAt = now;
}
export function publicQuiz(
  room: StoredRoom,
  viewerId?: string,
  display = false,
): PublicGame | null {
  const q = room.quiz;
  if (!q) return null;
  const reveal = room.phase === "results" || room.phase === "leaderboard";
  const item = q.currentQuestionId ? questionById(q.currentQuestionId) : null;
  const question =
    item && (room.phase === "question" || reveal)
      ? {
          id: item.id,
          categoryId: item.categoryId,
          type: item.type,
          prompt: item.prompt,
          options: [...q.options],
          ...(item.type === "image"
            ? { image: { url: item.imageUrl, alt: item.imageAlt } }
            : {}),
        }
      : null;
  return {
    votedPlayerIds: Object.keys(q.votes),
    sharedAttacks:
      display && q.sabotage?.resolved
        ? q.sabotage.attacks.map((a) => ({ ...a }))
        : [],
    sessionId: q.sessionId,
    phaseId: q.phaseId,
    round: q.round,
    startedAt: q.phaseStartedAt,
    deadline: q.deadline,
    totalQuestions: room.settings.questionCount,
    isFinale: isFinale(room),
    categoryOptions: [...q.categoryOptions],
    categoryId: q.categoryId,
    voteCounts: room.phase === "category-vote" ? {} : { ...q.voteCounts },
    myVote: viewerId ? (q.votes[viewerId] ?? null) : null,
    question,
    myAnswer: viewerId ? (q.answers[viewerId]?.optionIndex ?? null) : null,
    myIce:
      viewerId && q.sabotage?.effects[viewerId]?.iceRequiredTaps
        ? {
            requiredTaps: q.sabotage.effects[viewerId].iceRequiredTaps,
            acceptedTaps: q.iceProgress[viewerId]?.acceptedTaps ?? 0,
            broken: q.iceProgress[viewerId]?.brokenAt != null,
          }
        : null,
    myFinale:
      viewerId && q.answeringMode === "multi-guess"
        ? {
            attempts: (q.finaleAttempts[viewerId] ?? []).map(
              ({ optionIndex, correct }) => ({ optionIndex, correct }),
            ),
            eliminatedOptions: (q.finaleAttempts[viewerId] ?? [])
              .filter((a) => !a.correct)
              .map((a) => a.optionIndex),
            wrongAttempts: (q.finaleAttempts[viewerId] ?? []).filter(
              (a) => !a.correct,
            ).length,
            finished: !!q.answers[viewerId],
          }
        : null,
    answeredPlayerIds: Object.keys(q.answers),
    result: reveal ? q.result : null,
    ranking: ranking(room),
    sabotage: publicSabotage(room, viewerId),
  };
}
// Used by content tests without leaking the bank into the browser build.
export type { PublishedQuestion };
