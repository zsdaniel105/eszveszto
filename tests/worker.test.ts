import { ABILITIES, type AbilityId } from "../src/shared/sabotage";
import { env } from "cloudflare:workers";
import {
  SELF,
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import type { Env } from "../src/server/index";
import type { StoredRoom } from "../src/server/model";
import type { ServerMessage } from "../src/shared/game";
import { advanceQuiz, scoreAnswer } from "../src/server/quiz";
import { combineEffects } from "../src/server/sabotage";
const bindings = env as unknown as Env;
const origin = "https://example.com";
const sockets: WebSocket[] = [];
afterEach(() => {
  for (const ws of sockets.splice(0)) ws.close();
});
function credential() {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
async function post(path: string, data: unknown) {
  const response = await SELF.fetch(origin + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": crypto.randomUUID(),
    },
    body: JSON.stringify(data),
  });
  // Consume the transport body: an unread HTTP response keeps the DO request
  // alive and makes an explicit eviction wait for that request to finish.
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: response.headers,
  });
}
async function create() {
  const token = credential();
  const input = { nickname: "Házigazda", character: "paca", credential: token };
  const response = await post("/api/rooms", input);
  expect(response.status).toBe(201);
  const data = (await response.json()) as { code: string; playerId: string };
  return { ...data, token, input };
}
class Inbox {
  messages: ServerMessage[] = [];
  settingsRevision = 1;
  private waiters: {
    match: (m: ServerMessage) => boolean;
    resolve: (m: ServerMessage) => void;
  }[] = [];
  constructor(public ws: WebSocket) {
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data as string) as ServerMessage;
      if (message.type === "state")
        this.settingsRevision = message.room.settingsRevision;
      const index = this.waiters.findIndex((w) => w.match(message));
      if (index >= 0) this.waiters.splice(index, 1)[0].resolve(message);
      else this.messages.push(message);
    });
    ws.accept();
    sockets.push(ws);
  }
  next(match: (m: ServerMessage) => boolean) {
    const i = this.messages.findIndex(match);
    if (i >= 0) return Promise.resolve(this.messages.splice(i, 1)[0]);
    return new Promise<ServerMessage>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Expected WebSocket message did not arrive")),
        5000,
      );
      this.waiters.push({
        match,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }
  send(message: unknown) {
    this.ws.send(JSON.stringify(message));
  }
  async action(action: Record<string, unknown>) {
    const requestId = crypto.randomUUID();
    this.send({
      ...action,
      settingsRevision: this.settingsRevision,
      requestId,
    });
    return this.next(
      (m) =>
        (m.type === "ack" || m.type === "error") && m.requestId === requestId,
    );
  }
}
async function connect(code: string, token: string) {
  const response = await SELF.fetch(`${origin}/api/rooms/${code}/socket`, {
    headers: {
      Upgrade: "websocket",
      Origin: origin,
      "CF-Connecting-IP": crypto.randomUUID(),
    },
  });
  expect(response.status).toBe(101);
  const inbox = new Inbox(response.webSocket!);
  inbox.send({ type: "authenticate", credential: token });
  return inbox;
}
const state = (m: ServerMessage) => m.type === "state";
describe("real Worker and Durable Object transport", () => {
  it("creates idempotently and persists only hashes, not credentials", async () => {
    const room = await create();
    const repeat = await post("/api/rooms", room.input);
    expect(await repeat.json()).toEqual({
      code: room.code,
      playerId: room.playerId,
    });
    const stub = bindings.ROOMS.get(bindings.ROOMS.idFromName(room.code));
    const stored = await runInDurableObject(stub, async (_instance, ctx) =>
      ctx.storage.get<StoredRoom>("room"),
    );
    expect(stored!.players).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(room.token);
  });
  it("serializes concurrent joins and enforces eight seats", async () => {
    const room = await create();
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        post(`/api/rooms/${room.code}/join`, {
          nickname: `Vendég ${i}`,
          character: "zum",
          credential: credential(),
        }),
      ),
    );
    expect(responses.filter((r) => r.status === 200)).toHaveLength(7);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(3);
    const ws = await connect(room.code, room.token);
    const snapshot = await ws.next(state);
    expect(snapshot.type === "state" && snapshot.room.players).toHaveLength(8);
  });
  it("broadcasts ready, character, settings and one authoritative session to both clients", async () => {
    const room = await create();
    const token = credential();
    await post(`/api/rooms/${room.code}/join`, {
      nickname: "Vendég",
      character: "zum",
      credential: token,
    });
    const host = await connect(room.code, room.token);
    await host.next(state);
    const guest = await connect(room.code, token);
    await guest.next(state);
    expect(
      (
        await guest.action({
          type: "settings",
          value: { questionCount: 6, difficulty: "easy" },
        })
      ).type,
    ).toBe("error");
    expect((await guest.action({ type: "start" })).type).toBe("error");
    expect((await host.action({ type: "start" })).type).toBe("error");
    await guest.action({ type: "character", value: "csonti" });
    const changed = await host.next(
      (m) =>
        m.type === "state" &&
        m.room.players.some((p) => p.character === "csonti"),
    );
    expect(changed.type).toBe("state");
    await host.action({
      type: "settings",
      value: { questionCount: 18, difficulty: "hard" },
    });
    await guest.next(
      (m) => m.type === "state" && m.room.settingsRevision === 2,
    );
    await Promise.all([
      host.action({ type: "ready", value: true }),
      guest.action({ type: "ready", value: true }),
    ]);
    const requestId = crypto.randomUUID();
    host.send({
      type: "start",
      requestId,
      settingsRevision: host.settingsRevision,
    });
    expect(
      (await host.next((m) => m.type === "ack" && m.requestId === requestId))
        .type,
    ).toBe("ack");
    const a = await host.next(
      (m) => m.type === "state" && m.room.phase === "category-vote",
    );
    const b = await guest.next(
      (m) => m.type === "state" && m.room.phase === "category-vote",
    );
    expect(a.type === "state" && a.room.session).toEqual(
      b.type === "state" && b.room.session,
    );
    expect(JSON.stringify(a)).not.toContain(room.token);
    expect(JSON.stringify(b)).not.toContain(token);
    host.send({
      type: "start",
      requestId,
      settingsRevision: host.settingsRevision,
    });
    expect(
      (await host.next((m) => m.type === "ack" && m.requestId === requestId))
        .type,
    ).toBe("ack");
  });
  it("reconnects without duplicates, replaces an old socket and survives hibernation", async () => {
    const room = await create();
    const first = await connect(room.code, room.token);
    await first.next(state);
    const replacement = await connect(room.code, room.token);
    const a = await replacement.next(state);
    expect(a.type === "state" && a.playerId).toBe(room.playerId);
    expect(a.type === "state" && a.room.players).toHaveLength(1);
    const stub = bindings.ROOMS.get(bindings.ROOMS.idFromName(room.code));
    await evictDurableObject(stub);
    expect(
      (await replacement.action({ type: "ready", value: true })).type,
    ).toBe("ack");
    const b = await replacement.next(
      (m) => m.type === "state" && m.room.players[0].ready,
    );
    expect(b.type === "state" && b.playerId).toBe(room.playerId);
  });
  it("refuses forged credentials, cross-origin requests and malformed input", async () => {
    const room = await create();
    const forged = await connect(room.code, credential());
    const error = await forged.next((m) => m.type === "error");
    expect(error.type === "error" && error.code).toBe("UNAUTHORIZED");
    const cross = await SELF.fetch(`${origin}/api/rooms/${room.code}/socket`, {
      headers: { Upgrade: "websocket", Origin: "https://evil.example" },
    });
    expect(cross.status).toBe(403);
    expect(
      (await post("/api/rooms", { ...room.input, nickname: "<script>" }))
        .status,
    ).toBe(400);
    expect(
      (await post("/api/rooms", { ...room.input, character: "unknown" }))
        .status,
    ).toBe(400);
    expect(
      (await post("/api/rooms", { ...room.input, credential: "plain-id" }))
        .status,
    ).toBe(400);
    const valid = await connect(room.code, room.token);
    await valid.next(state);
    valid.ws.send("{broken");
    expect((await valid.next((m) => m.type === "error")).type).toBe("error");
    expect((await valid.action({ type: "score", value: 999 })).type).toBe(
      "error",
    );
    expect((await valid.action({ type: "ready", value: true })).type).toBe(
      "ack",
    );
  });
  it("expires inactive rooms and deletes abandoned state", async () => {
    const room = await create();
    const stub = bindings.ROOMS.get(bindings.ROOMS.idFromName(room.code));
    await runInDurableObject(stub, async (_instance, ctx) => {
      const stored = (await ctx.storage.get<StoredRoom>("room"))!;
      stored.lastActivityAt = Date.now() - 3 * 60 * 60 * 1000;
      await ctx.storage.put("room", stored);
    });
    await evictDurableObject(stub);
    await runDurableObjectAlarm(stub);
    expect(
      (await post(`/api/rooms/${room.code}/resume`, room.input)).status,
    ).toBe(404);
    expect(
      await runInDurableObject(stub, async (_instance, ctx) =>
        ctx.storage.get("room"),
      ),
    ).toBeUndefined();
  });
  it("does not recreate an expired identity during a reconnect check", async () => {
    const room = await create();
    const response = await post(`/api/rooms/${room.code}/resume`, {
      ...room.input,
      credential: credential(),
    });
    expect(response.status).toBe(401);
    const host = await connect(room.code, room.token);
    const snapshot = await host.next(state);
    expect(snapshot.type === "state" && snapshot.room.players).toHaveLength(1);
  });
  it.each(["alarm", "heartbeat"])(
    "detects a disconnect, clears ready and transfers an expired host on %s",
    async (trigger) => {
      const room = await create();
      const token = credential();
      await post(`/api/rooms/${room.code}/join`, {
        nickname: "Vendég",
        character: "zum",
        credential: token,
      });
      const host = await connect(room.code, room.token);
      await host.next(state);
      const guest = await connect(room.code, token);
      await guest.next(state);
      await host.action({ type: "ready", value: true });
      host.ws.close(1000);
      const disconnected = await guest.next(
        (m) =>
          m.type === "state" &&
          m.room.players.some((p) => p.id === room.playerId && !p.connected),
      );
      expect(
        disconnected.type === "state" &&
          disconnected.room.players.find((p) => p.id === room.playerId)?.ready,
      ).toBe(false);
      expect(disconnected.type === "state" && disconnected.room.hostId).toBe(
        room.playerId,
      );
      const stub = bindings.ROOMS.get(bindings.ROOMS.idFromName(room.code));
      await runInDurableObject(stub, async (_instance, ctx) => {
        const stored = (await ctx.storage.get<StoredRoom>("room"))!;
        stored.players.find((p) => p.id === room.playerId)!.disconnectedAt =
          Date.now() - 90_001;
        await ctx.storage.put("room", stored);
      });
      await evictDurableObject(stub);
      if (trigger === "alarm") await runDurableObjectAlarm(stub);
      else guest.send({ type: "ping" });
      const transferred = await guest.next(
        (m) => m.type === "state" && m.room.players.length === 1,
      );
      expect(transferred.type === "state" && transferred.room.hostId).toBe(
        transferred.type === "state" && transferred.playerId,
      );
      expect(
        (await post(`/api/rooms/${room.code}/resume`, room.input)).status,
      ).toBe(401);
    },
  );
  it("persists real answers across reconstruction, projects privately and finishes on alarms without clients", async () => {
    const room = await create();
    const token = credential();
    await post(`/api/rooms/${room.code}/join`, {
      nickname: "Vendég",
      character: "zum",
      credential: token,
    });
    let host = await connect(room.code, room.token);
    await host.next(state);
    const guest = await connect(room.code, token);
    await guest.next(state);
    await Promise.all([
      host.action({ type: "ready", value: true }),
      guest.action({ type: "ready", value: true }),
    ]);
    await host.action({ type: "start" });
    const stub = bindings.ROOMS.get(bindings.ROOMS.idFromName(room.code));
    async function expire(milliseconds = 1) {
      await runInDurableObject(stub, async (_instance, ctx) => {
        const stored = (await ctx.storage.get<StoredRoom>("room"))!;
        stored.quiz!.deadline = Date.now() - milliseconds;
        await ctx.storage.put("room", stored);
      });
      await evictDurableObject(stub);
      await runDurableObjectAlarm(stub);
    }
    await expire();
    const selection = await host.next(
      (m) => m.type === "state" && m.room.phase === "sabotage-selection",
    );
    if (selection.type !== "state") throw new Error("Missing sabotage phase");
    const selectionContext = {
      sessionId: selection.room.game!.sessionId,
      phaseId: selection.room.game!.phaseId,
      round: selection.room.game!.round,
    };
    await host.action({ type: "skip-attack", ...selectionContext });
    await guest.action({ type: "skip-attack", ...selectionContext });
    const a = await host.next(
      (m) => m.type === "state" && m.room.phase === "question",
    );
    const b = await guest.next(
      (m) => m.type === "state" && m.room.phase === "question",
    );
    if (a.type !== "state" || b.type !== "state")
      throw new Error("Missing quiz state");
    expect(a.room.game!.question).toEqual(b.room.game!.question);
    expect(JSON.stringify(a)).not.toContain("correctIndex");
    const stored = (await runInDurableObject(stub, async (_instance, ctx) =>
      ctx.storage.get<StoredRoom>("room"),
    ))!;
    const q = stored.quiz!;
    const context = {
      sessionId: q.sessionId,
      phaseId: q.phaseId,
      round: q.round,
    };
    const requestId = crypto.randomUUID();
    host.send({
      type: "answer",
      optionIndex: q.correctIndex,
      ...context,
      requestId,
    });
    await host.next((m) => m.type === "ack" && m.requestId === requestId);
    host.send({
      type: "answer",
      optionIndex: q.correctIndex,
      ...context,
      requestId,
    });
    await host.next((m) => m.type === "ack" && m.requestId === requestId);
    const privateState = await guest.next(
      (m) =>
        m.type === "state" &&
        m.room.game?.answeredPlayerIds.includes(room.playerId) === true,
    );
    expect(
      privateState.type === "state" && privateState.room.game!.myAnswer,
    ).toBeNull();
    expect(JSON.stringify(privateState)).not.toContain("receivedAt");
    await evictDurableObject(stub);
    host = await connect(room.code, room.token);
    const restored = await host.next(
      (m) => m.type === "state" && m.playerId === room.playerId,
    );
    expect(restored.type === "state" && restored.room.game!.myAnswer).toBe(
      q.correctIndex,
    );
    expect(
      (
        await host.action({
          type: "answer",
          optionIndex: q.correctIndex,
          ...context,
        })
      ).type,
    ).toBe("error");
    await guest.action({
      type: "answer",
      optionIndex: (q.correctIndex + 1) % 4,
      ...context,
    });
    const result = await host.next(
      (m) => m.type === "state" && m.room.phase === "results",
    );
    if (result.type !== "state") throw new Error("Missing results");
    const score = result.room.game!.ranking.find(
      (p) => p.id === room.playerId,
    )!.score;
    expect(score).toBeGreaterThanOrEqual(100);
    expect(result.room.game!.result!.correctIndex).toBe(q.correctIndex);
    expect(
      result.room.game!.ranking.find((p) => p.id !== room.playerId)!.score,
    ).toBe(0);
    await expire();
    const leaderboard = await guest.next(
      (m) => m.type === "state" && m.room.phase === "leaderboard",
    );
    expect(
      leaderboard.type === "state" && leaderboard.room.game!.ranking[0].score,
    ).toBe(score);
    expect(
      (await host.action({ type: "answer", optionIndex: 0, ...context })).type,
    ).toBe("error");
    host.ws.close();
    guest.ws.close();
    // Finish close callbacks before changing persisted time; their normal
    // persistence must not race with this reconstruction fixture.
    await evictDurableObject(stub);
    await expire(20 * 60 * 1000);
    const finished = (await runInDurableObject(stub, async (_instance, ctx) =>
      ctx.storage.get<StoredRoom>("room"),
    ))!;
    expect(finished.phase).toBe("final-results");
    expect(finished.quiz!.round).toBe(12);
    expect(
      finished.quiz!.participants.find((p) => p.id === room.playerId)!.score,
    ).toBe(score);
    expect(
      finished.quiz!.participants.find((p) => p.id === room.playerId)!
        .correctAnswers,
    ).toBe(1);
  });
  it("additively upgrades a deployed placeholder without changing identities or settings", async () => {
    const room = await create();
    const stub = bindings.ROOMS.get(bindings.ROOMS.idFromName(room.code));
    await runInDurableObject(stub, async (_instance, ctx) => {
      const current = (await ctx.storage.get<StoredRoom>("room"))!;
      const legacy = Object.fromEntries(
        Object.entries(current).filter(
          ([key]) =>
            !["schemaVersion", "quiz", "recentQuestionIds", "notice"].includes(
              key,
            ),
        ),
      );
      await ctx.storage.put("room", {
        ...legacy,
        phase: "session",
        session: { id: crypto.randomUUID(), startedAt: Date.now() },
      });
    });
    await evictDurableObject(stub);
    const host = await connect(room.code, room.token);
    const snapshot = await host.next(state);
    if (snapshot.type !== "state") throw new Error("Missing upgraded state");
    expect(snapshot.playerId).toBe(room.playerId);
    expect(snapshot.room.phase).toBe("lobby");
    expect(snapshot.room.notice).toContain("Frissült");
    expect(snapshot.room.settings).toEqual({
      questionCount: 12,
      difficulty: "normal",
    });
    expect(snapshot.room.players[0].ready).toBe(false);
    expect((await host.action({ type: "ready", value: true })).type).toBe(
      "ack",
    );
    const stored = (await runInDurableObject(stub, async (_instance, ctx) =>
      ctx.storage.get<StoredRoom>("room"),
    ))!;
    expect(stored.schemaVersion).toBe(5);
    expect(stored.quiz).toBeNull();
  });
  it("accounts for seven mixed attacks, deduplicates requests, restores offers and effects, and enforces Freeze in the real Worker", async () => {
    const created = await create();
    const tokens = [created.token, ...Array.from({ length: 7 }, credential)];
    const ids = [created.playerId];
    for (let i = 1; i < 8; i++) {
      const response = await post(`/api/rooms/${created.code}/join`, {
        nickname: `Ellenfél ${i}`,
        character: "zum",
        credential: tokens[i],
      });
      ids.push(((await response.json()) as { playerId: string }).playerId);
    }
    const clients = await Promise.all(
      tokens.map((token) => connect(created.code, token)),
    );
    await Promise.all(clients.map((c) => c.next(state)));
    await Promise.all(
      clients.map((c) => c.action({ type: "ready", value: true })),
    );
    await clients[0].action({ type: "start" });
    const stub = bindings.ROOMS.get(bindings.ROOMS.idFromName(created.code));
    await runInDurableObject(stub, async (_instance, ctx) => {
      const room = (await ctx.storage.get<StoredRoom>("room"))!;
      room.quiz!.deadline = Date.now() - 1;
      await ctx.storage.put("room", room);
    });
    await evictDurableObject(stub);
    await runDurableObjectAlarm(stub);
    const selection = await clients[0].next(
      (m) => m.type === "state" && m.room.phase === "sabotage-selection",
    );
    if (selection.type !== "state") throw new Error("No selection");
    const c = {
      sessionId: selection.room.game!.sessionId,
      phaseId: selection.room.game!.phaseId,
      round: selection.room.game!.round,
    };
    const abilities: AbilityId[] = [
      "freeze",
      "slime",
      "shuffle",
      "upside-down",
      "ink",
      "roulette",
      "freeze",
    ];
    // Controlled persisted offers are a test fixture, never a production endpoint.
    await runInDurableObject(stub, async (_instance, ctx) => {
      const room = (await ctx.storage.get<StoredRoom>("room"))!;
      abilities.forEach((id, i) => {
        room.quiz!.sabotage!.offers[ids[i + 1]] = [
          id,
          ...ABILITIES.map((a) => a.id)
            .filter((other) => other !== id)
            .slice(0, 2),
        ];
      });
      await ctx.storage.put("room", room);
    });
    await evictDurableObject(stub);
    clients[1] = await connect(created.code, tokens[1]);
    const offered = await clients[1].next(
      (m) => m.type === "state" && m.room.phase === "sabotage-selection",
    );
    if (offered.type !== "state") throw new Error("No restored offer");
    const offers = offered.room.game!.sabotage!.offers;
    expect(offers).toHaveLength(3);
    expect(offers[0]).toBe("freeze");
    const requestId = crypto.randomUUID();
    const first = {
      type: "attack",
      abilityId: "freeze",
      targetId: ids[0],
      ...c,
      requestId,
    };
    clients[1].send(first);
    await clients[1].next((m) => m.type === "ack" && m.requestId === requestId);
    clients[1].send(first);
    await clients[1].next((m) => m.type === "ack" && m.requestId === requestId);
    await evictDurableObject(stub);
    clients[1] = await connect(created.code, tokens[1]);
    const restored = await clients[1].next(
      (m) => m.type === "state" && m.room.phase === "sabotage-selection",
    );
    expect(
      restored.type === "state" && restored.room.game!.sabotage!.offers,
    ).toEqual(offers);
    expect(
      restored.type === "state" && restored.room.game!.sabotage!.myChoice,
    ).toEqual({ type: "attack", abilityId: "freeze", targetId: ids[0] });
    expect(
      (
        await clients[1].action({
          type: "attack",
          abilityId: "freeze",
          targetId: ids[0],
          ...c,
        })
      ).type,
    ).toBe("error");
    for (let i = 2; i < 8; i++)
      expect(
        (
          await clients[i].action({
            type: "attack",
            abilityId: abilities[i - 1],
            targetId: ids[0],
            ...c,
          })
        ).type,
      ).toBe("ack");
    await clients[0].action({ type: "skip-attack", ...c });
    const question = await clients[0].next(
      (m) => m.type === "state" && m.room.phase === "question",
    );
    if (question.type !== "state") throw new Error("No question");
    const game = question.room.game!,
      s = game.sabotage!;
    expect(s.incoming).toHaveLength(7);
    expect(new Set(s.incoming.map((a) => a.attackerId)).size).toBe(7);
    expect(s.incoming.every((a) => a.targetId === ids[0])).toBe(true);
    expect(s.effects!.answerUnlockAt - game.startedAt).toBe(2000);
    expect(s.effects!.freezeUntil - game.startedAt).toBe(1600);
    expect(JSON.stringify(game)).not.toContain("correctIndex");
    const stored = (await runInDurableObject(stub, async (_instance, ctx) =>
      ctx.storage.get<StoredRoom>("room"),
    ))!;
    expect(stored.quiz!.sabotage!.attacks).toHaveLength(7);
    const qc = {
      sessionId: game.sessionId,
      phaseId: game.phaseId,
      round: game.round,
    };
    const frozen = await clients[0].action({
      type: "answer",
      optionIndex: stored.quiz!.correctIndex,
      ...qc,
    });
    expect(frozen.type === "error" && frozen.code).toBe("FROZEN");
    await evictDurableObject(stub);
    clients[0] = await connect(created.code, tokens[0]);
    const current = await clients[0].next(
      (m) => m.type === "state" && m.room.phase === "question",
    );
    expect(
      current.type === "state" && current.room.game!.sabotage!.effects,
    ).toEqual(s.effects);
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.max(0, s.effects!.answerUnlockAt - Date.now()) + 25,
      ),
    );
    const replies = await Promise.all(
      clients.map((client) =>
        client.action({
          type: "answer",
          optionIndex: stored.quiz!.correctIndex,
          ...qc,
        }),
      ),
    );
    expect(replies.every((m) => m.type === "ack")).toBe(true);
    const result = await clients[0].next(
      (m) => m.type === "state" && m.room.phase === "results",
    );
    expect(
      result.type === "state" &&
        result.room.game!.ranking.every(
          (p) => p.correctAnswers === 1 && p.score >= 100,
        ),
    ).toBe(true);
    expect(
      result.type === "state" && result.room.game!.sabotage!.incoming,
    ).toHaveLength(7);
  });
  it("bounds streamed input and applies per-socket action throttling", async () => {
    const oversized = await SELF.fetch(origin + "/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(4097),
    });
    expect(oversized.status).toBe(413);
    const room = await create();
    const socket = await connect(room.code, room.token);
    await socket.next(state);
    for (let i = 0; i < 22; i++) socket.send({ type: "ping" });
    const error = await socket.next(
      (m) => m.type === "error" && m.code === "RATE_LIMIT",
    );
    expect(error.type).toBe("error");
  });
  it("persists real ice taps and private finale guesses, deduplicates retries and scores once across reconstruction", async () => {
    const created = await create(),
      guestToken = credential();
    const response = await post(`/api/rooms/${created.code}/join`, {
      nickname: "Vendég",
      character: "zum",
      credential: guestToken,
    });
    const guestId = ((await response.json()) as { playerId: string }).playerId;
    let host = await connect(created.code, created.token),
      guest = await connect(created.code, guestToken);
    await host.next(state);
    await guest.next(state);
    await host.action({
      type: "settings",
      value: { questionCount: 6, difficulty: "normal" },
    });
    await host.action({ type: "ready", value: true });
    await guest.action({ type: "ready", value: true });
    await host.action({ type: "start" });
    const stub = bindings.ROOMS.get(bindings.ROOMS.idFromName(created.code));
    // Only the test owns this deterministic phase/effect fixture. Actual socket
    // actions, storage, ACKs, enforcement, transitions and scores are production.
    await runInDurableObject(stub, async (_instance, ctx) => {
      const room = (await ctx.storage.get<StoredRoom>("room"))!;
      while (room.phase !== "question" || room.quiz!.round !== 5)
        advanceQuiz(room, room.quiz!.deadline!);
      const q = room.quiz!,
        at = Date.now();
      q.phaseStartedAt = at;
      q.deadline = at + 15000;
      q.sabotage!.effects[created.playerId] = combineEffects(
        [
          {
            attackerId: guestId,
            targetId: created.playerId,
            abilityId: "freeze",
            outcome: "applied",
          },
        ],
        at,
        4,
      );
      q.sabotage!.effects[guestId] = combineEffects([], at, 4);
      await ctx.storage.put("room", room);
    });
    await evictDurableObject(stub);
    host = await connect(created.code, created.token);
    guest = await connect(created.code, guestToken);
    const initial = await host.next(
      (m) => m.type === "state" && m.room.phase === "question",
    );
    await guest.next((m) => m.type === "state" && m.room.phase === "question");
    if (initial.type !== "state") throw new Error("No question");
    const g = initial.room.game!,
      c = { sessionId: g.sessionId, phaseId: g.phaseId, round: g.round };
    let stored = (await runInDurableObject(stub, async (_instance, ctx) =>
      ctx.storage.get<StoredRoom>("room"),
    ))!;
    const correct = stored.quiz!.correctIndex,
      wrong = (correct + 1) % 4;
    expect(
      await host.action({ type: "answer", optionIndex: wrong, ...c }),
    ).toMatchObject({ type: "error", code: "FROZEN" });
    expect(await guest.action({ type: "ice-tap", ...c })).toMatchObject({
      type: "error",
      code: "ICE_INACTIVE",
    });
    const iceRequest = crypto.randomUUID(),
      tap = {
        type: "ice-tap",
        ...c,
        requestId: iceRequest,
        playerId: guestId,
        acceptedTaps: 99,
        broken: true,
      };
    host.send(tap);
    await host.next((m) => m.type === "ack" && m.requestId === iceRequest);
    host.send(tap);
    await host.next((m) => m.type === "ack" && m.requestId === iceRequest);
    await evictDurableObject(stub);
    host = await connect(created.code, created.token);
    const restored = await host.next(
      (m) => m.type === "state" && m.room.phase === "question",
    );
    expect(
      restored.type === "state" && restored.room.game!.myIce,
    ).toMatchObject({ acceptedTaps: 1, broken: false });
    for (let n = 0; n < 2; n++) {
      await new Promise((resolve) => setTimeout(resolve, 90));
      expect(await host.action({ type: "ice-tap", ...c })).toMatchObject({
        type: "ack",
      });
    }
    const broken = await host.next(
      (m) => m.type === "state" && m.room.game?.myIce?.broken === true,
    );
    expect(
      broken.type === "state" && broken.room.game!.myIce!.acceptedTaps,
    ).toBe(3);
    const guessRequest = crypto.randomUUID(),
      guess = {
        type: "answer",
        optionIndex: wrong,
        ...c,
        requestId: guessRequest,
      };
    host.send(guess);
    await host.next((m) => m.type === "ack" && m.requestId === guessRequest);
    host.send(guess);
    await host.next((m) => m.type === "ack" && m.requestId === guessRequest);
    expect(
      await host.action({ type: "answer", optionIndex: wrong, ...c }),
    ).toMatchObject({ type: "error", code: "OPTION_ELIMINATED" });
    const other = await guest.next(
      (m) =>
        m.type === "state" &&
        m.room.game?.myIce === null &&
        m.room.phase === "question",
    );
    expect(
      other.type === "state" && other.room.game!.myFinale!.attempts,
    ).toEqual([]);
    await evictDurableObject(stub);
    host = await connect(created.code, created.token);
    const rejoined = await host.next(
      (m) => m.type === "state" && m.room.phase === "question",
    );
    expect(
      rejoined.type === "state" && rejoined.room.game!.myFinale,
    ).toMatchObject({
      wrongAttempts: 1,
      eliminatedOptions: [wrong],
      finished: false,
    });
    expect(
      rejoined.type === "state" && JSON.stringify(rejoined.room.game),
    ).not.toMatch(/correctIndex|receivedAt|lastTapAt/);
    const acceptedCorrectId = crypto.randomUUID();
    const acceptedCorrect = {
      type: "answer",
      optionIndex: correct,
      ...c,
      requestId: acceptedCorrectId,
    };
    host.send(acceptedCorrect);
    await host.next(
      (m) => m.type === "ack" && m.requestId === acceptedCorrectId,
    );
    stored = (await runInDurableObject(stub, async (_instance, ctx) =>
      ctx.storage.get<StoredRoom>("room"),
    ))!;
    expect(stored.quiz!.answers[created.playerId].receivedAt).toBeLessThan(
      stored.quiz!.sabotage!.effects[created.playerId].freezeUntil,
    );
    const correctRequest = crypto.randomUUID();
    host.send({
      type: "answer",
      optionIndex: correct,
      ...c,
      requestId: correctRequest,
    });
    expect(
      await host.next(
        (m) => m.type === "error" && m.requestId === correctRequest,
      ),
    ).toMatchObject({ code: "ANSWER_LOCKED" });
    expect(
      await guest.action({ type: "answer", optionIndex: wrong, ...c }),
    ).toMatchObject({ type: "ack" });
    expect(
      await guest.action({ type: "answer", optionIndex: correct, ...c }),
    ).toMatchObject({ type: "ack" });
    const results = await host.next(
      (m) => m.type === "state" && m.room.phase === "results",
    );
    if (results.type !== "state") throw new Error("No results");
    host.send(acceptedCorrect);
    await host.next(
      (m) => m.type === "ack" && m.requestId === acceptedCorrectId,
    );
    const myResult = results.room.game!.result!.players.find(
      (p) => p.playerId === created.playerId,
    )!;
    expect(myResult.total).toBe(
      scoreAnswer(
        true,
        g.startedAt,
        g.deadline!,
        stored.quiz!.answers[created.playerId].receivedAt,
        true,
        1,
      ).total,
    );
    expect(myResult).toMatchObject({
      wrongAttempts: 1,
      basePoints: 70,
      correct: true,
    });
    expect(
      results.room.game!.ranking.every(
        (p) => p.correctAnswers === 1 && p.answeredQuestions === 1,
      ),
    ).toBe(true);
    const before = results.room.game!.ranking.map((p) => p.score);
    await evictDurableObject(stub);
    await runDurableObjectAlarm(stub);
    const final = (await runInDurableObject(stub, async (_instance, ctx) =>
      ctx.storage.get<StoredRoom>("room"),
    ))!;
    expect(final.quiz!.participants.map((p) => p.score).sort()).toEqual(
      before.sort(),
    );
    expect(final.quiz!.finaleAttempts[created.playerId]).toHaveLength(2);
  });
});
