import { describe, expect, it } from "vitest";
import {
  applyAction,
  createRoom,
  joinRoom,
  makePlayer,
  parseAction,
  publicRoom,
  upgradeRoom,
  type StoredRoom,
} from "../src/server/model";
import { advanceQuiz, scoreAnswer, type StoredQuiz } from "../src/server/quiz";
import { combineEffects } from "../src/server/sabotage";
import {
  ABILITIES,
  presentationAt,
  type AbilityId,
} from "../src/shared/sabotage";
import { emptySlime, slimeComplete } from "../src/client/slime";

function context(room: StoredRoom) {
  const q = room.quiz!;
  return { sessionId: q.sessionId, phaseId: q.phaseId, round: q.round };
}
function fixture(finale = true, count: 6 | 12 | 18 = 6) {
  const start = Date.now(),
    host = makePlayer("Mester", "paca", "host", start),
    guest = makePlayer("Vendég", "zum", "guest", start + 1);
  host.connected = guest.connected = host.ready = guest.ready = true;
  const room = createRoom("ABCD234", host, start);
  joinRoom(room, guest);
  room.settings.questionCount = count;
  applyAction(
    room,
    host.id,
    { type: "start", settingsRevision: room.settingsRevision },
    start,
  );
  const target = finale ? count - { 6: 2, 12: 3, 18: 4 }[count] + 1 : 1;
  while (room.phase !== "question" || room.quiz!.round !== target)
    advanceQuiz(room, room.quiz!.deadline!);
  return { room, host, guest, q: room.quiz!, start: room.quiz!.phaseStartedAt };
}
function answer(room: StoredRoom, id: string, index: number, now: number) {
  applyAction(
    room,
    id,
    { type: "answer", optionIndex: index, ...context(room) },
    now,
  );
}
function ice(room: StoredRoom, id: string, now: number) {
  applyAction(room, id, { type: "ice-tap", ...context(room) }, now);
}
function effect(room: StoredRoom, id: string, abilities: AbilityId[]) {
  room.quiz!.sabotage!.effects[id] = combineEffects(
    abilities.map((abilityId, i) => ({
      attackerId: `attacker${i}`,
      targetId: id,
      abilityId,
      outcome: "applied",
    })),
    room.quiz!.phaseStartedAt,
    4,
  );
  return room.quiz!.sabotage!.effects[id];
}
describe("breakable authoritative ice", () => {
  it.each([
    [1, 3],
    [2, 4],
    [3, 5],
    [7, 5],
  ])(
    "resolves %i freezes into %i accepted taps and unlocks early",
    (count, required) => {
      const { room, host, q, start } = fixture(false);
      const e = effect(
        room,
        host.id,
        Array.from({ length: count }, () => "freeze"),
      );
      expect(e.iceRequiredTaps).toBe(required);
      const deadline = q.deadline;
      for (let n = 0; n < required; n++) {
        expect(() =>
          answer(room, host.id, q.correctIndex, start + n * 100),
        ).toThrow("fagyasztás");
        ice(room, host.id, start + n * 100);
      }
      expect(q.iceProgress[host.id].brokenAt).toBe(
        start + (required - 1) * 100,
      );
      answer(room, host.id, q.correctIndex, start + (required - 1) * 100 + 1);
      expect(q.answers[host.id].receivedAt).toBeLessThan(e.freezeUntil);
      expect(q.deadline).toBe(deadline);
      expect(publicRoom(room, host.id).game!.myIce).toMatchObject({
        acceptedTaps: required,
        broken: true,
      });
    },
  );
  it("rejects bursts, stale contexts, inactive ice, offline identity and forged ownership", () => {
    const { room, host, guest, start, q } = fixture(false);
    effect(room, host.id, ["freeze"]);
    expect(() => ice(room, guest.id, start)).toThrow("nincs aktív");
    const parsed = parseAction({
      type: "ice-tap",
      ...context(room),
      playerId: guest.id,
      acceptedTaps: 99,
      broken: true,
    });
    applyAction(room, host.id, parsed, start);
    expect(q.iceProgress[guest.id]).toBeUndefined();
    expect(q.iceProgress[host.id].acceptedTaps).toBe(1);
    expect(() => ice(room, host.id, start + 79)).toThrow("lassabban");
    expect(q.iceProgress[host.id].acceptedTaps).toBe(1);
    for (const patch of [
      { round: 1 + q.round },
      { phaseId: crypto.randomUUID() },
      { sessionId: crypto.randomUUID() },
    ])
      expect(() =>
        applyAction(
          room,
          host.id,
          { type: "ice-tap", ...context(room), ...patch },
          start + 100,
        ),
      ).toThrow("lezárult");
    host.connected = false;
    expect(() => ice(room, host.id, start + 100)).toThrow("megszakadt");
  });
  it.each(["shuffle", "roulette"] as const)(
    "breaking ice preserves independent %s lock and other absolute effects",
    (ability) => {
      const { room, host, q, start } = fixture();
      const e = effect(room, host.id, [
        "freeze",
        ability,
        "upside-down",
        "slime",
        "ink",
      ]);
      const before = structuredClone(e);
      for (let i = 0; i < 3; i++) ice(room, host.id, start + i * 100);
      expect(() => answer(room, host.id, q.correctIndex, start + 201)).toThrow(
        "rendeződnek",
      );
      expect(
        presentationAt(
          e,
          start + 201,
          4,
          publicRoom(room, host.id).game!.myIce,
        ),
      ).toMatchObject({ frozen: false, locked: true });
      expect(e).toEqual(before);
      answer(room, host.id, q.correctIndex, e.motionUnlockAt);
      expect(q.answers[host.id]).toBeDefined();
      expect(e.answerUnlockAt - start).toBeLessThanOrEqual(2000);
    },
  );
  it("reconstructs partial progress, rejects after break and auto-thaws at the original deadline", () => {
    const { room, host, q, start } = fixture(false);
    const e = effect(room, host.id, ["freeze"]);
    ice(room, host.id, start + 100);
    const copy = structuredClone(room);
    expect(publicRoom(copy, host.id).game!.myIce!.acceptedTaps).toBe(1);
    ice(copy, host.id, start + 200);
    ice(copy, host.id, start + 300);
    expect(() => ice(copy, host.id, start + 400)).toThrow("nincs aktív");
    expect(() => ice(room, host.id, e.freezeUntil)).toThrow("nincs aktív");
    answer(room, host.id, q.correctIndex, e.freezeUntil);
    expect(q.answers[host.id].receivedAt).toBe(start + 1200);
  });
});
describe("multi-guess finale scoring and privacy", () => {
  it.each([0, 1, 2, 3])(
    "scores a correct guess after %i errors from its correct reception time only",
    (wrongCount) => {
      const { room, host, guest, q, start } = fixture();
      const wrong = q.options
        .map((_, i) => i)
        .filter((i) => i !== q.correctIndex);
      for (let i = 0; i < wrongCount; i++)
        answer(room, host.id, wrong[i], start + 100 + i * 100);
      expect(room.phase).toBe("question");
      expect(q.answers[host.id]).toBeUndefined();
      answer(room, host.id, q.correctIndex, start + 8400);
      expect(() => answer(room, host.id, q.correctIndex, start + 8500)).toThrow(
        "rögzítettük",
      );
      answer(room, guest.id, q.correctIndex, start + 8500);
      const r = q.result!.players.find((p) => p.playerId === host.id)!;
      expect(r).toMatchObject({
        wrongAttempts: wrongCount,
        mistakePenalty: wrongCount * 30,
        basePoints: 100 - wrongCount * 30,
        speedBonus: 21,
        total: (100 - wrongCount * 30 + 21) * 2,
        responseTimeMs: 8400,
      });
      expect(r.attempts).toHaveLength(wrongCount + 1);
      expect(q.participants[0]).toMatchObject({
        correctAnswers: 1,
        answeredQuestions: 1,
        responseTimeTotalMs: 8400,
        score: r.total,
      });
      const saved = structuredClone(room);
      advanceQuiz(room, q.deadline!);
      expect(q.participants).toEqual(saved.quiz!.participants);
    },
  );
  it("matches exact point maxima and the documented two-mistake example", () => {
    expect(
      [0, 1, 2, 3].map(
        (n) => scoreAnswer(true, 1000, 16000, 1000, true, n).total,
      ),
    ).toEqual([300, 240, 180, 120]);
    // The existing eight-second bucket gives 21 speed points.
    expect(scoreAnswer(true, 1000, 16000, 9000, true, 2).total).toBe(122);
    expect(scoreAnswer(true, 1000, 16000, 15999, true, 3).total).toBe(20);
    expect(scoreAnswer(false, 1000, 16000, 1200, true, 3).total).toBe(0);
    expect(scoreAnswer(true, 1000, 16000, 16000, true, 0).total).toBe(0);
    expect(scoreAnswer(true, 1000, 16000, 1000, false, 3).total).toBe(150);
  });
  it("eliminates canonical options only for their owner, persists guesses and never auto-selects the last choice", () => {
    const { room, host, guest, q, start } = fixture();
    const wrong = q.options
      .map((_, i) => i)
      .filter((i) => i !== q.correctIndex);
    for (const [i, index] of wrong.entries())
      answer(room, host.id, index, start + 100 + i * 100);
    expect(room.phase).toBe("question");
    expect(q.answers[host.id]).toBeUndefined();
    const mine = publicRoom(room, host.id).game!,
      other = publicRoom(room, guest.id).game!;
    expect(mine.myFinale).toMatchObject({
      eliminatedOptions: wrong,
      wrongAttempts: 3,
      finished: false,
    });
    expect(other.myFinale!.attempts).toEqual([]);
    expect(other.answeredPlayerIds).toEqual([]);
    for (const data of [mine, other]) {
      expect(JSON.stringify(data)).not.toMatch(
        /correctIndex|receivedAt|lastTapAt|finaleAttempts/,
      );
      expect(data.result).toBeNull();
    }
    const copy = structuredClone(room);
    expect(() => answer(copy, host.id, wrong[0], start + 400)).toThrow(
      "kipróbáltad",
    );
    expect(copy.quiz!.finaleAttempts[host.id]).toHaveLength(3);
    answer(copy, guest.id, wrong[0], start + 450);
    expect(copy.quiz!.finaleAttempts[guest.id]).toHaveLength(1);
    advanceQuiz(copy, q.deadline!);
    expect(copy.quiz!.participants[0]).toMatchObject({
      score: 0,
      answeredQuestions: 1,
      correctAnswers: 0,
      responseTimeTotalMs: 300,
    });
    expect(copy.quiz!.result!.players[0]).toMatchObject({
      total: 0,
      optionIndex: wrong[2],
      wrongAttempts: 3,
    });
  });
  it.each([false, true])(
    "finishes once on timeout with attempts=%s, rejects a correct answer at deadline",
    (attempted) => {
      const { room, host, q, start } = fixture();
      if (attempted)
        answer(room, host.id, (q.correctIndex + 1) % 4, start + 100);
      const c = context(room),
        deadline = q.deadline!;
      expect(() =>
        applyAction(
          room,
          host.id,
          { type: "answer", optionIndex: q.correctIndex, ...c },
          deadline,
        ),
      ).toThrow("lezárult");
      expect(q.participants[0]).toMatchObject({
        score: 0,
        correctAnswers: 0,
        answeredQuestions: attempted ? 1 : 0,
      });
      const scores = structuredClone(q.participants);
      advanceQuiz(room, deadline + 10000);
      expect(q.participants).toEqual(scores);
    },
  );
  it("retains normal single-answer locking even when the accepted answer is wrong", () => {
    const { room, host, guest, q, start } = fixture(false);
    answer(room, host.id, (q.correctIndex + 1) % 4, start + 100);
    expect(() => answer(room, host.id, q.correctIndex, start + 200)).toThrow(
      "rögzítettük",
    );
    answer(room, guest.id, q.correctIndex, start + 201);
    expect(room.phase).toBe("results");
    expect(q.result!.players[0].total).toBe(0);
    expect(q.finaleAttempts).toEqual({});
  });
  it.each(ABILITIES.map((a) => a.id))(
    "preserves retries, identity, schedules and scoring under %s",
    (ability) => {
      const { room, host, guest, q, start } = fixture();
      const e = effect(room, host.id, [ability]);
      const at = e.answerUnlockAt + 1;
      const displayed = presentationAt(e, at, 4).order;
      const wrong = displayed.find((i) => i !== q.correctIndex)!;
      const before = structuredClone(e);
      answer(room, host.id, wrong, at);
      expect(() => answer(room, host.id, wrong, at + 1)).toThrow("kipróbáltad");
      expect(
        publicRoom(room, host.id).game!.myFinale!.eliminatedOptions,
      ).toEqual([wrong]);
      answer(room, host.id, q.correctIndex, at + 200);
      answer(room, guest.id, q.correctIndex, at + 300);
      expect(q.sabotage!.effects[host.id]).toEqual(before);
      expect(q.result!.players[0]).toMatchObject({
        correct: true,
        optionIndex: q.correctIndex,
        wrongAttempts: 1,
        basePoints: 70,
      });
      expect(q.participants[0].responseTimeTotalMs).toBe(at + 200 - start);
    },
  );
  it("supports the maximum mixed schedule without losing attacks or wrong-answer identities", () => {
    const { room, host, guest, q } = fixture();
    const e = effect(room, host.id, [
      "freeze",
      "freeze",
      "slime",
      "shuffle",
      "ink",
      "roulette",
      "upside-down",
    ]);
    const at = e.answerUnlockAt + 1;
    expect(e.answerUnlockAt - q.phaseStartedAt).toBe(2000);
    answer(room, host.id, (q.correctIndex + 1) % 4, at);
    answer(room, host.id, q.correctIndex, at + 100);
    answer(room, guest.id, q.correctIndex, at + 200);
    expect(q.result!.players[0].total).toBeGreaterThan(0);
    expect(Object.values(e.counts).reduce((a, b) => a + b, 0)).toBe(7);
  });
  it.each([6, 12, 18] as const)(
    "uses multi-guess on every finale question of a %i match and resets state for rematch",
    (count) => {
      const { room, host, guest } = fixture(true, count);
      let rounds = 0;
      const old = context(room);
      while (room.phase !== "final-results") {
        if (room.phase === "question") {
          rounds++;
          const q = room.quiz!,
            at = q.phaseStartedAt + 2100;
          answer(room, host.id, (q.correctIndex + 1) % 4, at);
          answer(room, host.id, q.correctIndex, at + 100);
          answer(room, guest.id, q.correctIndex, at + 200);
        }
        if (room.quiz!.deadline !== null)
          advanceQuiz(room, room.quiz!.deadline!);
      }
      expect(rounds).toBe({ 6: 2, 12: 3, 18: 4 }[count]);
      applyAction(
        room,
        host.id,
        {
          type: "rematch",
          sessionId: room.quiz!.sessionId,
          phaseId: room.quiz!.phaseId,
        },
        room.quiz!.phaseStartedAt + 1,
      );
      expect(room.quiz).toBeNull();
      host.ready = guest.ready = true;
      applyAction(
        room,
        host.id,
        { type: "start", settingsRevision: room.settingsRevision },
        Date.now() + 1000000,
      );
      expect(room.quiz!.iceProgress).toEqual({});
      expect(room.quiz!.finaleAttempts).toEqual({});
      expect(() =>
        applyAction(
          room,
          host.id,
          { type: "ice-tap", ...old },
          room.quiz!.phaseStartedAt + 1,
        ),
      ).toThrow("lezárult");
    },
  );
});
describe("additive legacy upgrade and bounded cleaning rules", () => {
  it("preserves an in-progress legacy finale answer and uses new rules only on the next prepared question", () => {
    const { room, host, q, start } = fixture();
    q.answers[host.id] = {
      optionIndex: (q.correctIndex + 1) % 4,
      receivedAt: start + 100,
    };
    const old = q as Partial<StoredQuiz>;
    delete old.answeringMode;
    delete old.finaleAttempts;
    delete old.iceProgress;
    const e = q.sabotage!.effects[host.id];
    delete (e as Partial<typeof e>).motionUnlockAt;
    delete (e as Partial<typeof e>).iceRequiredTaps;
    (room as { schemaVersion: number }).schemaVersion = 3;
    const before = structuredClone(room);
    expect(upgradeRoom(room)).toBe(true);
    expect(upgradeRoom(room)).toBe(false);
    expect(q.answeringMode).toBe("single");
    expect(q.answers).toEqual(before.quiz!.answers);
    expect(q.deadline).toBe(before.quiz!.deadline);
    expect(q.participants).toEqual(before.quiz!.participants);
    expect(() => answer(room, host.id, q.correctIndex, start + 200)).toThrow(
      "rögzítettük",
    );
    advanceQuiz(room, q.deadline!);
    while (room.phase !== "question") advanceQuiz(room, q.deadline!);
    expect(q.answeringMode).toBe("multi-guess");
    expect(q.finaleAttempts).toEqual({});
    expect(q.iceProgress).toEqual({});
  });
  it("does not complete on a tap, a short stroke or coverage alone; uses four accessible steps", () => {
    expect(slimeComplete(emptySlime(), 1)).toBe(false);
    expect(
      slimeComplete({ ...emptySlime(), strokes: 2, distance: 0.8 }, 1),
    ).toBe(false);
    expect(
      slimeComplete({ ...emptySlime(), strokes: 2, distance: 1.4 }, 0.44),
    ).toBe(false);
    expect(
      slimeComplete({ ...emptySlime(), strokes: 2, distance: 1.4 }, 0.5),
    ).toBe(true);
    expect(slimeComplete({ ...emptySlime(), keyboardSteps: 3 }, 1)).toBe(false);
    expect(slimeComplete({ ...emptySlime(), keyboardSteps: 4 }, 0)).toBe(true);
  });
});
