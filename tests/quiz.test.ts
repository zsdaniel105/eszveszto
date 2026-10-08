import { describe, expect, it } from "vitest";
import {
  applyAction,
  createRoom,
  joinRoom,
  makePlayer,
  parseAction,
  pruneDisconnected,
  publicRoom,
  upgradeRoom,
} from "../src/server/model";
import {
  advanceQuiz,
  availableCategories,
  chooseVoteWinner,
  preferredDifficulty,
  ranking,
  scoreAnswer,
  selectBlock,
} from "../src/server/quiz";
import { QUESTIONS, validateBank } from "../src/server/questions";
import {
  GAME_TIMING,
  type Difficulty,
  type QuestionCount,
} from "../src/shared/game";
function fixture(count: QuestionCount = 6, difficulty: Difficulty = "normal") {
  const now = Date.now();
  const host = makePlayer("Házigazda", "paca", "host", now),
    guest = makePlayer("Vendég", "zum", "guest", now + 1);
  host.connected = guest.connected = true;
  host.disconnectedAt = guest.disconnectedAt = null;
  const room = createRoom("ABCD234", host, now);
  joinRoom(room, guest);
  room.settings = { questionCount: count, difficulty };
  host.ready = guest.ready = true;
  applyAction(
    room,
    host.id,
    { type: "start", settingsRevision: room.settingsRevision },
    now,
  );
  return { room, host, guest, now };
}
function context(room: ReturnType<typeof fixture>["room"]) {
  return {
    sessionId: room.quiz!.sessionId,
    phaseId: room.quiz!.phaseId,
    round: room.quiz!.round,
  };
}
function open(room: ReturnType<typeof fixture>["room"]) {
  while (room.phase !== "question") {
    if (room.quiz!.deadline === null) throw new Error("No next question");
    advanceQuiz(room, room.quiz!.deadline!);
  }
}

