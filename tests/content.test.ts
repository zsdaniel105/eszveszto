import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../src/shared/game";
import {
  QUESTIONS,
  nearDuplicatePairs,
  normalizeTrivia,
  validateBank,
} from "../src/server/questions";
import { answerChecks } from "../src/server/content/answer-checks";
import {
  applyAction,
  createRoom,
  joinRoom,
  makePlayer,
  publicRoom,
  upgradeRoom,
} from "../src/server/model";
import {
  advanceQuiz,
  RECENT_QUESTION_LIMIT,
  selectBlock,
} from "../src/server/quiz";

describe("expanded editorial bank", () => {
  it("covers every existing category and difficulty without adding question formats", () => {
    expect(QUESTIONS.length).toBe(312);
    for (const category of CATEGORIES) {
      const items = QUESTIONS.filter((q) => q.categoryId === category.id);
      expect(items).toHaveLength(26);
      for (const difficulty of ["easy", "normal", "hard"])
        expect(
          items.filter((q) => q.difficulty === difficulty).length,
        ).toBeGreaterThanOrEqual(5);
      for (let id = 1; id <= 10; id++)
        expect(
          items.some(
            (q) => q.id === `${category.id}-${String(id).padStart(2, "0")}`,
          ),
        ).toBe(true);
    }
    expect(QUESTIONS.every((q) => q.type === "text")).toBe(true);
    expect(nearDuplicatePairs(QUESTIONS)).toEqual([]);
  });
  it("preserves all 120 deployed IDs and correct-answer strings", async () => {
    // Baseline digest from merged PR #3, independent of category-module ordering.
    const keys = QUESTIONS.filter((q) => q.provenance.origin === "legacy")
      .map((q) => {
        if (q.type !== "text") throw Error("Legacy text expected");
        return `${q.id}:${q.options[q.correctIndex]}`;
      })
      .sort()
      .join("\n");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(keys),
    );
    expect(
      [...new Uint8Array(digest)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join(""),
    ).toBe("f8dcdd1a3a5bb2658d61f69d5b7197e1f12295fa04f38bbe5f8a4366e1ee8272");
  });
  it("rejects normalized duplicates, empty explanations and near-paraphrases of the same fact", () => {
    const q = QUESTIONS[1];
    if (q.type !== "text") throw Error("Expected text");
    expect(normalizeTrivia("  ÁRVÍZ!  TűRŐ  ")).toBe("árvíz tűrő");
    expect(() =>
      validateBank([
        q,
        { ...q, id: "geography-99", prompt: q.prompt.toUpperCase() + "!" },
      ]),
    ).toThrow();
    expect(() =>
      validateBank([{ ...q, options: ["A", " a! ", "B", "C"] }]),
    ).toThrow();
    expect(() => validateBank([{ ...q, explanation: " " }])).toThrow();
    expect(() =>
      validateBank([
        q,
        { ...q, id: "geography-99", prompt: q.prompt.slice(0, -1) + " ma?" },
      ]),
    ).toThrow("Near-duplicate");
    expect(() => validateBank([{ ...q, id: "unknown-01" }])).toThrow();
  });
  it("distinguishes model audits from exactly eleven retrieved answer checks", () => {
    expect(Object.keys(answerChecks)).toHaveLength(11);
    expect(
      QUESTIONS.filter((q) => q.provenance.review === "source-checked-answer"),
    ).toHaveLength(11);
    expect(
      QUESTIONS.filter((q) => q.provenance.origin === "model-drafted"),
    ).toHaveLength(192);
    for (const q of QUESTIONS) {
      if (q.provenance.review === "source-checked-answer") {
        expect(q.provenance.evidence).toBeTruthy();
        expect(q.provenance.reference).toBe(answerChecks[q.id].reference);
      } else expect(q.provenance.evidence).toBeUndefined();
    }
  });
});
function match() {
  const host = makePlayer("Házigazda", "paca", "h", 1000),
    guest = makePlayer("Vendég", "zum", "g", 1001);
  host.connected = guest.connected = host.ready = guest.ready = true;
  const room = createRoom("ABCD234", host, 1000);
  joinRoom(room, guest);
  host.ready = guest.ready = true;
  room.settings.questionCount = 6;
  applyAction(
    room,
    host.id,
    { type: "start", settingsRevision: room.settingsRevision },
    1002,
  );
  return { room, host, guest };
}
describe("content deployment and rematches", () => {
  it("retains canonical persisted options, answer lock, deadline and score after reconstruction", () => {
    const { room, host, guest } = match();
    while (room.phase !== "question") advanceQuiz(room, room.quiz!.deadline!);
    // Shape of an already-deployed round. Do not reprepare/shuffle on upgrade.
    const q = room.quiz!;
    q.currentQuestionId = "food-01";
    q.options = ["Körte", "Banán", "Szőlő", "Ananász"];
    q.correctIndex = 2;
    q.sabotage = null;
    applyAction(
      room,
      host.id,
      {
        type: "answer",
        optionIndex: 2,
        sessionId: q.sessionId,
        phaseId: q.phaseId,
        round: q.round,
      },
      q.phaseStartedAt + 500,
    );
    const restored = structuredClone(room),
      deadline = q.deadline;
    expect(upgradeRoom(restored)).toBe(false);
    const snapshot = publicRoom(restored, host.id);
    expect(snapshot.game!.myAnswer).toBe(2);
    expect(snapshot.game!.question!.options).toEqual(q.options);
    expect(snapshot.game!.deadline).toBe(deadline);
    expect(JSON.stringify(snapshot)).not.toMatch(
      /correctIndex|provenance|evidence|model-drafted/,
    );
    applyAction(
      restored,
      guest.id,
      {
        type: "answer",
        optionIndex: 2,
        sessionId: q.sessionId,
        phaseId: q.phaseId,
        round: q.round,
      },
      q.phaseStartedAt + 1000,
    );
    expect(restored.quiz!.result!.players.every((p) => p.correct)).toBe(true);
    expect(restored.quiz!.participants[0].score).toBeGreaterThan(100);
  });
  it("bounds recent history at 180, keeping just-played IDs first and preferring unused rematch content", () => {
    const { room, host } = match();
    room.recentQuestionIds = QUESTIONS.slice(0, 180).map((q) => q.id);
    advanceQuiz(room, 3_600_000);
    const q = room.quiz!,
      played = [...q.usedQuestionIds];
    applyAction(
      room,
      host.id,
      { type: "rematch", sessionId: q.sessionId, phaseId: q.phaseId },
      3_600_001,
    );
    expect(room.recentQuestionIds).toHaveLength(RECENT_QUESTION_LIMIT);
    expect(new Set(room.recentQuestionIds).size).toBe(RECENT_QUESTION_LIMIT);
    expect(room.recentQuestionIds.slice(0, 6)).toEqual(played);
    room.recentQuestionIds = QUESTIONS.filter(
      (q) => q.categoryId === "geography",
    )
      .slice(0, 20)
      .map((q) => q.id);
    room.players.forEach((p) => {
      p.ready = true;
    });
    applyAction(
      room,
      host.id,
      { type: "start", settingsRevision: room.settingsRevision },
      3_600_002,
    );
    expect(
      selectBlock("geography", room).every(
        (id) => !room.recentQuestionIds.includes(id),
      ),
    ).toBe(true);
    room.recentQuestionIds = QUESTIONS.map((q) => q.id);
    expect(new Set(selectBlock("geography", room)).size).toBe(3);
  });
});
