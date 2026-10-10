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
import {
  ROOM_IDLE_MS,
  ROOM_MAX_MS,
  type ConnectionRole,
  type ServerMessage,
} from "../src/shared/game";
const bindings = env as unknown as Env;
const origin = "https://example.com";
const sockets: WebSocket[] = [];
afterEach(() => {
  for (const ws of sockets.splice(0)) ws.close();
});
const credential = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
async function post(path: string, input: unknown) {
  const r = await SELF.fetch(origin + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": crypto.randomUUID(),
    },
    body: JSON.stringify(input),
  });
  return new Response(await r.arrayBuffer(), {
    status: r.status,
    headers: r.headers,
  });
}
type State = Extract<ServerMessage, { type: "state" }>;
class Inbox {
  latest: State | null = null;
  messages: ServerMessage[] = [];
  waiters: {
    match: (m: ServerMessage) => boolean;
    resolve: (m: ServerMessage) => void;
  }[] = [];
  constructor(public ws: WebSocket) {
    ws.accept();
    sockets.push(ws);
    ws.addEventListener("message", (event) => {
      const m = JSON.parse(event.data as string) as ServerMessage;
      if (m.type === "state") this.latest = m;
      const i = this.waiters.findIndex((w) => w.match(m));
      if (i >= 0) this.waiters.splice(i, 1)[0].resolve(m);
      else this.messages.push(m);
    });
  }
  next(match: (m: ServerMessage) => boolean) {
    const i = this.messages.findIndex(match);
    if (i >= 0) return Promise.resolve(this.messages.splice(i, 1)[0]);
    return new Promise<ServerMessage>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Expected role-aware socket response")),
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
  action(action: Record<string, unknown>, requestId = crypto.randomUUID()) {
    this.send({
      ...action,
      settingsRevision: this.latest?.room.settingsRevision ?? 1,
      requestId,
    });
    return this.next(
      (m) =>
        (m.type === "ack" || m.type === "error") && m.requestId === requestId,
    );
  }
  async state(match: (m: State) => boolean = () => true) {
    return (await this.next((m) => m.type === "state" && match(m))) as State;
  }
}
async function connect(
  code: string,
  token: string,
  role: ConnectionRole = "player",
) {
  const r = await SELF.fetch(`${origin}/api/rooms/${code}/socket`, {
    headers: {
      Upgrade: "websocket",
      Origin: origin,
      "CF-Connecting-IP": crypto.randomUUID(),
    },
  });
  expect(r.status).toBe(101);
  const inbox = new Inbox(r.webSocket!);
  inbox.send({ type: "authenticate", credential: token, role });
  return inbox;
}
async function create() {
  const token = credential(),
    input = { role: "display", credential: token };
  const r = await post("/api/rooms", input);
  expect(r.status).toBe(201);
  const result = (await r.json()) as {
    code: string;
    displayId: string;
    role: ConnectionRole;
  };
  return { ...result, token, input };
}
async function joined(code: string, nickname: string) {
  const token = credential();
  const r = await post(`/api/rooms/${code}/join`, {
    nickname,
    character: "paca",
    credential: token,
  });
  expect(r.status).toBe(200);
  return { ...((await r.json()) as { playerId: string }), token };
}
function stub(code: string) {
  return bindings.ROOMS.get(bindings.ROOMS.idFromName(code));
}
async function stored(code: string) {
  return (await runInDurableObject(stub(code), async (_r, ctx) =>
    ctx.storage.get<StoredRoom>("room"),
  ))!;
}
// Test-only stored-state setup, never an HTTP route or production clock flag.
async function modify(code: string, change: (room: StoredRoom) => void) {
  await runInDurableObject(stub(code), async (instance, ctx) => {
    const room = (await ctx.storage.get<StoredRoom>("room"))!;
    change(room);
    (instance as unknown as { room: StoredRoom }).room = room;
    await ctx.storage.put("room", room);
  });
}
async function setup() {
  const made = await create(),
    display = await connect(made.code, made.token, "display");
  await display.state();
  const one = await joined(made.code, "Első"),
    two = await joined(made.code, "Második");
  const first = await connect(made.code, one.token),
    second = await connect(made.code, two.token);
  await first.state();
  await second.state();
  await display.state(
    (m) =>
      m.room.players.length === 2 && m.room.players.every((p) => p.connected),
  );
  return { made, display, one, two, first, second };
}
async function begin(s: Awaited<ReturnType<typeof setup>>) {
  expect(
    (
      await s.display.action({
        type: "settings",
        value: { questionCount: 6, difficulty: "normal" },
      })
    ).type,
  ).toBe("ack");
  await s.first.state((m) => m.room.settingsRevision === 2);
  await s.second.state((m) => m.room.settingsRevision === 2);
  expect((await s.first.action({ type: "ready", value: true })).type).toBe(
    "ack",
  );
  expect((await s.second.action({ type: "ready", value: true })).type).toBe(
    "ack",
  );
  expect((await s.display.action({ type: "start" })).type).toBe("ack");
  await s.display.state((m) => m.room.phase === "category-vote");
}
describe("real Display HTTP/WebSocket identity and recovery", () => {
  it("creates/resumes an initially empty Display room idempotently, hashes secrets and protects eight player seats", async () => {
    const made = await create();
    expect(await (await post("/api/rooms", made.input)).json()).toEqual({
      code: made.code,
      displayId: made.displayId,
      role: "display",
    });
    expect(
      await (await post(`/api/rooms/${made.code}/resume`, made.input)).json(),
    ).toEqual({ code: made.code, displayId: made.displayId, role: "display" });
    const d = await connect(made.code, made.token, "display");
    const snapshot = await d.state();
    expect(snapshot.role).toBe("display");
    expect(snapshot.playerId).toBe("");
    expect(snapshot.identityId).toBe(made.displayId);
    expect(snapshot.room.players).toEqual([]);
    const data = await stored(made.code);
    expect(data.display!.credentialHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(data)).not.toContain(made.token);
    expect(JSON.stringify(snapshot)).not.toContain(
      data.display!.credentialHash,
    );
    const responses = await Promise.all(
      Array.from({ length: 9 }, (_, i) =>
        post(`/api/rooms/${made.code}/join`, {
          nickname: `Vendég ${i}`,
          character: "zum",
          credential: credential(),
        }),
      ),
    );
    expect(responses.filter((r) => r.status === 200)).toHaveLength(8);
    expect(responses.filter((r) => r.status === 409)).toHaveLength(1);
    expect(
      (await d.state((m) => m.room.players.length === 8)).room.players,
    ).toHaveLength(8);
  });
  it("rejects role forgery, room-code privilege claims and cross-role credentials", async () => {
    const made = await create(),
      one = await joined(made.code, "Telefon");
    for (const [token, role] of [
      [one.token, "display"],
      [made.token, "player"],
      [credential(), "display"],
    ] as const) {
      const denied = await connect(made.code, token, role);
      expect(await denied.next((m) => m.type === "error")).toMatchObject({
        type: "error",
        code: "UNAUTHORIZED",
      });
    }
    expect(
      (
        await post(`/api/rooms/${made.code}/resume`, {
          credential: one.token,
          role: "display",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await post(`/api/rooms/${made.code}/join`, {
          credential: made.token,
          nickname: "Álruhás",
          character: "paca",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post(`/api/rooms/${made.code}/join`, {
          credential: credential(),
          role: "display",
        })
      ).status,
    ).toBe(403);
    expect(
      (await post("/api/rooms", { credential: credential(), role: "host" }))
        .status,
    ).toBe(400);
    const r = await SELF.fetch(`${origin}/api/rooms/${made.code}/socket`, {
      headers: {
        Upgrade: "websocket",
        Origin: origin,
        "CF-Connecting-IP": crypto.randomUUID(),
      },
    });
    const noAuth = new Inbox(r.webSocket!);
    noAuth.send({
      type: "start",
      requestId: crypto.randomUUID(),
      settingsRevision: 1,
    });
    expect(await noAuth.next((m) => m.type === "error")).toMatchObject({
      type: "error",
      code: "UNAUTHORIZED",
    });
  });
  it("applies host actions once, invalidates readiness and denies player and Display gameplay forgeries", async () => {
    const s = await setup();
    expect(
      await s.first.action({
        type: "settings",
        value: { questionCount: 18, difficulty: "hard" },
      }),
    ).toMatchObject({ type: "error", code: "HOST_ONLY" });
    expect(await s.first.action({ type: "start" })).toMatchObject({
      type: "error",
      code: "HOST_ONLY",
    });
    for (const a of [
      { type: "ready", value: true },
      { type: "character", value: "zum" },
    ])
      expect(await s.display.action(a)).toMatchObject({
        type: "error",
        code: "PLAYER_ONLY",
      });
    const requestId = crypto.randomUUID(),
      settings = {
        type: "settings",
        value: { questionCount: 6, difficulty: "easy" },
      };
    expect((await s.display.action(settings, requestId)).type).toBe("ack");
    expect((await s.display.action(settings, requestId)).type).toBe("ack");
    expect((await stored(s.made.code)).settingsRevision).toBe(2);
    await s.first.state((m) => m.room.settingsRevision === 2);
    await s.second.state((m) => m.room.settingsRevision === 2);
    await s.first.action({ type: "ready", value: true });
    expect(await s.display.action({ type: "start" })).toMatchObject({
      type: "error",
      code: "NOT_READY",
    });
    await s.second.action({ type: "ready", value: true });
    await s.display.action({ type: "start" });
    const q = (await stored(s.made.code)).quiz!;
    const context = {
      sessionId: q.sessionId,
      phaseId: q.phaseId,
      round: q.round,
    };
    for (const action of [
      { type: "vote", categoryId: q.categoryOptions[0] },
      { type: "answer", optionIndex: 0 },
      { type: "ice-tap" },
      { type: "skip-attack" },
      { type: "attack", abilityId: "freeze", targetId: s.one.playerId },
    ])
      expect(await s.display.action({ ...action, ...context })).toMatchObject({
        type: "error",
        code: "PLAYER_ONLY",
      });
    expect(
      await s.first.action({
        type: "rematch",
        sessionId: q.sessionId,
        phaseId: q.phaseId,
      }),
    ).toMatchObject({ type: "error", code: "HOST_ONLY" });
    expect((await stored(s.made.code)).quiz!.participants).toHaveLength(2);
  });
  it("keeps Display projections private through votes, attack resolution, a wrong finale guess and reconstruction", async () => {
    const s = await setup();
    await begin(s);
    let q = (await stored(s.made.code)).quiz!;
    await s.first.action({
      type: "vote",
      categoryId: q.categoryOptions[0],
      sessionId: q.sessionId,
      phaseId: q.phaseId,
      round: q.round,
    });
    const vote = await s.display.state(
      (m) => m.room.game?.votedPlayerIds.length === 1,
    );
    expect(vote.room.game!.myVote).toBeNull();
    expect(vote.room.game!.voteCounts).toEqual({});
    await modify(s.made.code, (r) => {
      r.quiz!.deadline = Date.now() - 1;
    });
    await runDurableObjectAlarm(stub(s.made.code));
    const selection = await s.display.state(
      (m) => m.room.phase === "sabotage-selection",
    );
    expect(selection.room.game!.sabotage!.offers).toEqual([]);
    expect(selection.room.game!.sabotage!.targets).toEqual([]);
    q = (await stored(s.made.code)).quiz!;
    const context = {
      sessionId: q.sessionId,
      phaseId: q.phaseId,
      round: q.round,
    };
    await s.first.action({
      type: "attack",
      abilityId: q.sabotage!.offers[s.one.playerId][0],
      targetId: s.two.playerId,
      ...context,
    });
    const committed = await s.display.state(
      (m) => m.room.game?.sabotage?.submittedPlayerIds.length === 1,
    );
    expect(committed.room.game!.sabotage!.myChoice).toBeNull();
    expect(committed.room.game!.sharedAttacks).toEqual([]);
    await s.second.action({ type: "skip-attack", ...context });
    const reveal = await s.display.state(
      (m) => m.room.phase === "sabotage-reveal",
    );
    expect(reveal.room.game!.sharedAttacks).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 1600));
    await runDurableObjectAlarm(stub(s.made.code));
    await s.display.state((m) => m.room.phase === "question");
    await modify(s.made.code, (r) => {
      r.quiz!.round = 5;
      r.quiz!.answeringMode = "multi-guess";
    });
    await new Promise((resolve) => setTimeout(resolve, 2600)); // Freeze and movement run in parallel, capped at 2.5 seconds.
    q = (await stored(s.made.code)).quiz!;
    const phase = {
      sessionId: q.sessionId,
      phaseId: q.phaseId,
      round: q.round,
    };
    expect(
      (
        await s.first.action({
          type: "answer",
          optionIndex: (q.correctIndex + 1) % 4,
          ...phase,
        })
      ).type,
    ).toBe("ack");
    const display = await s.display.state((m) => m.room.game?.round === 5);
    expect(display.room.game!.myFinale).toBeNull();
    expect(display.room.game!.myAnswer).toBeNull();
    expect(display.room.game!.myIce).toBeNull();
    expect(display.room.game!.sabotage!.effects).toBeNull();
    expect(JSON.stringify(display.room.game)).not.toContain("correctIndex");
    await evictDurableObject(stub(s.made.code));
    const replacement = await connect(s.made.code, s.made.token, "display");
    const rebuilt = await replacement.state();
    expect(rebuilt.identityId).toBe(s.made.displayId);
    expect(rebuilt.room.hostRole).toBe("display");
    expect(rebuilt.room.game!.deadline).toBe(q.deadline);
    expect(rebuilt.room.game!.myFinale).toBeNull();
    const phone = await connect(s.made.code, s.one.token);
    const own = await phone.state();
    expect(own.room.game!.myFinale!.wrongAttempts).toBe(1);
    expect(own.room.game!.question!.options).toEqual(
      rebuilt.room.game!.question!.options,
    );
    expect(
      (
        await phone.action({
          type: "answer",
          optionIndex: q.correctIndex,
          ...phase,
        })
      ).type,
    ).toBe("ack");
    expect(
      (
        await s.second.action({
          type: "answer",
          optionIndex: q.correctIndex,
          ...phase,
        })
      ).type,
    ).toBe("ack");
    const result = await replacement.state((m) => m.room.phase === "results");
    expect(result.room.game!.result!.correctIndex).toBe(q.correctIndex);
    const points = result.room.game!.result!.players.find(
      (p) => p.playerId === s.one.playerId,
    )!;
    expect(points.basePoints).toBe(70);
    expect(points.total).toBe((70 + points.speedBonus) * 2);
  });
  it("reports Display loss immediately, preserves the question deadline and reconnects without stealing reassigned host", async () => {
    const s = await setup();
    await begin(s);
    await modify(s.made.code, (r) => {
      r.quiz!.deadline = Date.now() - 1;
    });
    await runDurableObjectAlarm(stub(s.made.code));
    await modify(s.made.code, (r) => {
      r.quiz!.deadline = Date.now() - 1;
    });
    await runDurableObjectAlarm(stub(s.made.code));
    await new Promise((resolve) => setTimeout(resolve, 1600)); // Let the original reveal/effect start elapse together.
    await runDurableObjectAlarm(stub(s.made.code));
    await s.first.state((m) => m.room.phase === "question");
    const firstQuestion = (await stored(s.made.code)).quiz!;
    const phase = {
      sessionId: firstQuestion.sessionId,
      phaseId: firstQuestion.phaseId,
      round: firstQuestion.round,
    };
    expect(
      await s.first.action({
        type: "answer",
        optionIndex: firstQuestion.correctIndex,
        ...phase,
      }),
    ).toMatchObject({ type: "ack" });
    expect(
      await s.second.action({
        type: "answer",
        optionIndex: firstQuestion.correctIndex,
        ...phase,
      }),
    ).toMatchObject({ type: "ack" });
    for (let step = 0; step < 4; step++) {
      await modify(s.made.code, (r) => {
        r.quiz!.deadline = Date.now() - 1;
      });
      await runDurableObjectAlarm(stub(s.made.code));
    }
    const question = await s.first.state(
      (m) => m.room.phase === "question" && m.room.game!.round === 2,
    );
    const scores = question.room.game!.ranking.map((p) => p.score);
    expect(scores.every((score) => score > 0)).toBe(true);
    const deadline = question.room.game!.deadline;
    s.display.ws.close();
    const lost = await s.first.state(
      (m) => m.room.display?.connected === false,
    );
    expect(lost.room.game!.deadline).toBe(deadline);
    expect(lost.room.hostRole).toBe("display");
    const returned = await connect(s.made.code, s.made.token, "display");
    const restored = await returned.state();
    expect(restored.room.display!.connected).toBe(true);
    expect(restored.room.game!.deadline).toBe(deadline);
    expect(restored.room.game!.ranking.map((p) => p.score)).toEqual(scores);
    returned.ws.close();
    await s.first.state((m) => m.room.display?.connected === false);
    await modify(s.made.code, (r) => {
      r.display!.disconnectedAt = Date.now() - 90001;
    });
    await runDurableObjectAlarm(stub(s.made.code));
    const transferred = await s.first.state(
      (m) => m.room.hostRole === "player",
    );
    expect(transferred.room.hostId).toBe(s.one.playerId);
    expect(transferred.room.game!.deadline).toBe(deadline);
    const viewer = await connect(s.made.code, s.made.token, "display");
    const view = await viewer.state();
    expect(view.room.hostId).toBe(s.one.playerId);
    expect(view.room.hostRole).toBe("player");
    expect(
      await viewer.action({
        type: "settings",
        value: { questionCount: 6, difficulty: "easy" },
      }),
    ).toMatchObject({ type: "error", code: "INVALID_PHASE" });
    await modify(s.made.code, (r) => {
      r.quiz!.deadline = Date.now() - 1000000;
    });
    await runDurableObjectAlarm(stub(s.made.code));
    const final = await s.first.state((m) => m.room.phase === "final-results");
    expect(
      await viewer.action({
        type: "rematch",
        sessionId: final.room.game!.sessionId,
        phaseId: final.room.game!.phaseId,
      }),
    ).toMatchObject({ type: "error", code: "HOST_ONLY" });
    expect(
      (
        await s.first.action({
          type: "rematch",
          sessionId: final.room.game!.sessionId,
          phaseId: final.room.game!.phaseId,
        })
      ).type,
    ).toBe("ack");
    const lobby = await viewer.state((m) => m.room.phase === "lobby");
    expect(lobby.room.mode).toBe("tv-party");
    expect(lobby.room.players).toHaveLength(2);
    expect(lobby.room.players.every((p) => !p.ready)).toBe(true);
    expect(
      await viewer.action({
        type: "settings",
        value: { questionCount: 12, difficulty: "normal" },
      }),
    ).toMatchObject({ type: "error", code: "HOST_ONLY" });
    expect(await viewer.action({ type: "start" })).toMatchObject({
      type: "error",
      code: "HOST_ONLY",
    });
  });
  it("keeps an authenticated empty lobby through alarms and expires a disconnected orphan", async () => {
    const made = await create(),
      d = await connect(made.code, made.token, "display");
    await d.state();
    await runDurableObjectAlarm(stub(made.code));
    expect((await stored(made.code)).players).toEqual([]);
    d.ws.close();
    await modify(made.code, (r) => {
      r.display!.connected = false;
      r.display!.disconnectedAt = Date.now() - 90001;
    });
    await runDurableObjectAlarm(stub(made.code));
    expect(await stored(made.code)).toBeUndefined();
    expect(
      (await post(`/api/rooms/${made.code}/resume`, made.input)).status,
    ).toBe(404);
  });
  it("replaces only the matching Display socket and revokes an explicitly closed Display credential", async () => {
    const s = await setup();
    const closed = new Promise<number>((resolve) =>
      s.display.ws.addEventListener("close", (event) => resolve(event.code), {
        once: true,
      }),
    );
    const replacement = await connect(s.made.code, s.made.token, "display");
    const state = await replacement.state();
    expect(await closed).toBe(4002);
    expect(state.identityId).toBe(s.made.displayId);
    expect(state.room.players).toHaveLength(2);
    expect(state.room.display!.connected).toBe(true);
    expect(state.room.hostRole).toBe("display");
    expect((await replacement.action({ type: "leave" })).type).toBe("ack");
    const fallback = await s.first.state((m) => m.room.display === null);
    expect(fallback.room.hostId).toBe(s.one.playerId);
    expect(fallback.room.hostRole).toBe("player");
    expect(
      (await post(`/api/rooms/${s.made.code}/resume`, s.made.input)).status,
    ).toBe(401);
    const denied = await connect(s.made.code, s.made.token, "display");
    expect(await denied.next((m) => m.type === "error")).toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(
      (
        await s.first.action({
          type: "settings",
          value: { questionCount: 6, difficulty: "normal" },
        })
      ).type,
    ).toBe("ack");
  });
  it("upgrades a legacy room and hibernated player attachment without changing identity or granting Display privileges", async () => {
    const token = credential();
    const response = await post("/api/rooms", {
      credential: token,
      nickname: "Régi játékos",
      character: "paca",
    });
    const { code, playerId } = (await response.json()) as {
      code: string;
      playerId: string;
    };
    const phone = await connect(code, token);
    await phone.state();
    await runInDurableObject(stub(code), async (instance, ctx) => {
      const old = (await ctx.storage.get<StoredRoom>("room"))!;
      const legacy = old as unknown as Record<string, unknown>;
      legacy.schemaVersion = 4;
      delete legacy.mode;
      delete legacy.hostRole;
      delete legacy.display;
      (instance as unknown as { room: StoredRoom }).room = old;
      await ctx.storage.put("room", old);
      for (const ws of ctx.getWebSockets()) {
        const attachment = ws.deserializeAttachment() as Record<
          string,
          unknown
        >;
        delete attachment.role;
        delete attachment.displayId;
        ws.serializeAttachment(attachment);
      }
    });
    await evictDurableObject(stub(code));
    expect((await phone.action({ type: "ready", value: true })).type).toBe(
      "ack",
    );
    const rebuilt = await phone.state((m) => m.room.players[0].ready);
    expect(rebuilt.identityId).toBe(playerId);
    expect(rebuilt.room).toMatchObject({
      mode: "normal",
      hostRole: "player",
      display: null,
      hostId: playerId,
    });
    expect(rebuilt.room.players).toHaveLength(1);
    expect((await stored(code)).schemaVersion).toBe(5);
    const forged = await connect(code, token, "display");
    expect(await forged.next((m) => m.type === "error")).toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
  it.each(["idle", "absolute"])(
    "preserves %s expiration even for a connected Display in an empty room",
    async (kind) => {
      const made = await create(),
        d = await connect(made.code, made.token, "display");
      await d.state();
      await modify(made.code, (room) => {
        if (kind === "idle")
          room.lastActivityAt = Date.now() - ROOM_IDLE_MS - 1;
        else room.createdAt = Date.now() - ROOM_MAX_MS - 1;
      });
      await runDurableObjectAlarm(stub(made.code));
      expect(await stored(made.code)).toBeUndefined();
      expect(
        (await post(`/api/rooms/${made.code}/resume`, made.input)).status,
      ).toBe(404);
    },
  );
});