describe("question bank and selection", () => {
  it("contains 120 unique structurally valid published questions, ten per category", () => {
    expect(QUESTIONS).toHaveLength(120);
    expect(() => validateBank(QUESTIONS)).not.toThrow();
    expect(availableCategories([])).toHaveLength(12);
    for (const cat of availableCategories([]))
      expect(QUESTIONS.filter((q) => q.categoryId === cat)).toHaveLength(10);
  });
  it("rejects duplicate IDs, duplicate options and invalid answer indexes", () => {
    expect(() => validateBank([...QUESTIONS, QUESTIONS[0]])).toThrow();
    const q = QUESTIONS[0];
    if (q.type !== "text") throw Error("text fixture");
    expect(() =>
      validateBank([{ ...q, options: ["a", "a", "c", "d"] }]),
    ).toThrow();
    expect(() => validateBank([{ ...q, correctIndex: 4 }])).toThrow();
  });
  it("offers only categories with three unused published questions", () => {
    expect(
      availableCategories(
        QUESTIONS.filter((q) => q.categoryId === "geography")
          .slice(0, 8)
          .map((q) => q.id),
      ),
    ).not.toContain("geography");
    expect(availableCategories([], QUESTIONS.slice(0, 2))).toEqual([]);
  });
  it("uses intentional difficulty targets and fallback within the category", () => {
    expect([1, 2, 3].map((r) => preferredDifficulty("easy", r, 12))).toEqual([
      "easy",
      "easy",
      "normal",
    ]);
    expect([1, 2, 3].map((r) => preferredDifficulty("hard", r, 12))).toEqual([
      "normal",
      "hard",
      "hard",
    ]);
    expect(preferredDifficulty("normal", 7, 12)).toBe("normal");
    const { room } = fixture();
    const hardOnly = QUESTIONS.filter(
      (q) => q.categoryId === "geography" && q.difficulty === "hard",
    );
    const ids = selectBlock("geography", room, hardOnly);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(() => selectBlock("geography", room, hardOnly.slice(0, 2))).toThrow(
      "elegendő",
    );
  });
  it("prefers fresh rematch questions and uses a functional recent fallback", () => {
    const { room } = fixture();
    room.recentQuestionIds = QUESTIONS.filter(
      (q) => q.categoryId === "geography",
    )
      .slice(0, 7)
      .map((q) => q.id);
    const ids = selectBlock("geography", room);
    expect(ids.every((id) => !room.recentQuestionIds.includes(id))).toBe(true);
    room.recentQuestionIds = QUESTIONS.map((q) => q.id);
    expect(selectBlock("geography", room)).toHaveLength(3);
  });
});
describe("voting and privacy", () => {
  it("accepts a changeable vote but never counts duplicates twice", () => {
    const { room, host } = fixture();
    const c = context(room),
      options = room.quiz!.categoryOptions;
    applyAction(
      room,
      host.id,
      { type: "vote", categoryId: options[0], ...c },
      room.quiz!.phaseStartedAt + 1,
    );
    applyAction(
      room,
      host.id,
      { type: "vote", categoryId: options[1], ...c },
      room.quiz!.phaseStartedAt + 2,
    );
    expect(Object.values(room.quiz!.votes)).toEqual([options[1]]);
    expect(publicRoom(room, host.id).game!.voteCounts).toEqual({});
    expect(() =>
      applyAction(
        room,
        host.id,
        { type: "vote", categoryId: "invented", ...c },
        room.quiz!.phaseStartedAt + 3,
      ),
    ).toThrow();
  });
  it("selects the plurality, or uniformly draws from ties/no-vote options", () => {
    expect(
      chooseVoteWinner(["a", "b", "c"], { x: "b", y: "b", z: "a" }, () => 0),
    ).toBe("b");
    expect(
      chooseVoteWinner(["a", "b", "c"], { x: "a", y: "b" }, (n) => n - 1),
    ).toBe("b");
    expect(chooseVoteWinner(["a", "b", "c"], {}, (n) => n - 1)).toBe("c");
    expect(() => chooseVoteWinner([], {})).toThrow();
  });
  it("rejects late votes, stale sessions and malformed actions", () => {
    const { room, host } = fixture();
    const c = context(room),
      cat = room.quiz!.categoryOptions[0],
      end = room.quiz!.deadline!;
    expect(() =>
      applyAction(room, host.id, { type: "vote", categoryId: cat, ...c }, end),
    ).toThrow("lezárult");
    expect(() =>
      parseAction({ type: "answer", optionIndex: -1, ...context(room) }),
    ).toThrow();
    expect(() =>
      parseAction({
        type: "answer",
        optionIndex: 1,
        sessionId: "plain-id",
        phaseId: "x",
        round: 1,
      }),
    ).toThrow();
  });
  it("gives the same shuffled question to everyone and hides keys and other answers", () => {
    const { room, host, guest } = fixture();
    open(room);
    const q = room.quiz!,
      c = context(room);
    applyAction(
      room,
      host.id,
      { type: "answer", optionIndex: q.correctIndex, ...c },
      q.phaseStartedAt + 1000,
    );
    const a = publicRoom(room, host.id),
      b = publicRoom(room, guest.id);
    expect(a.game!.question).toEqual(b.game!.question);
    expect(a.game!.myAnswer).toBe(q.correctIndex);
    expect(b.game!.myAnswer).toBeNull();
    for (const snapshot of [a, b]) {
      const json = JSON.stringify(snapshot);
      expect(json).not.toContain("correctIndex");
      expect(json).not.toContain("receivedAt");
      expect(json).not.toContain("provenance");
      expect(snapshot.game!.result).toBeNull();
      expect(snapshot.game!.ranking.every((p) => p.score === 0)).toBe(true);
    }
  });
});
describe("scoring and the complete game loop", () => {
  it("calculates max/min integer bonuses, wrong/missing scores and finale doubling", () => {
    expect(scoreAnswer(true, 1000, 16000, 1000, false)).toMatchObject({
      basePoints: 100,
      speedBonus: 50,
      total: 150,
    });
    expect(scoreAnswer(true, 1000, 16000, 15999, false)).toMatchObject({
      speedBonus: 0,
      total: 100,
    });
    expect(scoreAnswer(true, 1000, 16000, 1999, false).speedBonus).toBe(50);
    expect(scoreAnswer(true, 1000, 16000, 15000, false).speedBonus).toBe(0);
    expect(scoreAnswer(true, 1000, 16000, 1000, true).total).toBe(300);
    expect(scoreAnswer(false, 1000, 16000, 1000, false).total).toBe(0);
    expect(scoreAnswer(true, 1000, 16000, null, false).total).toBe(0);
    expect(scoreAnswer(true, 1000, 16000, 16000, false).total).toBe(0);
  });
  it("locks submissions, scores once, rejects previous rounds and reveals real results", () => {
    const { room, host, guest } = fixture();
    open(room);
    const q = room.quiz!,
      c = context(room),
      time = q.phaseStartedAt + 1000;
    applyAction(
      room,
      host.id,
      { type: "answer", optionIndex: q.correctIndex, ...c },
      time,
    );
    expect(() =>
      applyAction(
        room,
        host.id,
        { type: "answer", optionIndex: q.correctIndex, ...c },
        time + 1,
      ),
    ).toThrow("rögzítettük");
    applyAction(
      room,
      guest.id,
      { type: "answer", optionIndex: (q.correctIndex + 1) % 4, ...c },
      time + 2,
    );
    expect(room.phase).toBe("results");
    expect(q.result!.players.find((p) => p.playerId === host.id)!.total).toBe(
      146,
    );
    const score = q.participants[0].score;
    advanceQuiz(room, q.deadline!);
    expect(room.phase).toBe("leaderboard");
    advanceQuiz(room, q.deadline!);
    expect(q.participants[0].score).toBe(score);
    expect(() =>
      applyAction(
        room,
        host.id,
        { type: "answer", optionIndex: 0, ...c },
        q.phaseStartedAt + 1,
      ),
    ).toThrow("lezárult");
  });
  it("automatically expires unanswered questions and advances delayed deadlines", () => {
    const { room } = fixture();
    open(room);
    const start = room.quiz!.phaseStartedAt;
    advanceQuiz(room, start + GAME_TIMING.question);
    expect(room.phase).toBe("results");
    expect(
      room.quiz!.result!.players.every(
        (p) => p.total === 0 && p.optionIndex === null,
      ),
    ).toBe(true);
    advanceQuiz(
      room,
      start +
        GAME_TIMING.question +
        GAME_TIMING.results +
        GAME_TIMING.leaderboard,
    );
    expect(room.quiz!.round).toBe(2);
    expect(room.phase).toBe("sabotage-selection");
    open(room);
    expect(room.phase).toBe("question");
    const { room: delayed, now } = fixture();
    advanceQuiz(delayed, now + 60 * 60 * 1000);
    expect(delayed.phase).toBe("final-results");
    expect(delayed.quiz!.round).toBe(6);
  });
  for (const count of [6, 12, 18] as const)
    for (const difficulty of ["easy", "normal", "hard"] as const)
      it(`completes ${count} ${difficulty} questions without repetition, with exact votes and finale length`, () => {
        const { room, host, guest } = fixture(count, difficulty);
        let votes = 0,
          questions = 0,
          finale = 0;
        const ids: string[] = [];
        const offers: string[] = [];
        while (room.phase !== "final-results") {
          const q = room.quiz!;
          if (room.phase === "category-vote") {
            votes++;
            if (votes <= 4) {
              expect(q.categoryOptions.some((id) => offers.includes(id))).toBe(
                false,
              );
              offers.push(...q.categoryOptions);
            }
            applyAction(
              room,
              host.id,
              {
                type: "vote",
                categoryId: q.categoryOptions[0],
                ...context(room),
              },
              q.phaseStartedAt + 1,
            );
          }
          if (room.phase === "question") {
            questions++;
            ids.push(q.currentQuestionId!);
            if (publicRoom(room).game!.isFinale) finale++;
            const c = context(room),
              time = q.phaseStartedAt + 500;
            applyAction(
              room,
              host.id,
              { type: "answer", optionIndex: q.correctIndex, ...c },
              time,
            );
            applyAction(
              room,
              guest.id,
              { type: "answer", optionIndex: (q.correctIndex + 1) % 4, ...c },
              time + 1,
            );
          }
          if (room.quiz!.deadline !== null)
            advanceQuiz(room, room.quiz!.deadline!);
        }
        expect(votes).toBe(count / 3);
        expect(questions).toBe(count);
        expect(new Set(ids).size).toBe(count);
        expect(finale).toBe(count === 6 ? 2 : count === 12 ? 3 : 4);
        expect(ranking(room)[0].id).toBe(host.id);
        expect(ranking(room)[0].correctAnswers).toBe(count);
        expect(ranking(room)[1].score).toBe(0);
      });
  it("shares equal-score ranks with deterministic ordering", () => {
    const { room } = fixture();
    expect(ranking(room).map((p) => p.rank)).toEqual([1, 1]);
    room.quiz!.participants.reverse();
    expect(ranking(room)[0].nickname).toBe("Házigazda");
  });
  it("preserves offline scores, transfers host and supports a host-only clean rematch", () => {
    const { room, host, guest } = fixture();
    open(room);
    const q = room.quiz!,
      c = context(room);
    applyAction(
      room,
      host.id,
      { type: "answer", optionIndex: q.correctIndex, ...c },
      q.phaseStartedAt + 1,
    );
    applyAction(
      room,
      guest.id,
      { type: "answer", optionIndex: q.correctIndex, ...c },
      q.phaseStartedAt + 2,
    );
    const points = q.participants[0].score;
    host.connected = false;
    host.disconnectedAt = q.phaseStartedAt;
    pruneDisconnected(room, q.phaseStartedAt + 90001);
    expect(room.hostId).toBe(guest.id);
    expect(room.players).toHaveLength(2);
    expect(q.participants[0].score).toBe(points);
    advanceQuiz(room, q.phaseStartedAt + 60 * 60 * 1000);
    expect(room.phase).toBe("final-results");
    const stale = context(room);
    host.connected = true;
    host.graceExpired = false;
    expect(() =>
      applyAction(
        room,
        host.id,
        { type: "rematch", sessionId: q.sessionId, phaseId: q.phaseId },
        q.phaseStartedAt + 1,
      ),
    ).toThrow("házigazda");
    applyAction(
      room,
      guest.id,
      { type: "rematch", sessionId: q.sessionId, phaseId: q.phaseId },
      q.phaseStartedAt + 1,
    );
    expect(room.phase).toBe("lobby");
    expect(room.quiz).toBeNull();
    expect(room.players.every((p) => !p.ready)).toBe(true);
    expect(room.recentQuestionIds.length).toBeGreaterThan(0);
    expect(() =>
      applyAction(
        room,
        guest.id,
        { type: "answer", optionIndex: 0, ...stale },
        q.phaseStartedAt + 2,
      ),
    ).toThrow();
    room.players.forEach((p) => {
      p.ready = true;
    });
    applyAction(
      room,
      guest.id,
      { type: "start", settingsRevision: room.settingsRevision },
      q.phaseStartedAt + 3,
    );
    expect(room.quiz!.sessionId).not.toBe(stale.sessionId);
    expect(
      room.quiz!.participants.every(
        (p) => p.score === 0 && p.correctAnswers === 0,
      ),
    ).toBe(true);
    expect(() =>
      applyAction(
        room,
        guest.id,
        { type: "vote", categoryId: room.quiz!.categoryOptions[0], ...stale },
        q.phaseStartedAt + 4,
      ),
    ).toThrow("lezárult");
  });
  it("upgrades deployed legacy lobbies and placeholder sessions non-destructively", () => {
    const { room, host } = fixture();
    const old = {
      ...room,
      schemaVersion: undefined,
      quiz: undefined,
      phase: "session",
    } as unknown as typeof room;
    expect(upgradeRoom(old)).toBe(true);
    expect(old.phase).toBe("lobby");
    expect(old.players[0].id).toBe(host.id);
    expect(old.players[0].credentialHash).toBe("host");
    expect(old.notice).toContain("Frissült");
    expect(upgradeRoom(old)).toBe(false);
  });
  it("keeps withdrawn players historical totals in the final table", () => {
    const { room, host, guest } = fixture();
    open(room);
    const q = room.quiz!,
      c = context(room);
    applyAction(
      room,
      host.id,
      { type: "answer", optionIndex: q.correctIndex, ...c },
      q.phaseStartedAt + 1,
    );
    applyAction(
      room,
      guest.id,
      { type: "answer", optionIndex: q.correctIndex, ...c },
      q.phaseStartedAt + 2,
    );
    const score = q.participants[0].score;
    applyAction(room, host.id, { type: "leave" }, q.phaseStartedAt + 3);
    expect(q.participants[0].left).toBe(true);
    expect(q.participants[0].score).toBe(score);
    expect(ranking(room).some((p) => p.id === host.id)).toBe(true);
  });
});
