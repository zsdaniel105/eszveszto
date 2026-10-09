import { advanceQuiz } from "./quiz";
import type { Env } from "./index";
import { DurableObject } from "cloudflare:workers";
import {
  DISCONNECT_GRACE_MS,
  type Identity,
  type ServerMessage,
} from "../shared/game";
import {
  applyAction,
  actor,
  createDisplayRoom,
  makeDisplay,
  retainRoom,
  validateRole,
  upgradeRoom,
  createRoom,
  expiry,
  hashCredential,
  joinRoom,
  makePlayer,
  parseAction,
  pruneDisconnected,
  publicRoom,
  record,
  RoomError,
  type StoredRoom,
  validateCharacter,
  validateCredential,
  validateNickname,
} from "./model";

interface Attachment {
  playerId: string | null;
  displayId?: string | null;
  role?: Identity["role"] | null;
  openedAt: number;
  lastSeen: number;
  requests: number[];
}
const HEARTBEAT_TIMEOUT = 65_000;
// Legacy hibernated attachments contain only playerId. New identities are
// explicitly role-bound and can never be an arbitrary client-supplied ID.
function identity(a: Attachment): Identity | null {
  if (a.role === "display" && a.displayId && !a.playerId)
    return { role: "display", id: a.displayId };
  if (
    (a.role === undefined || a.role === "player") &&
    a.playerId &&
    !a.displayId
  )
    return { role: "player", id: a.playerId };
  return null;
}
function unauthenticated(a: Attachment): Attachment {
  return { ...a, role: null, playerId: null, displayId: null };
}
export function errorResponse(error: unknown): Response {
  const e =
    error instanceof RoomError
      ? error
      : new RoomError(
          "INTERNAL",
          "Valami félrement. Próbáld újra egy pillanat múlva!",
          500,
        );
  if (!(error instanceof RoomError))
    console.error(
      "Room operation failed",
      error instanceof Error ? error.message : "unknown error",
    );
  return Response.json(
    { error: e.message, code: e.code },
    { status: e.status },
  );
}
export class Room extends DurableObject<Env> {
  private room: StoredRoom | null = null;
  private joins: number[] = [];
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<StoredRoom>("room")) ?? null;
      // Hibernation restores sockets; a restart that loses them must not leave
      // persisted players permanently marked as connected.
      if (this.room) {
        let changed = upgradeRoom(this.room);
        for (const player of this.room.players) {
          if (player.connected && !this.sockets(player.id).length) {
            player.connected = false;
            player.ready = false;
            player.disconnectedAt = Date.now();
            changed = true;
          }
        }
        const d = this.room.display;
        if (d?.connected && !this.sockets(d.id).length) {
          d.connected = false;
          d.disconnectedAt = Date.now();
          changed = true;
        }
        if (changed) {
          this.room.revision++;
          await this.persist();
        }
      }
    });
  }
  private send(ws: WebSocket, message: ServerMessage) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      /* close/error callback owns disconnection */
    }
  }
  private sockets(playerId?: string) {
    return this.ctx
      .getWebSockets()
      .filter(
        (ws) =>
          ws.readyState === WebSocket.OPEN &&
          (!playerId ||
            identity(ws.deserializeAttachment() as Attachment)?.id ===
              playerId),
      );
  }
  private broadcast() {
    if (!this.room) return;

    for (const ws of this.sockets()) {
      const a = ws.deserializeAttachment() as Attachment;
      const viewer = identity(a);
      if (viewer && actor(this.room, viewer))
        this.send(ws, {
          type: "state",
          room: publicRoom(this.room, viewer),
          playerId: viewer.role === "player" ? viewer.id : "",
          identityId: viewer.id,
          role: viewer.role,
          serverTime: Date.now(),
        });
    }
  }
  private async persist() {
    if (this.room) await this.ctx.storage.put("room", this.room);
    await this.scheduleAlarm();
  }
  private async scheduleAlarm() {
    if (!this.room) return;
    const deadlines = [expiry(this.room)];
    if (
      this.room.quiz?.deadline !== null &&
      this.room.quiz?.deadline !== undefined
    )
      deadlines.push(this.room.quiz.deadline);
    for (const p of this.room.players)
      if (!p.connected && !p.graceExpired && p.disconnectedAt !== null)
        deadlines.push(p.disconnectedAt + DISCONNECT_GRACE_MS);
    const d = this.room.display;
    if (d && !d.connected && !d.graceExpired && d.disconnectedAt !== null)
      deadlines.push(d.disconnectedAt + DISCONNECT_GRACE_MS);
    for (const ws of this.sockets()) {
      const a = ws.deserializeAttachment() as Attachment;
      deadlines.push(
        identity(a) ? a.lastSeen + HEARTBEAT_TIMEOUT : a.openedAt + 10_000,
      );
    }
    await this.ctx.storage.setAlarm(
      Math.max(Date.now() + 100, Math.min(...deadlines)),
    );
  }
  private async cleanup(now: number) {
    if (!this.room) return;
    const previousRevision = this.room.revision;
    for (const ws of this.sockets()) {
      const a = ws.deserializeAttachment() as Attachment;
      if (
        (!identity(a) && now - a.openedAt >= 10_000) ||
        (identity(a) && now - a.lastSeen >= HEARTBEAT_TIMEOUT)
      ) {
        ws.serializeAttachment(unauthenticated(a));
        ws.close(4001, "A kapcsolat időtúllépés miatt megszakadt.");
        const viewer = identity(a);
        if (viewer) this.disconnect(viewer, now);
      }
    }
    pruneDisconnected(this.room, now);
    advanceQuiz(this.room, now);
    if (now >= expiry(this.room) || !retainRoom(this.room)) {
      for (const ws of this.sockets()) ws.close(4004, "A szoba lejárt.");
      this.room = null;
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.deleteAlarm();
    } else if (this.room.revision !== previousRevision) {
      // Cleanup can also run before a ping or a rejected action; its changes
      // must persist and reach everyone even when that message has no mutation.
      await this.persist();
      this.broadcast();
    }
  }
  private disconnect(viewer: Identity, now: number) {
    const p = this.room && actor(this.room, viewer);
    if (p && p.connected && !this.sockets(viewer.id).length) {
      p.connected = false;
      if (viewer.role === "player")
        this.room!.players.find((m) => m.id === viewer.id)!.ready = false;
      p.disconnectedAt = now;
      this.room!.revision++;
    }
  }
  async fetch(request: Request): Promise<Response> {
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        const now = Date.now();
        await this.cleanup(now);
        const path = new URL(request.url).pathname;
        if (path === "/create" && request.method === "POST") {
          const input = record(await request.json());
          const hash = await hashCredential(
            validateCredential(input.credential),
          );
          if (this.room && this.room.createHash !== hash)
            throw new RoomError(
              "CODE_COLLISION",
              "Új szobakód szükséges.",
              409,
            );
          const role = validateRole(input.role);
          if (!this.room)
            this.room =
              role === "display"
                ? createDisplayRoom(
                    input.code as string,
                    makeDisplay(hash, now),
                    now,
                  )
                : createRoom(
                    input.code as string,
                    makePlayer(
                      validateNickname(input.nickname),
                      validateCharacter(input.character),
                      hash,
                      now,
                    ),
                    now,
                  );
          const member =
            role === "display"
              ? this.room.display
              : this.room.players.find((p) => p.credentialHash === hash);
          if (!member || member.credentialHash !== hash)
            throw new RoomError(
              "ROLE_CONFLICT",
              "Ezzel a belépéssel másik szerepben jöttél létre. Térj vissza az eredeti szerephez!",
              401,
            );
          await this.persist();
          return Response.json(
            role === "display"
              ? { code: this.room.code, displayId: member.id, role }
              : { code: this.room.code, playerId: member.id },
            { status: 201 },
          );
        }
        if (!this.room)
          throw new RoomError(
            "ROOM_MISSING",
            "Ez a szoba nem létezik vagy már lejárt. Ellenőrizd a kódot!",
            404,
          );
        if (
          (path === "/join" || path === "/resume") &&
          request.method === "POST"
        ) {
          this.joins = this.joins.filter((t) => now - t < 60_000);
          if (this.joins.length >= 30)
            throw new RoomError(
              "RATE_LIMIT",
              "Túl sok belépési kísérlet. Várj egy percet!",
              429,
            );
          this.joins.push(now);
          const input = record(await request.json());
          const hash = await hashCredential(
            validateCredential(input.credential),
          );
          const role = validateRole(input.role);
          if (path === "/join" && role !== "player")
            throw new RoomError(
              "PLAYER_ONLY",
              "A meghívóval játékosként csatlakozhatsz.",
              403,
            );
          if (role === "display") {
            const d = this.room.display;
            if (path !== "/resume" || !d || d.credentialHash !== hash)
              throw new RoomError(
                "UNAUTHORIZED",
                "A kijelző belépése nem érvényes.",
                401,
              );
            return Response.json({
              code: this.room.code,
              displayId: d.id,
              role,
            });
          }
          if (this.room.display?.credentialHash === hash)
            throw new RoomError(
              "ROLE_CONFLICT",
              "A kijelző belépése nem használható játékosként.",
              403,
            );
          const existing = this.room.players.find(
            (p) => p.credentialHash === hash,
          );
          if (path === "/resume" && !existing)
            throw new RoomError(
              "UNAUTHORIZED",
              "A belépésed lejárt. Csatlakozz újra!",
              401,
            );
          const player =
            existing ??
            joinRoom(
              this.room,
              makePlayer(
                validateNickname(input.nickname),
                validateCharacter(input.character),
                hash,
                now,
              ),
            );
          await this.persist();
          this.broadcast();
          return Response.json({ code: this.room.code, playerId: player.id });
        }
        if (
          path === "/socket" &&
          request.headers.get("Upgrade")?.toLowerCase() === "websocket"
        ) {
          if (this.sockets().length >= 24)
            throw new RoomError(
              "RATE_LIMIT",
              "Túl sok kapcsolat. Próbáld újra később!",
              429,
            );
          const pair = new WebSocketPair();
          this.ctx.acceptWebSocket(pair[1]);
          pair[1].serializeAttachment({
            playerId: null,
            displayId: null,
            role: null,
            openedAt: now,
            lastSeen: now,
            requests: [],
          } satisfies Attachment);
          await this.persist();
          return new Response(null, { status: 101, webSocket: pair[0] });
        }
        throw new RoomError("NOT_FOUND", "Ismeretlen kérés.", 404);
      } catch (error) {
        await this.persist();
        return errorResponse(error);
      }
    });
  }
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    await this.ctx.blockConcurrencyWhile(async () => {
      let requestId: string | undefined;
      try {
        await this.cleanup(Date.now());
        if (!this.room)
          throw new RoomError("ROOM_MISSING", "A szoba lejárt.", 404);
        if (typeof raw !== "string" || raw.length > 4096)
          throw new RoomError("INVALID_MESSAGE", "Hibás vagy túl nagy üzenet.");
        let input: Record<string, unknown>;
        try {
          input = record(JSON.parse(raw));
        } catch {
          throw new RoomError(
            "INVALID_MESSAGE",
            "Az üzenetet nem sikerült feldolgozni.",
          );
        }
        const now = Date.now();
        const a = ws.deserializeAttachment() as Attachment;
        a.requests = a.requests.filter((t) => now - t < 10_000);
        if (a.requests.length >= 20)
          throw new RoomError(
            "RATE_LIMIT",
            "Túl gyorsan kattintasz. Várj egy pillanatot!",
            429,
          );
        a.requests.push(now);
        a.lastSeen = now;
        ws.serializeAttachment(a);
        if (input.type === "authenticate") {
          if (identity(a))
            throw new RoomError(
              "INVALID_ACTION",
              "Már csatlakoztál a szobához.",
            );
          const hash = await hashCredential(
            validateCredential(input.credential),
          );
          const role = validateRole(input.role);
          const member =
            role === "display"
              ? this.room.display
              : this.room.players.find((p) => p.credentialHash === hash);
          if (!member || member.credentialHash !== hash)
            throw new RoomError(
              "UNAUTHORIZED",
              "A belépés nem érvényes ehhez a szerephez. Csatlakozz újra!",
              401,
            );
          const viewer: Identity = { role, id: member.id };
          for (const old of this.sockets(member.id))
            if (old !== ws) {
              old.serializeAttachment(
                unauthenticated(old.deserializeAttachment() as Attachment),
              );
              old.close(4002, "A szobát egy másik ablakban nyitottad meg.");
            }
          a.role = role;
          a.playerId = role === "player" ? member.id : null;
          a.displayId = role === "display" ? member.id : null;
          ws.serializeAttachment(a);
          member.connected = true;
          member.disconnectedAt = null;
          member.graceExpired = false;
          // Once a Display has forfeited authority it remains a viewer. Only
          // an authenticated player can fill a vacant player-host role.
          if (
            !this.room.hostId &&
            this.room.hostRole === "player" &&
            viewer.role === "player"
          )
            this.room.hostId = member.id;
          this.room.revision++;
          this.room.lastActivityAt = now;
          await this.persist();
          this.broadcast();
          return;
        }
        const viewer = identity(a);
        if (!viewer)
          throw new RoomError(
            "UNAUTHORIZED",
            "Előbb csatlakozz a szobához!",
            401,
          );
        if (input.type === "ping") {
          this.send(ws, { type: "pong", serverTime: now });
          return;
        }
        if (
          typeof input.requestId !== "string" ||
          !/^[a-f0-9-]{36}$/.test(input.requestId)
        )
          throw new RoomError("INVALID_INPUT", "Hiányzó műveletazonosító.");
        requestId = input.requestId;
        const player = actor(this.room, viewer);
        if (!player)
          throw new RoomError(
            "UNAUTHORIZED",
            "Ez a belépés már nem érvényes.",
            401,
          );
        if (player.recentActions.includes(requestId)) {
          this.send(ws, { type: "ack", requestId });
          return;
        }
        const action = parseAction(input);
        applyAction(this.room, viewer, action, now);
        player.recentActions = [...player.recentActions.slice(-31), requestId];
        await this.persist();
        this.broadcast();
        this.send(ws, { type: "ack", requestId });
        if (action.type === "leave") {
          ws.serializeAttachment(unauthenticated(a));
          ws.close(1000, "Kiléptél a szobából.");
          await this.cleanup(now);
        }
      } catch (error) {
        await this.persist();
        this.broadcast();
        const e =
          error instanceof RoomError
            ? error
            : new RoomError(
                "INTERNAL",
                "A művelet nem sikerült. Próbáld újra!",
              );
        this.send(ws, {
          type: "error",
          code: e.code,
          message: e.message,
          requestId,
        });
        if (e.code === "UNAUTHORIZED" || e.code === "ROOM_MISSING")
          ws.close(e.code === "ROOM_MISSING" ? 4004 : 4003, e.message);
      }
    });
  }
  async webSocketClose(ws: WebSocket, code = 1000, reason = "") {
    // Reply to the close handshake so hibernation/eviction can release the socket.
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
    await this.ctx.blockConcurrencyWhile(async () => {
      const a = ws.deserializeAttachment() as Attachment;
      ws.serializeAttachment(unauthenticated(a));
      const viewer = identity(a);
      if (viewer) this.disconnect(viewer, Date.now());
      await this.cleanup(Date.now());
      await this.persist();
      this.broadcast();
    });
  }
  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }
  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      await this.cleanup(Date.now());
      await this.persist();
      this.broadcast();
    });
  }
}
