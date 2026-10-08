import {
  CHARACTERS,
  DEFAULT_SETTINGS,
  DISCONNECT_GRACE_MS,
  MAX_PLAYERS,
  ROOM_IDLE_MS,
  ROOM_MAX_MS,
  type Action,
  type CharacterId,
  type Player,
  type PublicRoom,
  type Settings,
} from "../shared/game";
export class RoomError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export interface StoredPlayer extends Player {
  credentialHash: string;
  recentActions: string[];
}
export interface StoredRoom extends Omit<PublicRoom, "players" | "expiresAt"> {
  players: StoredPlayer[];
  lastActivityAt: number;
  createHash: string;
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RoomError("INVALID_INPUT", "Hibás kérés. Próbáld újra!");
  return value as Record<string, unknown>;
}
export function validateCharacter(value: unknown): CharacterId {
  if (!CHARACTERS.some((c) => c.id === value))
    throw new RoomError("INVALID_CHARACTER", "Válassz egy karaktert!");
  return value as CharacterId;
}
export function validateNickname(value: unknown): string {
  if (typeof value !== "string")
    throw new RoomError("INVALID_NICKNAME", "Adj meg egy becenevet!");
  const name = value.normalize("NFC").trim().replace(/\s+/g, " ");
  if ([...name].length < 2 || [...name].length > 20 || /[\p{C}<>]/u.test(name))
    throw new RoomError(
      "INVALID_NICKNAME",
      "A becenév 2–20 karakter lehet, különleges vezérlőjelek nélkül.",
    );
  return name;
}
export function validateCredential(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value))
    throw new RoomError(
      "INVALID_CREDENTIAL",
      "Érvénytelen belépési azonosító. Lépj be újra!",
    );
  return value;
}
export function validateSettings(value: unknown): Settings {
  const s = record(value);
  if (
    ![6, 12, 18].includes(s.questionCount as number) ||
    !["easy", "normal", "hard"].includes(s.difficulty as string)
  )
    throw new RoomError("INVALID_SETTINGS", "Érvénytelen játékbeállítás.");
  return {
    questionCount: s.questionCount as Settings["questionCount"],
    difficulty: s.difficulty as Settings["difficulty"],
  };
}
export function parseAction(value: unknown): Action {
  const a = record(value);
  switch (a.type) {
    case "ready":
      if (typeof a.value !== "boolean") break;
      return {
        type: "ready",
        value: a.value,
        settingsRevision: validateRevision(a.settingsRevision),
      };
    case "character":
      return { type: "character", value: validateCharacter(a.value) };
    case "settings":
      return { type: "settings", value: validateSettings(a.value) };
    case "start":
      return {
        type: "start",
        settingsRevision: validateRevision(a.settingsRevision),
      };
    case "leave":
      return { type: "leave" };
  }
  throw new RoomError("INVALID_ACTION", "Ez a művelet nem érhető el.");
}
function validateRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw new RoomError("INVALID_INPUT", "Hiányzó vagy hibás beállításverzió.");
  return value;
}
export function expiry(room: StoredRoom): number {
  return Math.min(
    room.createdAt + ROOM_MAX_MS,
    room.lastActivityAt + ROOM_IDLE_MS,
  );
}
export function publicRoom(room: StoredRoom): PublicRoom {
  return {
    id: room.id,
    code: room.code,
    phase: room.phase,
    revision: room.revision,
    hostId: room.hostId,
    settings: room.settings,
    settingsRevision: room.settingsRevision,
    createdAt: room.createdAt,
    expiresAt: expiry(room),
    session: room.session,
    players: room.players.map(
      ({ credentialHash: _hash, recentActions: _actions, ...player }) => player,
    ),
  };
}
export function makePlayer(
  nickname: string,
  character: CharacterId,
  credentialHash: string,
  now: number,
): StoredPlayer {
  return {
    id: crypto.randomUUID(),
    nickname,
    character,
    credentialHash,
    recentActions: [],
    ready: false,
    connected: false,
    joinedAt: now,
    disconnectedAt: now,
  };
}
export function createRoom(
  code: string,
  player: StoredPlayer,
  now: number,
): StoredRoom {
  return {
    id: crypto.randomUUID(),
    code,
    phase: "lobby",
    revision: 1,
    hostId: player.id,
    players: [player],
    settings: { ...DEFAULT_SETTINGS },
    settingsRevision: 1,
    createdAt: now,
    lastActivityAt: now,
    session: null,
    createHash: player.credentialHash,
  };
}
export function joinRoom(room: StoredRoom, player: StoredPlayer): StoredPlayer {
  const existing = room.players.find(
    (p) => p.credentialHash === player.credentialHash,
  );
  if (existing) return existing; // Retrying a lost HTTP response cannot create another identity.
  if (room.phase !== "lobby")
    throw new RoomError(
      "ALREADY_STARTED",
      "Ez a játék már elindult. Várd meg a következő partit!",
      409,
    );
  if (room.players.length >= MAX_PLAYERS)
    throw new RoomError(
      "ROOM_FULL",
      "A szoba megtelt. Legfeljebb nyolcan játszhattok.",
      409,
    );
  if (
    room.players.some(
      (p) =>
        p.nickname.toLocaleLowerCase("hu") ===
        player.nickname.toLocaleLowerCase("hu"),
    )
  )
    throw new RoomError(
      "NAME_TAKEN",
      "Ezt a becenevet már használja valaki a szobában.",
      409,
    );
  room.players.push(player);
  room.revision++;
  room.lastActivityAt = player.joinedAt;
  return player;
}
export function removePlayer(room: StoredRoom, id: string): void {
  room.players = room.players.filter((p) => p.id !== id);
  if (room.hostId === id)
    room.hostId =
      [...room.players].sort(
        (a, b) =>
          Number(b.connected) - Number(a.connected) ||
          a.joinedAt - b.joinedAt ||
          a.id.localeCompare(b.id),
      )[0]?.id ?? "";
  room.revision++;
}
export function pruneDisconnected(room: StoredRoom, now: number): boolean {
  const gone = room.players.filter(
    (p) =>
      !p.connected &&
      p.disconnectedAt !== null &&
      now - p.disconnectedAt >= DISCONNECT_GRACE_MS,
  );
  // Remove nonhosts first so transfer never chooses another expired player.
  for (const p of gone.sort(
    (a, b) => Number(a.id === room.hostId) - Number(b.id === room.hostId),
  ))
    removePlayer(room, p.id);
  return gone.length > 0;
}
export function applyAction(
  room: StoredRoom,
  playerId: string,
  action: Action,
  now: number,
): void {
  const player = room.players.find((p) => p.id === playerId);
  if (!player || !player.connected)
    throw new RoomError(
      "UNAUTHORIZED",
      "A kapcsolat megszakadt. Csatlakozz újra!",
      401,
    );
  if (action.type === "leave") {
    removePlayer(room, playerId);
    room.lastActivityAt = now;
    return;
  }
  if (room.phase !== "lobby")
    throw new RoomError(
      "INVALID_PHASE",
      "A játék már elindult; a szoba beállításai lezárultak.",
      409,
    );
  if (action.type === "settings" || action.type === "start") {
    if (room.hostId !== player.id)
      throw new RoomError(
        "HOST_ONLY",
        "Ezt csak a házigazda módosíthatja.",
        403,
      );
  }
  if (
    (action.type === "start" || (action.type === "ready" && action.value)) &&
    action.settingsRevision !== room.settingsRevision
  ) {
    throw new RoomError(
      "SETTINGS_CHANGED",
      "A játékbeállítások megváltoztak. Nézd át, és jelezd újra, hogy kész vagy!",
      409,
    );
  }
  switch (action.type) {
    case "ready":
      player.ready = action.value;
      break;
    case "character":
      player.character = action.value;
      player.ready = false;
      break;
    case "settings":
      room.settings = action.value;
      room.settingsRevision++;
      room.players.forEach((p) => {
        p.ready = false;
      });
      break;
    case "start":
      if (room.players.length < 2 || room.players.length > MAX_PLAYERS)
        throw new RoomError(
          "PLAYER_COUNT",
          "Legalább két játékos kell az induláshoz.",
          409,
        );
      if (room.players.some((p) => !p.ready || !p.connected))
        throw new RoomError(
          "NOT_READY",
          "Minden játékosnak kapcsolódnia kell és késznek kell lennie.",
          409,
        );
      room.phase = "session";
      room.session = { id: crypto.randomUUID(), startedAt: now };
      break;
  }
  room.revision++;
  room.lastActivityAt = now;
}
export async function hashCredential(credential: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(credential),
  );
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
