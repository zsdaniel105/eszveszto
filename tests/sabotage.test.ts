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
  type StoredRoom,
} from "../src/server/model";
import { advanceQuiz } from "../src/server/quiz";
import { combineEffects, resolveSabotage } from "../src/server/sabotage";
import {
  ABILITIES,
  presentationAt,
  SABOTAGE_BALANCE,
  type AbilityId,
  type AttackRecord,
} from "../src/shared/sabotage";
import type { QuestionCount } from "../src/shared/game";
function context(room: StoredRoom) {
  const q = room.quiz!;
  return { sessionId: q.sessionId, phaseId: q.phaseId, round: q.round };
}
function fixture(n = 2, count: QuestionCount = 6) {
  const now = Date.now();
  const players = Array.from({ length: n }, (_, i) =>
    makePlayer(`Játékos ${i + 1}`, "paca", `hash-${i}`, now + i),
  );
  const room = createRoom("ABC2345", players[0], now);
  players.slice(1).forEach((p) => joinRoom(room, p));
  players.forEach((p) => {
    p.connected = true;
    p.disconnectedAt = null;
    p.ready = true;
  });
  room.settings.questionCount = count;
  applyAction(room, players[0].id, { type: "start", settingsRevision: 1 }, now);
  advanceQuiz(room, room.quiz!.deadline!);
  expect(room.phase).toBe("sabotage-selection");
  return { room, players };
}
function attack(
  room: StoredRoom,
  attacker: number,
  target: number,
  abilityId: AbilityId,
  now = room.quiz!.phaseStartedAt + 1,
) {
  const s = room.quiz!.sabotage!;
  const player = room.players[attacker];
  s.offers[player.id] = [
    abilityId,
    ...ABILITIES.map((a) => a.id)
      .filter((id) => id !== abilityId)
      .slice(0, 2),
  ];
  applyAction(
    room,
    player.id,
    {
      type: "attack",
      abilityId,
      targetId: room.players[target].id,
      ...context(room),
    },
    now,
  );
}
function open(room: StoredRoom) {
  while (room.phase !== "question") advanceQuiz(room, room.quiz!.deadline!);
}
const records = (abilityId: AbilityId, count = 1): AttackRecord[] =>
  Array.from({ length: count }, (_, i) => ({
    attackerId: `attacker-${i}`,
    targetId: "target",
    abilityId,
    outcome: "applied",
  }));
