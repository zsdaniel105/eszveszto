import { isAbilityId, SABOTAGE_BALANCE } from "../shared/sabotage";
import {
  advanceQuiz,
  initializeQuiz,
  publicQuiz,
  quizAction,
  type StoredQuiz,
} from "./quiz";
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
  type ConnectionRole,
  type Display,
  type Identity,
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
  graceExpired: boolean;
}
export interface StoredDisplay extends Display {
  credentialHash: string;
  recentActions: string[];
}
export interface StoredRoom extends Omit<
  PublicRoom,
  "players" | "expiresAt" | "game" | "display"
> {
  display: StoredDisplay | null;
  players: StoredPlayer[];
  lastActivityAt: number;
  createHash: string;
  schemaVersion: 5;
  quiz: StoredQuiz | null;
  recentQuestionIds: string[];
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
export function validateRole(value: unknown): ConnectionRole {
  if (value === undefined || value === "player") return "player";
  if (value === "display") return "display";
  throw new RoomError("INVALID_ROLE", "Érvénytelen kapcsolati szerep.");
}
export function actor(room: StoredRoom, identity: Identity) {
  return identity.role === "display"
    ? room.display?.id === identity.id
      ? room.display
      : undefined
    : room.players.find((p) => p.id === identity.id);
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
    case "attack":
      if (!isAbilityId(a.abilityId)) break;
      return {
        type: "attack",
        abilityId: a.abilityId,
        targetId: validateId(a.targetId),
        ...parseContext(a),
      };
    case "skip-attack":
      return { type: "skip-attack", ...parseContext(a) };
    case "ice-tap":
      return { type: "ice-tap", ...parseContext(a) };
    case "vote": {
      if (typeof a.categoryId !== "string" || a.categoryId.length > 30) break;
      return { type: "vote", categoryId: a.categoryId, ...parseContext(a) };
    }
    case "answer": {
      if (
        typeof a.optionIndex !== "number" ||
        !Number.isInteger(a.optionIndex) ||
        a.optionIndex < 0 ||
        a.optionIndex > 3
      )
        break;
      return { type: "answer", optionIndex: a.optionIndex, ...parseContext(a) };
    }
    case "rematch":
      return {
        type: "rematch",
        sessionId: validateId(a.sessionId),
        phaseId: validateId(a.phaseId),
      };
  }
  throw new RoomError("INVALID_ACTION", "Ez a művelet nem érhető el.");
}
function validateId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      value,
    )
  )
    throw new RoomError("INVALID_INPUT", "Hiányzó vagy hibás játékazonosító.");
  return value;
}
function parseContext(a: Record<string, unknown>) {
  if (
    typeof a.round !== "number" ||
    !Number.isInteger(a.round) ||
    a.round < 1 ||
    a.round > 18
  )
    throw new RoomError("INVALID_INPUT", "Hibás körszám.");
  return {
    sessionId: validateId(a.sessionId),
    phaseId: validateId(a.phaseId),
    round: a.round,
  };
}
export function upgradeRoom(room: StoredRoom): boolean {
  if (room.schemaVersion === 5) return false;
  // v2 active questions/results retain all deadlines, answers and scores.
  if (![2, 3, 4].includes(room.schemaVersion as number)) {
    room.quiz = null;
    room.recentQuestionIds = [];
    room.notice = null;
    room.settingsRevision ??= 1;
    room.players.forEach((p) => {
      p.graceExpired = false;
    });
    if (room.phase === "session") {
      room.phase = "lobby";
      room.session = null;
      room.settingsRevision++;
      room.players.forEach((p) => {
        p.ready = false;
      });
      room.notice =
        "Frissült a játék! Jelezzétek újra, hogy készen álltok, és indulhat a kvíz.";
    }
  }
  if (room.quiz) {
    const q = room.quiz;
    q.sabotage ??= null;
    // A prepared legacy question keeps its single-answer rules, including an
    // active finale. Only newly prepared questions switch to multi-guess.
    q.answeringMode ??= "single";
    q.finaleAttempts ??= {};
    q.iceProgress ??= {};
    for (const e of Object.values(q.sabotage?.effects ?? {})) {
      e.iceRequiredTaps ??= e.counts.freeze
        ? Math.min(5, 2 + e.counts.freeze)
        : 0;
      e.motionUnlockAt ??= e.frames.length
        ? e.frames.at(-1)!.at +
          (e.counts.roulette ? 0 : SABOTAGE_BALANCE.shuffleSettleMs)
        : e.freezeUntil -
          (e.counts.freeze
            ? SABOTAGE_BALANCE.freezeMs[Math.min(4, e.counts.freeze) - 1]
            : 0);
    }
  }
  room.mode ??= "normal";
  room.hostRole ??= "player";
  room.display ??= null;
  room.schemaVersion = 5;
  room.revision++;
  return true;
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
export function publicRoom(
  room: StoredRoom,
  viewer?: string | Identity,
): PublicRoom {
  const identity =
    typeof viewer === "string"
      ? { role: "player" as const, id: viewer }
      : viewer;
  const display = room.display;
  return {
    mode: room.mode,
    hostRole: room.hostRole,
    display: display
      ? {
          id: display.id,
          connected: display.connected,
          disconnectedAt: display.disconnectedAt,
          graceExpired: display.graceExpired,
        }
      : null,
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
    game: publicQuiz(
      room,
      identity?.role === "player" ? identity.id : undefined,
      identity?.role === "display",
    ),
    notice: room.notice,
    players: room.players.map(
      ({
        credentialHash: _hash,
        recentActions: _actions,
        graceExpired: _grace,
        ...player
      }) => player,
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
    graceExpired: false,
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
    mode: "normal",
    hostRole: "player",
    display: null,
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
    schemaVersion: 5,
    quiz: null,
    recentQuestionIds: [],
    notice: null,
  };
}
export function makeDisplay(
  credentialHash: string,
  now: number,
): StoredDisplay {
  return {
    id: crypto.randomUUID(),
    credentialHash,
    recentActions: [],
    connected: false,
    disconnectedAt: now,
    graceExpired: false,
  };
}
export function createDisplayRoom(
  code: string,
  display: StoredDisplay,
  now: number,
): StoredRoom {
  return {
    id: crypto.randomUUID(),
    code,
    mode: "tv-party",
    hostRole: "display",
    display,
    phase: "lobby",
    revision: 1,
    hostId: display.id,
    players: [],
    settings: { ...DEFAULT_SETTINGS },
    settingsRevision: 1,
    createdAt: now,
    lastActivityAt: now,
    session: null,
    createHash: display.credentialHash,
    schemaVersion: 5,
    quiz: null,
    recentQuestionIds: [],
    notice: null,
  };
}
export function joinRoom(room: StoredRoom, player: StoredPlayer): StoredPlayer {
  if (room.display?.credentialHash === player.credentialHash)
    throw new RoomError(
      "ROLE_CONFLICT",
      "A kijelző belépése nem használható játékosként.",
      403,
    );
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
  const participant = room.quiz?.participants.find((p) => p.id === id);
  if (participant) participant.left = true;
  room.players = room.players.filter((p) => p.id !== id);
  if (room.hostRole === "player" && room.hostId === id) transferToPlayer(room);
  room.revision++;
}
function transferToPlayer(room: StoredRoom) {
  room.hostRole = "player";
  room.hostId =
    [...room.players]
      .filter(
        (p) => !p.graceExpired && (room.mode !== "tv-party" || p.connected),
      )
      .sort(
        (a, b) =>
          Number(b.connected) - Number(a.connected) ||
          a.joinedAt - b.joinedAt ||
          a.id.localeCompare(b.id),
      )[0]?.id ?? "";
  if (room.mode === "tv-party")
    room.notice = room.hostId
      ? "A kijelző házigazdai szerepét egy kapcsolódó játékos vette át. A parti folytatódik."
      : "A házigazdai szerepet a következő visszatérő játékos veszi át.";
}
export function leaveDisplay(room: StoredRoom) {
  const id = room.display?.id;
  room.display = null; // Explicit leave revokes this credential, including resume.
  if (room.hostRole === "display" && room.hostId === id) transferToPlayer(room);
  room.revision++;
}
export function retainRoom(room: StoredRoom) {
  return (
    room.players.length > 0 || !!(room.display && !room.display.graceExpired)
  );
}
export function pruneDisconnected(room: StoredRoom, now: number): boolean {
  let displayGone = false;
  const d = room.display;
  if (
    d &&
    !d.connected &&
    !d.graceExpired &&
    d.disconnectedAt !== null &&
    now - d.disconnectedAt >= DISCONNECT_GRACE_MS
  ) {
    d.graceExpired = true;
    displayGone = true;
    room.revision++;
    if (room.hostRole === "display" && room.hostId === d.id)
      transferToPlayer(room);
  }
  const gone = room.players.filter(
    (p) =>
      !p.connected &&
      !p.graceExpired &&
      p.disconnectedAt !== null &&
      now - p.disconnectedAt >= DISCONNECT_GRACE_MS,
  );
  if (room.quiz) {
    for (const p of gone) {
      p.graceExpired = true;
      room.revision++;
    }
    if (
      room.hostRole === "player" &&
      (!room.hostId || gone.some((p) => p.id === room.hostId))
    )
      transferToPlayer(room);
    return displayGone || gone.length > 0;
  }
  // Remove nonhosts first so transfer never chooses another expired player.
  for (const p of gone.sort(
    (a, b) => Number(a.id === room.hostId) - Number(b.id === room.hostId),
  ))
    removePlayer(room, p.id);
  return displayGone || gone.length > 0;
}
export function applyAction(
  room: StoredRoom,
  viewer: string | Identity,
  action: Action,
  now: number,
): void {
  const identity: Identity =
    typeof viewer === "string" ? { role: "player", id: viewer } : viewer;
  const member = actor(room, identity);
  if (!member || !member.connected)
    throw new RoomError(
      "UNAUTHORIZED",
      "A kapcsolat megszakadt. Csatlakozz újra!",
      401,
    );
  if (
    identity.role === "display" &&
    !["settings", "start", "rematch", "leave"].includes(action.type)
  )
    throw new RoomError(
      "PLAYER_ONLY",
      "Ezt a műveletet csak játékos végezheti. A kijelző nem játszik.",
      403,
    );
  const playerId = identity.id;
  const player =
    identity.role === "player"
      ? room.players.find((p) => p.id === playerId)!
      : null;
  if (
    action.type === "rematch" &&
    (room.hostRole !== identity.role || room.hostId !== identity.id)
  )
    throw new RoomError(
      "HOST_ONLY",
      "Az új partit a házigazda nyitja meg.",
      403,
    );
  if (action.type === "leave") {
    if (identity.role === "display") leaveDisplay(room);
    else removePlayer(room, playerId);
    room.lastActivityAt = now;
    return;
  }
  advanceQuiz(room, now);
  if (
    action.type === "vote" ||
    action.type === "answer" ||
    action.type === "rematch" ||
    action.type === "attack" ||
    action.type === "ice-tap" ||
    action.type === "skip-attack"
  ) {
    quizAction(room, playerId, action, now);
    return;
  }
  if (room.phase !== "lobby")
    throw new RoomError(
      "INVALID_PHASE",
      "A játék már elindult; a szoba beállításai lezárultak.",
      409,
    );
  if (action.type === "settings" || action.type === "start") {
    if (room.hostId !== identity.id || room.hostRole !== identity.role)
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
      player!.ready = action.value;
      break;
    case "character":
      player!.character = action.value;
      player!.ready = false;
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
      room.notice = null;
      initializeQuiz(room, now);
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
