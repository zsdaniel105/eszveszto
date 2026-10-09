import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { invitationQr } from "../src/client/qr";
import {
  applyAction,
  createDisplayRoom,
  createRoom,
  joinRoom,
  leaveDisplay,
  makeDisplay,
  makePlayer,
  pruneDisconnected,
  publicRoom,
  retainRoom,
  upgradeRoom,
  validateRole,
  type StoredRoom,
} from "../src/server/model";
import { advanceQuiz, scoreAnswer } from "../src/server/quiz";
import { ABILITIES } from "../src/shared/sabotage";
import { DISCONNECT_GRACE_MS, type Action } from "../src/shared/game";
const now = 100000;
function tv(count = 2) {
  const display = makeDisplay("display-hash", now);
  display.connected = true;
  display.disconnectedAt = null;
  const room = createDisplayRoom("ABCD234", display, now);
  const players = Array.from({ length: count }, (_, i) => {
    const p = makePlayer(`Játékos ${i + 1}`, "paca", `hash-${i}`, now + i + 1);
    p.connected = true;
    p.disconnectedAt = null;
    joinRoom(room, p);
    return p;
  });
  const viewer = { role: "display" as const, id: display.id };
  return { room, display, players, viewer };
}
function start(room: StoredRoom, id: string, total: 6 | 12 | 18 = 6) {
  applyAction(
    room,
    { role: "display", id },
    { type: "settings", value: { questionCount: total, difficulty: "normal" } },
    now,
  );
  room.players.forEach((p) => (p.ready = true));
  applyAction(
    room,
    { role: "display", id },
    { type: "start", settingsRevision: room.settingsRevision },
    now,
  );
}
function until(room: StoredRoom, phase: string, round: number) {
  for (
    let i = 0;
    i < 200 && (room.phase !== phase || room.quiz!.round !== round);
    i++
  )
    advanceQuiz(room, room.quiz!.deadline!);
  expect(room.phase).toBe(phase);
  expect(room.quiz!.round).toBe(round);
}
function context(room: StoredRoom) {
  const q = room.quiz!;
  return { sessionId: q.sessionId, phaseId: q.phaseId, round: q.round };
}
describe("two-mode room and role rules", () => {
  it("keeps a Normal Quiz creator as host/player and creates TV Party with no fake participant", () => {
    const normal = createRoom(
      "ABCDE23",
      makePlayer("Gazda", "paca", "normal", now),
      now,
    );
    expect(normal.mode).toBe("normal");
    expect(normal.hostRole).toBe("player");
    expect(normal.display).toBeNull();
    expect(normal.players).toHaveLength(1);
    const { room, display } = tv(0);
    expect(room.mode).toBe("tv-party");
    expect(room.hostRole).toBe("display");
    expect(room.hostId).toBe(display.id);
    expect(room.players).toEqual([]);
    expect(retainRoom(room)).toBe(true);
    expect(JSON.stringify(publicRoom(room))).not.toContain("hash");
    expect(publicRoom(room).display).not.toHaveProperty("nickname");
  });
  it("supports eight actual phone players and rejects the ninth", () => {
    const { room, display } = tv(8);
    expect(room.players).toHaveLength(8);
    expect(room.players.some((p) => p.id === display.id)).toBe(false);
    expect(() =>
      joinRoom(room, makePlayer("Kilencedik", "zum", "ninth", now)),
    ).toThrow("megtelt");
    start(room, display.id);
    expect(room.quiz!.participants).toHaveLength(8);
    expect(room.quiz!.participants.some((p) => p.id === display.id)).toBe(
      false,
    );
  });
  it("requires two connected ready players, never a ready Display", () => {
    const { room, viewer, players } = tv(1);
    players[0].ready = true;
    expect(() =>
      applyAction(room, viewer, { type: "start", settingsRevision: 1 }, now),
    ).toThrow("két");
    const p = makePlayer("Második", "zum", "second", now + 1);
    p.connected = true;
    joinRoom(room, p);
    expect(() =>
      applyAction(room, viewer, { type: "start", settingsRevision: 1 }, now),
    ).toThrow("késznek");
    p.ready = true;
    applyAction(room, viewer, { type: "start", settingsRevision: 1 }, now);
    expect(room.quiz!.participants).toHaveLength(2);
    expect(room.display).not.toHaveProperty("ready");
  });
  it("invalidates real-player readiness on Display settings changes", () => {
    const { room, viewer, players } = tv();
    players.forEach((p) => (p.ready = true));
    applyAction(
      room,
      viewer,
      { type: "settings", value: { questionCount: 18, difficulty: "hard" } },
      now,
    );
    expect(room.settingsRevision).toBe(2);
    expect(players.every((p) => !p.ready)).toBe(true);
  });
  it.each([
    "ready",
    "character",
    "vote",
    "attack",
    "skip-attack",
    "answer",
    "ice-tap",
  ])("rejects Display gameplay action %s at the server boundary", (type) => {
    const { room, viewer } = tv();
    const action = { type, value: true, settingsRevision: 1 } as Action;
    expect(() => applyAction(room, viewer, action, now)).toThrow(
      "csak játékos",
    );
  });
  it("rejects a player claiming the Display ID, credential reuse and unknown roles", () => {
    const { room, display } = tv();
    expect(() =>
      applyAction(
        room,
        display.id,
        { type: "settings", value: { questionCount: 6, difficulty: "easy" } },
        now,
      ),
    ).toThrow("Csatlakozz");
    expect(() =>
      joinRoom(
        room,
        makePlayer("Másolat", "paca", display.credentialHash, now),
      ),
    ).toThrow("kijelző");
    expect(validateRole(undefined)).toBe("player");
    expect(validateRole("display")).toBe("display");
    expect(() => validateRole("host")).toThrow("szerep");
  });
  it("reserves the host for exactly 90 seconds, then promotes the earliest connected player", () => {
    const { room, display, players } = tv(3);
    display.connected = false;
    display.disconnectedAt = now;
    players[0].connected = false;
    players[0].disconnectedAt = now + 100;
    pruneDisconnected(room, now + DISCONNECT_GRACE_MS - 1);
    expect(room.hostId).toBe(display.id);
    pruneDisconnected(room, now + DISCONNECT_GRACE_MS);
    expect(room.hostRole).toBe("player");
    expect(room.hostId).toBe(players[1].id);
    display.connected = true;
    display.graceExpired = false;
    display.disconnectedAt = null;
    pruneDisconnected(room, now + DISCONNECT_GRACE_MS + 1);
    expect(room.hostId).toBe(players[1].id);
    expect(() =>
      applyAction(
        room,
        { role: "display", id: display.id },
        { type: "settings", value: room.settings },
        now + DISCONNECT_GRACE_MS,
      ),
    ).toThrow("házigazda");
  });
  it("revokes an explicitly departed Display and transfers host immediately", () => {
    const { room, players } = tv();
    leaveDisplay(room);
    expect(room.display).toBeNull();
    expect(room.mode).toBe("tv-party");
    expect(room.hostId).toBe(players[0].id);
    expect(room.hostRole).toBe("player");
  });
  it("retains an active empty Display lobby but releases a disconnected orphan after grace", () => {
    const { room, display } = tv(0);
    pruneDisconnected(room, now + DISCONNECT_GRACE_MS * 2);
    expect(retainRoom(room)).toBe(true);
    display.connected = false;
    display.disconnectedAt = now;
    pruneDisconnected(room, now + DISCONNECT_GRACE_MS);
    expect(retainRoom(room)).toBe(false);
    expect(room.hostId).toBe("");
    expect(room.hostRole).toBe("player");
  });
  it("additively upgrades v4 without changing ongoing finale history, ice, scores or deadlines", () => {
    const { room, display } = tv();
    start(room, display.id);
    until(room, "question", 5);
    room.quiz!.finaleAttempts[room.players[0].id] = [
      {
        optionIndex: (room.quiz!.correctIndex + 1) % 4,
        receivedAt: room.quiz!.phaseStartedAt + 3000,
        correct: false,
        order: 1,
      },
    ];
    room.quiz!.iceProgress[room.players[0].id] = {
      acceptedTaps: 2,
      lastTapAt: room.quiz!.phaseStartedAt + 150,
      brokenAt: null,
    };
    const savedQuiz = structuredClone(room.quiz);
    const legacy = structuredClone(room) as unknown as Record<string, unknown>;
    delete legacy.mode;
    delete legacy.hostRole;
    delete legacy.display;
    legacy.schemaVersion = 4;
    legacy.hostId = room.players[0].id;
    const restored = legacy as unknown as StoredRoom;
    expect(upgradeRoom(restored)).toBe(true);
    expect(restored.schemaVersion).toBe(5);
    expect(restored.mode).toBe("normal");
    expect(restored.display).toBeNull();
    expect(restored.hostRole).toBe("player");
    expect(restored.hostId).toBe(room.players[0].id);
    expect(restored.quiz).toEqual(savedQuiz);
    expect(upgradeRoom(restored)).toBe(false);
  });
});
describe("Display-safe projection and the shared engine", () => {
  it("exposes progress without private votes, offers, targets, guesses or effect state", () => {
    const { room, display, players, viewer } = tv();
    start(room, display.id);
    const q = room.quiz!;
    applyAction(
      room,
      players[0].id,
      { type: "vote", categoryId: q.categoryOptions[0], ...context(room) },
      q.phaseStartedAt + 100,
    );
    const vote = publicRoom(room, viewer).game!;
    expect(vote.votedPlayerIds).toEqual([players[0].id]);
    expect(vote.voteCounts).toEqual({});
    expect(vote.myVote).toBeNull();
    until(room, "sabotage-selection", 1);
    applyAction(
      room,
      players[0].id,
      {
        type: "attack",
        abilityId: q.sabotage!.offers[players[0].id][0],
        targetId: players[1].id,
        ...context(room),
      },
      q.phaseStartedAt + 100,
    );
    const selection = publicRoom(room, viewer).game!;
    expect(selection.sharedAttacks).toEqual([]);
    expect(selection.sabotage!.offers).toEqual([]);
    expect(selection.sabotage!.targets).toEqual([]);
    expect(selection.sabotage!.myChoice).toBeNull();
    applyAction(
      room,
      players[1].id,
      { type: "skip-attack", ...context(room) },
      q.phaseStartedAt + 200,
    );
    expect(publicRoom(room, viewer).game!.sharedAttacks).toHaveLength(1);
    until(room, "question", 1);
    const screen = publicRoom(room, viewer).game!;
    expect(screen.question!.id).toBe(
      publicRoom(room, players[0].id).game!.question!.id,
    );
    expect(screen.myAnswer).toBeNull();
    expect(screen.myIce).toBeNull();
    expect(screen.myFinale).toBeNull();
    expect(screen.sabotage!.effects).toBeNull();
    expect(screen.result).toBeNull();
    expect(JSON.stringify(screen)).not.toContain("correctIndex");
    until(room, "question", 5);
    applyAction(
      room,
      players[0].id,
      {
        type: "answer",
        optionIndex: (q.correctIndex + 1) % 4,
        ...context(room),
      },
      q.phaseStartedAt + 3000,
    );
    expect(publicRoom(room, players[0].id).game!.myFinale!.wrongAttempts).toBe(
      1,
    );
    expect(publicRoom(room, players[1].id).game!.myFinale!.wrongAttempts).toBe(
      0,
    );
    expect(publicRoom(room, viewer).game!.myFinale).toBeNull();
    expect(JSON.stringify(publicRoom(room, viewer).game)).not.toContain(
      "correctIndex",
    );
  });
  it.each(ABILITIES.map((a) => a.id))(
    "keeps %s personal and preserves finale canonical guesses and penalties",
    (ability) => {
      const { room, display, players, viewer } = tv();
      start(room, display.id);
      until(room, "sabotage-selection", 5);
      const q = room.quiz!,
        target = players[0],
        attacker = players[1];
      q.sabotage!.offers[attacker.id] = [
        ability,
        ...ABILITIES.map((a) => a.id)
          .filter((id) => id !== ability)
          .slice(0, 2),
      ];
      applyAction(
        room,
        attacker.id,
        {
          type: "attack",
          abilityId: ability,
          targetId: target.id,
          ...context(room),
        },
        q.phaseStartedAt + 100,
      );
      applyAction(
        room,
        target.id,
        { type: "skip-attack", ...context(room) },
        q.phaseStartedAt + 200,
      );
      until(room, "question", 5);
      const effects = q.sabotage!.effects[target.id];
      expect(publicRoom(room, viewer).game!.sabotage!.effects).toBeNull();
      expect(
        publicRoom(room, target.id).game!.sabotage!.effects!.counts[ability],
      ).toBe(1);
      if (ability === "freeze") {
        expect(() =>
          applyAction(
            room,
            target.id,
            { type: "answer", optionIndex: q.correctIndex, ...context(room) },
            q.phaseStartedAt + 1,
          ),
        ).toThrow("fagyasztás");
        for (let n = 0; n < 3; n++)
          applyAction(
            room,
            target.id,
            { type: "ice-tap", ...context(room) },
            q.phaseStartedAt + 100 + n * 100,
          );
        expect(q.iceProgress[target.id].brokenAt).not.toBeNull();
      }
      const at = q.phaseStartedAt + 3000;
      const wrong = (q.correctIndex + 1) % 4;
      applyAction(
        room,
        target.id,
        { type: "answer", optionIndex: wrong, ...context(room) },
        at,
      );
      expect(
        publicRoom(room, target.id).game!.myFinale!.eliminatedOptions,
      ).toEqual([wrong]);
      expect(q.sabotage!.effects[target.id]).toEqual(effects);
      applyAction(
        room,
        target.id,
        { type: "answer", optionIndex: q.correctIndex, ...context(room) },
        at + 100,
      );
      applyAction(
        room,
        attacker.id,
        { type: "answer", optionIndex: q.correctIndex, ...context(room) },
        at + 200,
      );
      const result = publicRoom(room, viewer).game!.result!;
      const mine = result.players.find((p) => p.playerId === target.id)!;
      expect(mine.basePoints).toBe(70);
      expect(mine.total).toBe(
        scoreAnswer(
          true,
          q.answers[target.id].receivedAt - 3100,
          q.answers[target.id].receivedAt - 3100 + 15000,
          q.answers[target.id].receivedAt,
          true,
          1,
        ).total,
      );
      expect(result.correctIndex).toBe(q.correctIndex);
      expect(q.participants).toHaveLength(2);
      expect(q.participants.some((p) => p.id === display.id)).toBe(false);
    },
  );
  it.each([6, 12, 18] as const)(
    "finishes a %s-question TV match once, retains mode/identity on rematch and gives the Display no points",
    (total) => {
      const { room, display, players, viewer } = tv();
      start(room, display.id, total);
      let questions = 0,
        finales = 0;
      for (let i = 0; i < 200 && room.phase !== "final-results"; i++) {
        if (room.phase === "question") {
          questions++;
          if (room.quiz!.answeringMode === "multi-guess") finales++;
          const at = room.quiz!.phaseStartedAt + 3000;
          players.forEach((p) =>
            applyAction(
              room,
              p.id,
              {
                type: "answer",
                optionIndex: room.quiz!.correctIndex,
                ...context(room),
              },
              at,
            ),
          );
        } else advanceQuiz(room, room.quiz!.deadline!);
      }
      expect(questions).toBe(total);
      expect(finales).toBe(total === 6 ? 2 : total === 12 ? 3 : 4);
      const ranks = publicRoom(room, viewer).game!.ranking;
      expect(ranks).toHaveLength(2);
      expect(
        ranks.every(
          (p) => p.correctAnswers === total && p.answeredQuestions === total,
        ),
      ).toBe(true);
      const scores = ranks.map((p) => p.score);
      advanceQuiz(room, room.quiz!.phaseStartedAt + 100000);
      expect(
        publicRoom(room, viewer).game!.ranking.map((p) => p.score),
      ).toEqual(scores);
      applyAction(
        room,
        viewer,
        {
          type: "rematch",
          sessionId: room.quiz!.sessionId,
          phaseId: room.quiz!.phaseId,
        },
        room.quiz!.phaseStartedAt + 1,
      );
      expect(room.phase).toBe("lobby");
      expect(room.mode).toBe("tv-party");
      expect(room.hostRole).toBe("display");
      expect(room.display!.id).toBe(display.id);
      expect(room.quiz).toBeNull();
      expect(room.players.every((p) => !p.ready)).toBe(true);
    },
  );
});
it.each([
  "https://eszveszto.example/join/ABCD234",
  "https://a-long-feature-preview.eszveszto.example/join/X7P3WA2",
  "http://127.0.0.1:4173/join/ABCD234",
])("decodes the real local QR invitation exactly: %s", (url) => {
  const matrix = invitationQr(url),
    scale = 6,
    size = (matrix.length + 8) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark)
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const at =
              (((y + 4) * scale + dy) * size + (x + 4) * scale + dx) * 4;
            pixels[at] = pixels[at + 1] = pixels[at + 2] = 0;
          }
    }),
  );
  expect(jsQR(pixels, size, size)?.data).toBe(url);
});
