import { describe, expect, it } from "vitest";
import {
  applyAction,
  createRoom,
  expiry,
  joinRoom,
  makePlayer,
  parseAction,
  pruneDisconnected,
  publicRoom,
  validateCharacter,
  validateCredential,
  validateNickname,
  validateSettings,
} from "../src/server/model";
import {
  DISCONNECT_GRACE_MS,
  ROOM_IDLE_MS,
  ROOM_MAX_MS,
} from "../src/shared/game";
const now = 100_000;
function fixture() {
  const host = makePlayer("Házigazda", "paca", "host-hash", now);
  host.connected = true;
  host.disconnectedAt = null;
  const room = createRoom("ABCD234", host, now);
  const guest = makePlayer("Vendég", "zum", "guest-hash", now + 1);
  guest.connected = true;
  guest.disconnectedAt = null;
  joinRoom(room, guest);
  return { room, host, guest };
}
describe("authoritative room rules", () => {
  it("creates a private lobby with the approved defaults", () => {
    const { room, host } = fixture();
    expect(room.hostId).toBe(host.id);
    expect(room.phase).toBe("lobby");
    expect(room.settings).toEqual({ questionCount: 12, difficulty: "normal" });
    expect(publicRoom(room).players[0]).not.toHaveProperty("credentialHash");
    expect(publicRoom(room)).not.toHaveProperty("createHash");
  });
  it("joins and retries the same credential without a duplicate", () => {
    const { room, guest } = fixture();
    expect(
      joinRoom(
        room,
        makePlayer("Más név", "paca", guest.credentialHash, now + 2),
      ).id,
    ).toBe(guest.id);
    expect(room.players).toHaveLength(2);
  });
  it("enforces capacity, including reserved disconnected seats", () => {
    const { room } = fixture();
    for (let i = 2; i < 8; i++)
      joinRoom(room, makePlayer(`Játékos ${i}`, "paca", `hash-${i}`, now));
    expect(() =>
      joinRoom(room, makePlayer("Kilencedik", "paca", "ninth", now)),
    ).toThrow("megtelt");
  });
  it("rejects duplicate normalized nicknames", () => {
    const { room } = fixture();
    expect(() =>
      joinRoom(room, makePlayer("HÁZIGAZDA", "paca", "other", now)),
    ).toThrow("becenevet");
  });
  it("requires all players including the host to be connected and ready", () => {
    const { room, host, guest } = fixture();
    expect(() => applyAction(room, host.id, { type: "start" }, now)).toThrow(
      "késznek",
    );
    applyAction(room, host.id, { type: "ready", value: true }, now);
    applyAction(room, guest.id, { type: "ready", value: true }, now);
    guest.connected = false;
    expect(() => applyAction(room, host.id, { type: "start" }, now)).toThrow(
      "kapcsolódnia",
    );
    guest.connected = true;
    applyAction(room, host.id, { type: "start" }, now);
    expect(room.phase).toBe("session");
    expect(room.session?.startedAt).toBe(now);
  });
  it("rejects a single-player start", () => {
    const { room, host, guest } = fixture();
    applyAction(room, guest.id, { type: "leave" }, now);
    expect(() => applyAction(room, host.id, { type: "start" }, now)).toThrow(
      "két",
    );
  });
  it("does not allow a guest to configure or start", () => {
    const { room, guest } = fixture();
    expect(() =>
      applyAction(
        room,
        guest.id,
        { type: "settings", value: { questionCount: 6, difficulty: "easy" } },
        now,
      ),
    ).toThrow("házigazda");
    expect(() => applyAction(room, guest.id, { type: "start" }, now)).toThrow(
      "házigazda",
    );
  });
  it("resets readiness after settings and cosmetic character changes", () => {
    const { room, host, guest } = fixture();
    host.ready = true;
    guest.ready = true;
    applyAction(
      room,
      guest.id,
      { type: "character", value: "maffiamacska" },
      now,
    );
    expect(guest.character).toBe("maffiamacska");
    expect(guest.ready).toBe(false);
    expect(host.ready).toBe(true);
    applyAction(
      room,
      host.id,
      { type: "settings", value: { questionCount: 18, difficulty: "hard" } },
      now,
    );
    expect(room.players.every((p) => !p.ready)).toBe(true);
  });
  it("allows shared characters", () => {
    const { room, guest } = fixture();
    applyAction(room, guest.id, { type: "character", value: "paca" }, now);
    expect(room.players.every((p) => p.character === "paca")).toBe(true);
  });
  it("locks lobby changes and new joins after start, but permits reconnects", () => {
    const { room, host, guest } = fixture();
    host.ready = guest.ready = true;
    applyAction(room, host.id, { type: "start" }, now);
    expect(() =>
      applyAction(room, guest.id, { type: "ready", value: false }, now),
    ).toThrow("elindult");
    expect(() =>
      joinRoom(room, makePlayer("Új játékos", "paca", "new", now)),
    ).toThrow("elindult");
    expect(
      joinRoom(room, makePlayer("Vendég", "zum", guest.credentialHash, now)).id,
    ).toBe(guest.id);
  });
  it("reserves disconnected identities and transfers host after the grace period", () => {
    const { room, host, guest } = fixture();
    host.connected = false;
    host.disconnectedAt = now;
    expect(pruneDisconnected(room, now + DISCONNECT_GRACE_MS - 1)).toBe(false);
    expect(room.hostId).toBe(host.id);
    expect(pruneDisconnected(room, now + DISCONNECT_GRACE_MS)).toBe(true);
    expect(room.hostId).toBe(guest.id);
  });
  it("transfers to the earliest connected survivor, never another expired player", () => {
    const { room, host, guest } = fixture();
    const third = makePlayer("Harmadik", "csonti", "third", now + 2);
    third.connected = true;
    joinRoom(room, third);
    host.connected = guest.connected = false;
    host.disconnectedAt = guest.disconnectedAt = now;
    pruneDisconnected(room, now + DISCONNECT_GRACE_MS);
    expect(room.hostId).toBe(third.id);
  });
  it("transfers immediately when the host explicitly leaves", () => {
    const { room, host, guest } = fixture();
    applyAction(room, host.id, { type: "leave" }, now);
    expect(room.hostId).toBe(guest.id);
    expect(room.players).toHaveLength(1);
  });
  it("rejects arbitrary identity and validates all incoming fields", () => {
    const { room } = fixture();
    expect(() =>
      applyAction(room, "forged-id", { type: "start" }, now),
    ).toThrow("megszakadt");
    for (const name of ["", "a", "<script>", "a".repeat(21), "x\u0000y"])
      expect(() => validateNickname(name)).toThrow();
    expect(validateNickname("  Árvíz   tűrő  ")).toBe("Árvíz tűrő");
    expect(() => validateCharacter("mario")).toThrow();
    expect(() => validateCredential("plain-player-id")).toThrow();
    expect(() =>
      validateSettings({ questionCount: 100, difficulty: "hard" }),
    ).toThrow();
    expect(() => parseAction({ type: "score", value: 999 })).toThrow();
    expect(() => parseAction({ type: "ready", value: "true" })).toThrow();
  });
  it("uses server-owned idle expiry with a hard lifetime cap", () => {
    const { room } = fixture();
    expect(expiry(room)).toBe(room.lastActivityAt + ROOM_IDLE_MS);
    room.lastActivityAt = now + ROOM_MAX_MS;
    expect(expiry(room)).toBe(now + ROOM_MAX_MS);
  });
});
