import { describe, expect, it } from "vitest";
import {
  SoundController,
  type SoundBackend,
  type SoundCue,
} from "../src/client/sound";
import { roomSoundEvents } from "../src/client/useRoomSounds";
import {
  applyAction,
  createRoom,
  createDisplayRoom,
  joinRoom,
  makeDisplay,
  makePlayer,
  publicRoom,
} from "../src/server/model";
import { advanceQuiz } from "../src/server/quiz";
import { combineEffects } from "../src/server/sabotage";

function audioFixture() {
  let time = 0,
    running = false,
    unlocks = 0,
    stops = 0;
  const played: SoundCue[] = [],
    values = new Map<string, string>();
  const backend: SoundBackend = {
    async unlock() {
      unlocks++;
      running = true;
    },
    running: () => running,
    play: (cue) => {
      played.push(cue);
    },
    stop: () => {
      stops++;
    },
    suspend: () => {
      running = false;
      stops++;
    },
  };
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  return {
    sound: new SoundController(backend, storage, () => time),
    backend,
    storage,
    played,
    get unlocks() {
      return unlocks;
    },
    get stops() {
      return stops;
    },
    tick: (ms: number) => {
      time += ms;
    },
  };
}
describe("gesture-gated optional audio", () => {
  it("never initializes or queues audio before a trusted gesture, on mute or in hidden tabs", async () => {
    const a = audioFixture();
    a.sound.play("question", "initial");
    await a.sound.unlock(false);
    expect(a.unlocks).toBe(0);
    expect(a.played).toEqual([]);
    await a.sound.unlock(true);
    a.sound.play("question", "initial"); // no replay after unlock
    a.sound.play("attack", "hidden", false);
    a.sound.play("attack", "hidden", true);
    expect(a.played).toEqual([]);
    a.sound.play("question", "live");
    expect(a.played).toEqual(["question"]);
    a.sound.toggle();
    await a.sound.unlock(true);
    a.sound.play("winner", "muted");
    expect(a.unlocks).toBe(1);
    expect(a.stops).toBe(1);
    expect(a.played).toEqual(["question"]);
  });
  it("persists mute and tolerates blocked storage/autoplay without breaking gameplay", async () => {
    const a = audioFixture();
    a.sound.toggle();
    expect(new SoundController(a.backend, a.storage).getMuted()).toBe(true);
    const unavailable = new SoundController(
      {
        ...a.backend,
        unlock: async () => {
          throw Error("blocked");
        },
      },
      {
        getItem: () => {
          throw Error("storage denied");
        },
        setItem: () => {
          throw Error("storage denied");
        },
      },
    );
    await expect(unavailable.unlock(true)).resolves.toBeUndefined();
    expect(() => unavailable.toggle()).not.toThrow();
    expect(unavailable.getMuted()).toBe(true);
  });
  it("plays a server event once and protects a confirmed motif from rapid taps", async () => {
    const a = audioFixture();
    await a.sound.unlock(true);
    a.sound.play("correct", "result");
    a.tick(200);
    a.sound.play("select");
    a.sound.play("correct", "result");
    expect(a.played).toEqual(["correct"]);
    a.tick(200);
    a.sound.play("select");
    a.sound.play("select");
    expect(a.played).toEqual(["correct", "select"]);
    a.sound.suspend();
    a.sound.play("finale", "away");
    await a.sound.unlock(true);
    a.sound.play("finale", "away");
    expect(a.played).toEqual(["correct", "select"]);
  });
});
function roomFixture() {
  const now = 1_000_000;
  const host = makePlayer("Mester", "paca", "h", now),
    guest = makePlayer("Vendég", "zum", "g", now + 1);
  host.connected = guest.connected = true;
  const room = createRoom("ABCD234", host, now);
  joinRoom(room, guest);
  room.settings.questionCount = 6;
  return { room, host, guest, now };
}
describe("truthful multiplayer sound events", () => {
  it("plays shared TV announcements only on the Display and personal feedback only on controllers", () => {
    const { host, guest, now } = roomFixture();
    const display = makeDisplay("display-hash", now);
    display.connected = true;
    const room = createDisplayRoom("TVAB234", display, now);
    joinRoom(room, host);
    joinRoom(room, guest);
    room.settings.questionCount = 6;
    host.ready = guest.ready = true;
    const identity = { role: "display" as const, id: display.id };
    let beforeDisplay = publicRoom(room, identity),
      beforePhone = publicRoom(room, guest.id);
    function check(displayCues: SoundCue[], phoneCues: SoundCue[]) {
      const screen = publicRoom(room, identity),
        phone = publicRoom(room, guest.id);
      expect(
        roomSoundEvents(beforeDisplay, screen, display.id).map((e) => e.cue),
      ).toEqual(displayCues);
      expect(
        roomSoundEvents(beforePhone, phone, guest.id).map((e) => e.cue),
      ).toEqual(phoneCues);
      for (const [snapshot, id] of [
        [screen, display.id],
        [phone, guest.id],
      ] as const) {
        expect(roomSoundEvents(snapshot, snapshot, id)).toEqual([]);
        expect(roomSoundEvents(null, snapshot, id)).toEqual([]);
      }
      beforeDisplay = screen;
      beforePhone = phone;
    }
    applyAction(room, identity, { type: "start", settingsRevision: 1 }, now);
    check(["category"], []);
    const q = room.quiz!;
    const context = () => ({
      sessionId: q.sessionId,
      phaseId: q.phaseId,
      round: q.round,
    });
    applyAction(
      room,
      guest.id,
      { type: "vote", categoryId: q.categoryOptions[0], ...context() },
      now + 1,
    );
    check([], ["vote"]);
    advanceQuiz(room, q.deadline!);
    check(["sabotage"], []);
    applyAction(
      room,
      host.id,
      {
        type: "attack",
        abilityId: q.sabotage!.offers[host.id][0],
        targetId: guest.id,
        ...context(),
      },
      q.phaseStartedAt + 1,
    );
    applyAction(
      room,
      guest.id,
      { type: "skip-attack", ...context() },
      q.phaseStartedAt + 2,
    );
    check(["attack"], ["attack"]);
    advanceQuiz(room, q.deadline!);
    check(["question"], []);
    applyAction(
      room,
      host.id,
      { type: "answer", optionIndex: q.correctIndex, ...context() },
      q.phaseStartedAt + 2100,
    );
    applyAction(
      room,
      guest.id,
      { type: "answer", optionIndex: q.correctIndex, ...context() },
      q.phaseStartedAt + 2200,
    );
    check(["rank"], ["correct"]);
    advanceQuiz(room, q.deadline!);
    check(["rank"], []);
    while (room.phase !== "finale") advanceQuiz(room, q.deadline!);
    check(["finale"], []);
    advanceQuiz(room, q.phaseStartedAt + 3_600_000);
    check(["winner"], []);
  });
  it("uses only confirmed own ice/guess progress and awards finale points once", () => {
    const { room, host, guest, now } = roomFixture();
    host.ready = guest.ready = true;
    applyAction(
      room,
      host.id,
      { type: "start", settingsRevision: room.settingsRevision },
      now,
    );
    while (room.phase !== "question" || room.quiz!.round !== 5)
      advanceQuiz(room, room.quiz!.deadline!);
    const q = room.quiz!,
      at = q.phaseStartedAt,
      c = { sessionId: q.sessionId, phaseId: q.phaseId, round: q.round };
    q.sabotage!.effects[host.id] = combineEffects(
      [
        {
          attackerId: guest.id,
          targetId: host.id,
          abilityId: "freeze",
          outcome: "applied",
        },
      ],
      at,
      4,
    );
    let previous = publicRoom(room, host.id);
    for (let n = 0; n < 6; n++) {
      applyAction(room, host.id, { type: "ice-tap", ...c }, at + n * 100);
      const current = publicRoom(room, host.id);
      expect(
        roomSoundEvents(previous, current, host.id).map((e) => e.cue),
      ).toEqual([n === 5 ? "ice-shatter" : "ice-crack"]);
      expect(roomSoundEvents(current, current, host.id)).toEqual([]);
      expect(roomSoundEvents(null, current, host.id)).toEqual([]);
      previous = current;
    }
    applyAction(
      room,
      host.id,
      { type: "answer", optionIndex: (q.correctIndex + 1) % 4, ...c },
      at + 300,
    );
    let current = publicRoom(room, host.id);
    expect(
      roomSoundEvents(previous, current, host.id).map((e) => e.cue),
    ).toEqual(["wrong"]);
    previous = current;
    applyAction(
      room,
      host.id,
      { type: "answer", optionIndex: q.correctIndex, ...c },
      at + 400,
    );
    current = publicRoom(room, host.id);
    expect(
      roomSoundEvents(previous, current, host.id).map((e) => e.cue),
    ).toEqual(["correct"]);
    previous = current;
    applyAction(
      room,
      guest.id,
      { type: "answer", optionIndex: q.correctIndex, ...c },
      at + 500,
    );
    current = publicRoom(room, host.id);
    expect(
      roomSoundEvents(previous, current, host.id).map((e) => e.cue),
    ).toEqual(["finale-points"]);
    expect(roomSoundEvents(current, current, host.id)).toEqual([]);
  });
  it("ignores initial/reconnected state and repeated snapshots; ready/vote requires accepted state", () => {
    const { room, host, guest, now } = roomFixture();
    let before = publicRoom(room, host.id);
    expect(roomSoundEvents(null, before, host.id)).toEqual([]);
    expect(
      roomSoundEvents(
        before,
        { ...before, revision: before.revision + 1 },
        host.id,
      ),
    ).toEqual([]);
    applyAction(
      room,
      host.id,
      { type: "ready", value: true, settingsRevision: room.settingsRevision },
      now + 1,
    );
    let after = publicRoom(room, host.id);
    expect(roomSoundEvents(before, after, host.id).map((e) => e.cue)).toEqual([
      "ready",
    ]);
    before = after;
    applyAction(
      room,
      guest.id,
      { type: "ready", value: true, settingsRevision: room.settingsRevision },
      now + 2,
    );
    applyAction(
      room,
      host.id,
      { type: "start", settingsRevision: room.settingsRevision },
      now + 3,
    );
    after = publicRoom(room, host.id);
    expect(roomSoundEvents(before, after, host.id).map((e) => e.cue)).toEqual([
      "category",
    ]);
    before = after;
    applyAction(
      room,
      host.id,
      {
        type: "vote",
        categoryId: room.quiz!.categoryOptions[0],
        sessionId: room.quiz!.sessionId,
        phaseId: room.quiz!.phaseId,
        round: 1,
      },
      now + 4,
    );
    after = publicRoom(room, host.id);
    expect(roomSoundEvents(before, after, host.id).map((e) => e.cue)).toEqual([
      "vote",
    ]);
    expect(roomSoundEvents(after, after, host.id)).toEqual([]);
    expect(roomSoundEvents(null, after, host.id)).toEqual([]);
  });
  it("uses actual own answer correctness and rank; refresh never repeats a result", () => {
    const { room, host, guest, now } = roomFixture();
    host.ready = guest.ready = true;
    applyAction(
      room,
      host.id,
      { type: "start", settingsRevision: room.settingsRevision },
      now,
    );
    while (room.phase !== "question") advanceQuiz(room, room.quiz!.deadline!);
    const q = room.quiz!,
      beforeHost = publicRoom(room, host.id),
      beforeGuest = publicRoom(room, guest.id);
    const context = {
      sessionId: q.sessionId,
      phaseId: q.phaseId,
      round: q.round,
    };
    applyAction(
      room,
      host.id,
      { type: "answer", optionIndex: q.correctIndex, ...context },
      q.phaseStartedAt + 1000,
    );
    applyAction(
      room,
      guest.id,
      { type: "answer", optionIndex: (q.correctIndex + 1) % 4, ...context },
      q.phaseStartedAt + 1001,
    );
    const result = publicRoom(room, host.id);
    expect(
      roomSoundEvents(beforeHost, result, host.id).map((e) => e.cue),
    ).toEqual(["correct"]);
    expect(
      roomSoundEvents(beforeGuest, publicRoom(room, guest.id), guest.id).map(
        (e) => e.cue,
      ),
    ).toEqual(["wrong"]);
    expect(roomSoundEvents(null, result, host.id)).toEqual([]);
    expect(roomSoundEvents(result, result, host.id)).toEqual([]);
    advanceQuiz(room, q.deadline!);
    const ranking = publicRoom(room, guest.id);
    expect(roomSoundEvents(result, ranking, guest.id)).toEqual([]); // dropping rank is not a celebration
    advanceQuiz(room, q.phaseStartedAt + 3_600_000);
    const final = publicRoom(room, host.id);
    expect(roomSoundEvents(ranking, final, host.id).map((e) => e.cue)).toEqual([
      "winner",
    ]);
    expect(
      roomSoundEvents(ranking, publicRoom(room, guest.id), guest.id),
    ).toEqual([]);
  });
});