describe("authoritative sabotage selection", () => {
  it.each([2, 4, 8])(
    "offers exactly three distinct valid abilities to every player in a %i-player match",
    (n) => {
      const { room, players } = fixture(n);
      for (const p of players) {
        const offers = room.quiz!.sabotage!.offers[p.id];
        expect(offers).toHaveLength(3);
        expect(new Set(offers).size).toBe(3);
        expect(offers.every((id) => ABILITIES.some((a) => a.id === id))).toBe(
          true,
        );
      }
    },
  );
  it("keeps offers stable and selections private across snapshot/reconstruction", () => {
    const { room, players } = fixture();
    const before = publicRoom(room, players[0].id).game!.sabotage!;
    const restored = structuredClone(room);
    expect(publicRoom(restored, players[0].id).game!.sabotage!.offers).toEqual(
      before.offers,
    );
    attack(restored, 0, 1, before.offers[0]);
    const other = publicRoom(restored, players[1].id).game!;
    expect(other.sabotage!.myChoice).toBeNull();
    expect(other.sabotage!.incoming).toEqual([]);
    expect(other.sabotage!.effects).toBeNull();
    expect(other.question).toBeNull();
    expect(JSON.stringify(other)).not.toContain("correctIndex");
    expect(JSON.stringify(other.sabotage)).not.toContain("choices");
    expect(other.sabotage!.targets.map((p) => p.id)).toEqual([players[0].id]);
  });
  it("rejects unoffered/unknown abilities, self targets, unknown targets and malformed protocol", () => {
    const { room, players } = fixture();
    const c = context(room),
      s = room.quiz!.sabotage!;
    const missing = ABILITIES.find(
      (a) => !s.offers[players[0].id].includes(a.id),
    )!.id;
    expect(() =>
      applyAction(
        room,
        players[0].id,
        { type: "attack", abilityId: missing, targetId: players[1].id, ...c },
        room.quiz!.phaseStartedAt + 1,
      ),
    ).toThrow("felkínált");
    expect(() =>
      applyAction(
        room,
        players[0].id,
        {
          type: "attack",
          abilityId: s.offers[players[0].id][0],
          targetId: players[0].id,
          ...c,
        },
        room.quiz!.phaseStartedAt + 1,
      ),
    ).toThrow("Magadat");
    expect(() =>
      applyAction(
        room,
        players[0].id,
        {
          type: "attack",
          abilityId: s.offers[players[0].id][0],
          targetId: crypto.randomUUID(),
          ...c,
        },
        room.quiz!.phaseStartedAt + 1,
      ),
    ).toThrow("elérhető");
    expect(() =>
      parseAction({
        type: "attack",
        abilityId: "invented",
        targetId: players[1].id,
        ...c,
      }),
    ).toThrow();
    expect(() =>
      parseAction({
        type: "attack",
        abilityId: "freeze",
        targetId: "fake",
        ...c,
      }),
    ).toThrow();
    expect(parseAction({ type: "skip-attack", ...c })).toEqual({
      type: "skip-attack",
      ...c,
    });
  });
  it("rejects old session, round and phase, double commitment and late actions", () => {
    const { room, players } = fixture();
    const c = context(room),
      at = room.quiz!.phaseStartedAt + 1;
    for (const patch of [
      { sessionId: crypto.randomUUID() },
      { round: 2 },
      { phaseId: crypto.randomUUID() },
    ])
      expect(() =>
        applyAction(
          room,
          players[0].id,
          { type: "skip-attack", ...c, ...patch },
          at,
        ),
      ).toThrow("lezárult");
    attack(room, 0, 1, "freeze", at);
    expect(() =>
      applyAction(room, players[0].id, { type: "skip-attack", ...c }, at + 1),
    ).toThrow("rögzítettük");
    expect(() => attack(room, 0, 1, "freeze", at + 1)).toThrow("rögzítettük");
    expect(() =>
      applyAction(
        room,
        players[1].id,
        { type: "skip-attack", ...c },
        room.quiz!.deadline!,
      ),
    ).toThrow("lezárult");
    open(room);
    expect(() =>
      applyAction(
        room,
        players[1].id,
        { type: "skip-attack", ...context(room) },
        room.quiz!.phaseStartedAt + 1,
      ),
    ).toThrow("Most nem");
  });
  it("records explicit and timeout skips, and finishes selection early only after every eligible commitment", () => {
    const { room, players } = fixture(4);
    const c = context(room),
      at = room.quiz!.phaseStartedAt + 1;
    for (const p of players.slice(0, 3))
      applyAction(room, p.id, { type: "skip-attack", ...c }, at);
    expect(room.phase).toBe("sabotage-selection");
    applyAction(room, players[3].id, { type: "skip-attack", ...c }, at + 1);
    expect(room.phase).toBe("sabotage-reveal");
    expect(room.quiz!.deadline).toBe(at + 1 + 1500);
    expect(
      Object.values(room.quiz!.sabotage!.choices).every(
        (v) => v.type === "skip" && v.reason === "explicit",
      ),
    ).toBe(true);
    const { room: timed } = fixture();
    advanceQuiz(timed, timed.quiz!.deadline!);
    expect(
      Object.values(timed.quiz!.sabotage!.choices).every(
        (v) => v.type === "skip" && v.reason === "timeout",
      ),
    ).toBe(true);
  });
});
describe("bounded composition and all six mechanics", () => {
  it("freezes for 1.2 seconds, then diminishing 1.6/1.8/2.0 seconds, capped at two", () => {
    expect(
      [1, 2, 3, 4, 7].map(
        (n) => combineEffects(records("freeze", n), 1000, 4).freezeUntil - 1000,
      ),
    ).toEqual([1200, 1600, 1800, 2000, 2000]);
  });
  it("enforces Freeze on the server, preserving the original deadline, score calculation and answer lock", () => {
    const { room, players } = fixture();
    attack(room, 1, 0, "freeze");
    open(room);
    const q = room.quiz!,
      c = context(room),
      start = q.phaseStartedAt,
      end = q.deadline;
    expect(() =>
      applyAction(
        room,
        players[0].id,
        { type: "answer", optionIndex: q.correctIndex, ...c },
        start + 1199,
      ),
    ).toThrow("fagyasztás");
    expect(q.answers[players[0].id]).toBeUndefined();
    expect(q.deadline).toBe(end);
    applyAction(
      room,
      players[0].id,
      { type: "answer", optionIndex: q.correctIndex, ...c },
      start + 1200,
    );
    expect(() =>
      applyAction(
        room,
        players[0].id,
        { type: "answer", optionIndex: 0, ...c },
        start + 1300,
      ),
    ).toThrow("rögzítettük");
    applyAction(
      room,
      players[1].id,
      { type: "answer", optionIndex: (q.correctIndex + 1) % 4, ...c },
      start + 1400,
    );
    expect(
      q.result!.players.find((p) => p.playerId === players[0].id)!.total,
    ).toBe(146);
  });
  it("makes slime removable patches with capped diminishing count", () => {
    const single = combineEffects(records("slime"), 1000, 4),
      stacked = combineEffects(records("slime", 7), 1000, 4);
    expect(single.slimePatches).toBe(2);
    expect(stacked.slimePatches).toBe(3);
    expect(stacked.counts.slime).toBe(7);
    expect(presentationAt(single, 1000, 4).overlays).toBe(true);
    expect(presentationAt(single, 5500, 4).overlays).toBe(false);
  });
  it("gives ink distinct capped patches, sharing an obstruction ceiling with slime", () => {
    const e = combineEffects(
      [...records("slime", 3), ...records("ink", 4)],
      1000,
      4,
    );
    expect(e.inkPatches).toBe(3);
    expect(e.slimePatches).toBe(3);
    const area =
      ((e.slimePatches * SABOTAGE_BALANCE.slimeHeightPercent +
        e.inkPatches * SABOTAGE_BALANCE.inkHeightPercent) *
        SABOTAGE_BALANCE.patchWidthPercent) /
      100;
    expect(area).toBeLessThanOrEqual(25);
  });
  it("limits shuffle to one or two discrete rearrangements with stable canonical answer identities", () => {
    const single = combineEffects(records("shuffle"), 1000, 4),
      many = combineEffects(records("shuffle", 7), 1000, 4);
    expect(single.frames).toHaveLength(1);
    expect(many.frames).toHaveLength(2);
    expect(presentationAt(single, 1649, 4).order).toEqual([0, 1, 2, 3]);
    expect(presentationAt(single, 1650, 4).order).not.toEqual([0, 1, 2, 3]);
    for (const e of [single, many])
      for (const f of e.frames)
        expect([...f.order].sort()).toEqual([0, 1, 2, 3]);
    expect(presentationAt(many, 2450, 4).locked).toBe(false);
  });
  it("cycles roulette only for two seconds and merges shuffle into its bounded schedule", () => {
    const e = combineEffects(
      [...records("roulette", 3), ...records("shuffle", 4)],
      1000,
      4,
    );
    expect(e.frames).toHaveLength(5);
    expect(e.answerUnlockAt).toBe(3000);
    expect(presentationAt(e, 2999, 4).locked).toBe(true);
    expect(presentationAt(e, 3000, 4).locked).toBe(false);
    expect(presentationAt(e, 14000, 4).order).toEqual(
      presentationAt(e, 3000, 4).order,
    );
    for (const f of e.frames) expect([...f.order].sort()).toEqual([0, 1, 2, 3]);
  });
  it("turns text upside down briefly, restores it, and schedules obstruction after rotation", () => {
    const e = combineEffects(
      [
        ...records("upside-down", 7),
        ...records("slime"),
        ...records("freeze", 7),
      ],
      1000,
      4,
    );
    expect(e.upsideFrom).toBe(3000);
    expect(e.upsideUntil).toBe(7000);
    expect(e.overlaysFrom).toBe(7000);
    expect(presentationAt(e, 3000, 4).upsideDown).toBe(true);
    expect(presentationAt(e, 7000, 4).upsideDown).toBe(false);
    expect(presentationAt(e, 7000, 4).overlays).toBe(true);
    expect(presentationAt(e, 11500, 4).overlays).toBe(false);
  });
  it.each(["shuffle", "roulette"] as const)(
    "maps intended canonical answers under %s and keeps actual correct-answer results",
    (ability) => {
      const { room, players } = fixture();
      attack(room, 1, 0, ability);
      open(room);
      const q = room.quiz!,
        at = q.phaseStartedAt + 2100;
      const view = presentationAt(q.sabotage!.effects[players[0].id], at, 4);
      const displayed = view.order.find(
        (index) => q.options[index] === q.options[q.correctIndex],
      )!;
      applyAction(
        room,
        players[0].id,
        { type: "answer", optionIndex: displayed, ...context(room) },
        at,
      );
      applyAction(
        room,
        players[1].id,
        {
          type: "answer",
          optionIndex: (q.correctIndex + 1) % 4,
          ...context(room),
        },
        at + 1,
      );
      expect(q.result!.players[0].correct).toBe(true);
      expect(q.result!.players[0].optionIndex).toBe(q.correctIndex);
    },
  );
  it("accounts for all seven attacks on one target, preserves identities and caps mixed effects", () => {
    const { room, players } = fixture(8);
    const ids: AbilityId[] = [
      "freeze",
      "freeze",
      "freeze",
      "slime",
      "slime",
      "roulette",
      "roulette",
    ];
    ids.forEach((id, i) => attack(room, i + 1, 0, id));
    applyAction(
      room,
      players[0].id,
      { type: "skip-attack", ...context(room) },
      room.quiz!.phaseStartedAt + 2,
    );
    const s = room.quiz!.sabotage!;
    expect(s.attacks).toHaveLength(7);
    expect(new Set(s.attacks.map((a) => a.attackerId)).size).toBe(7);
    expect(s.attacks.every((a) => a.targetId === players[0].id)).toBe(true);
    open(room);
    const start = room.quiz!.phaseStartedAt,
      e = s.effects[players[0].id];
    expect(e.counts).toMatchObject({ freeze: 3, slime: 2, roulette: 2 });
    expect(e.answerUnlockAt - start).toBe(2000);
    expect(e.freezeUntil - start).toBe(1800);
    expect(
      publicRoom(room, players[0].id).game!.sabotage!.incoming,
    ).toHaveLength(7);
    for (const p of players)
      applyAction(
        room,
        p.id,
        {
          type: "answer",
          optionIndex: room.quiz!.correctIndex,
          ...context(room),
        },
        start + 2100,
      );
    expect(room.phase).toBe("results");
    expect(room.quiz!.participants.every((p) => p.correctAnswers === 1)).toBe(
      true,
    );
  });
});
describe("persistence, departures, upgrade and complete loop", () => {
  it("preserves committed attacks after attacker/target disconnect and never redirects", () => {
    const { room, players } = fixture(4);
    attack(room, 0, 1, "slime");
    players[0].connected = false;
    players[0].disconnectedAt = room.quiz!.phaseStartedAt;
    players[1].connected = false;
    players[1].disconnectedAt = room.quiz!.phaseStartedAt;
    advanceQuiz(room, room.quiz!.deadline!);
    const attacks = room.quiz!.sabotage!.attacks;
    expect(attacks).toEqual([
      {
        attackerId: players[0].id,
        targetId: players[1].id,
        abilityId: "slime",
        outcome: "applied",
      },
    ]);
    resolveSabotage(room, room.quiz!.deadline!);
    expect(room.quiz!.sabotage!.attacks).toEqual(attacks);
  });
  it("records an explicit target departure as unapplied rather than losing or redirecting the accepted attack", () => {
    const { room, players } = fixture(4);
    attack(room, 0, 1, "ink");
    applyAction(
      room,
      players[1].id,
      { type: "leave" },
      room.quiz!.phaseStartedAt + 2,
    );
    advanceQuiz(room, room.quiz!.deadline!);
    expect(room.quiz!.sabotage!.attacks[0].outcome).toBe("target-left");
    expect(room.quiz!.sabotage!.attacks[0].targetId).toBe(players[1].id);
    expect(room.quiz!.sabotage!.effects[players[1].id].inkPatches).toBe(0);
    expect(
      publicRoom(room, players[0].id).game!.sabotage!.outgoing!.outcome,
    ).toBe("target-left");
  });
  it("preserves effects and answers across reconstruction, with no restarting expired effects", () => {
    const { room, players } = fixture();
    attack(room, 1, 0, "roulette");
    open(room);
    const q = room.quiz!,
      at = q.phaseStartedAt + 2200;
    applyAction(
      room,
      players[0].id,
      { type: "answer", optionIndex: q.correctIndex, ...context(room) },
      at,
    );
    const copy = structuredClone(room);
    expect(copy.quiz!.sabotage).toEqual(q.sabotage);
    expect(copy.quiz!.answers).toEqual(q.answers);
    expect(
      presentationAt(copy.quiz!.sabotage!.effects[players[0].id], at, 4).locked,
    ).toBe(false);
    expect(() =>
      applyAction(
        copy,
        players[0].id,
        { type: "answer", optionIndex: 0, ...context(copy) },
        at + 1,
      ),
    ).toThrow("rögzítettük");
  });
  it("rejects expired offline targets while retaining their historical scores", () => {
    const { room, players } = fixture();
    players[1].connected = false;
    players[1].disconnectedAt = room.quiz!.phaseStartedAt - 90001;
    room.quiz!.participants[1].score = 400;
    pruneDisconnected(room, room.quiz!.phaseStartedAt);
    expect(() => attack(room, 0, 1, "freeze")).toThrow("elérhető");
    expect(room.quiz!.participants[1].score).toBe(400);
  });
  it.each([
    "question",
    "results",
    "leaderboard",
    "category-vote",
    "finale",
    "final-results",
  ] as const)(
    "upgrades a v2 %s in place, without resetting identity, progress or scores",
    (phase) => {
      const { room } = fixture();
      open(room);
      const q = room.quiz!;
      q.participants[0].score = 555;
      q.answers[room.players[0].id] = {
        optionIndex: 1,
        receivedAt: q.phaseStartedAt + 3000,
      };
      room.phase = phase;
      const before = structuredClone(room);
      delete (q as Partial<typeof q>).sabotage;
      (room as { schemaVersion: number }).schemaVersion = 2;
      expect(upgradeRoom(room)).toBe(true);
      expect(room.schemaVersion).toBe(4);
      expect(room.quiz!.sabotage).toBeNull();
      expect(room.phase).toBe(phase);
      expect(room.quiz!.phaseId).toBe(before.quiz!.phaseId);
      expect(room.quiz!.deadline).toBe(before.quiz!.deadline);
      expect(room.quiz!.answers).toEqual(before.quiz!.answers);
      expect(room.quiz!.participants[0].score).toBe(555);
      expect(room.players).toEqual(before.players);
      expect(upgradeRoom(room)).toBe(false);
    },
  );
  it.each([6, 12, 18] as const)(
    "runs all %i sabotage rounds with one finale, then clears state and rejects old actions on rematch",
    (count) => {
      const { room, players } = fixture(2, count);
      let selections = 0,
        finales = 0,
        answered = 0;
      let old = context(room);
      while (room.phase !== "final-results") {
        const q = room.quiz!;
        if (room.phase === "sabotage-selection") {
          selections++;
          old = context(room);
          attack(room, 0, 1, "freeze");
          applyAction(
            room,
            players[1].id,
            { type: "skip-attack", ...context(room) },
            q.phaseStartedAt + 1,
          );
        }
        if (room.phase === "finale") finales++;
        if (room.phase === "question") {
          answered++;
          const c = context(room),
            at = q.phaseStartedAt + 2200;
          for (const p of players)
            applyAction(
              room,
              p.id,
              { type: "answer", optionIndex: q.correctIndex, ...c },
              at,
            );
        }
        if (q.deadline !== null) advanceQuiz(room, q.deadline);
      }
      expect(selections).toBe(count);
      expect(answered).toBe(count);
      expect(finales).toBe(1);
      expect(
        room.quiz!.participants.every((p) => p.correctAnswers === count),
      ).toBe(true);
      applyAction(
        room,
        players[0].id,
        {
          type: "rematch",
          sessionId: room.quiz!.sessionId,
          phaseId: room.quiz!.phaseId,
        },
        room.quiz!.phaseStartedAt + 1,
      );
      expect(room.quiz).toBeNull();
      players.forEach((p) => {
        p.ready = true;
      });
      applyAction(
        room,
        players[0].id,
        { type: "start", settingsRevision: room.settingsRevision },
        Date.now() + 1000000,
      );
      expect(room.quiz!.sabotage).toBeNull();
      expect(() =>
        applyAction(
          room,
          players[0].id,
          { type: "skip-attack", ...old },
          room.quiz!.phaseStartedAt + 1,
        ),
      ).toThrow("lezárult");
    },
  );
  it("catches up an entire 18-question match without clients, without repeated effects or rewards", () => {
    const { room } = fixture(8, 18);
    advanceQuiz(room, room.quiz!.phaseStartedAt + 3600000);
    expect(room.phase).toBe("final-results");
    expect(room.quiz!.round).toBe(18);
    expect(room.quiz!.participants.every((p) => p.score === 0)).toBe(true);
    const saved = JSON.stringify(room.quiz);
    advanceQuiz(room, Date.now() + 7200000);
    expect(JSON.stringify(room.quiz)).toBe(saved);
  });
});
