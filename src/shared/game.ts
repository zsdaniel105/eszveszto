export const CHARACTERS = [
  {
    id: "maffiamacska",
    name: "Maffiamacska",
    icon: "🐈‍⬛",
    color: "#dcd5fa",
    motto: "Kilenc élet. Nulla kifogás.",
  },
  {
    id: "rovidzarlat",
    name: "Rövidzárlat",
    icon: "🤖",
    color: "#c6e8f3",
    motto: "A hiba a terv része.",
  },
  {
    id: "professzor",
    name: "Professzor Káosz",
    icon: "🧪",
    color: "#d2eac5",
    motto: "Ez tudományosan vicces.",
  },
  {
    id: "zum",
    name: "Züm",
    icon: "🐝",
    color: "#f6e4a4",
    motto: "Kicsi, de nem csendes.",
  },
  {
    id: "krumplibaro",
    name: "Krumplibáró",
    icon: "🥔",
    color: "#f2d4b6",
    motto: "Nemes egyszerűséggel.",
  },
  {
    id: "paca",
    name: "Paca",
    icon: "🐙",
    color: "#f4cbdc",
    motto: "Nyolc kar. Egy nagy ötlet.",
  },
  {
    id: "galambkiraly",
    name: "Galambkirály",
    icon: "🐦",
    color: "#d2e4ee",
    motto: "A tér ura. A válasz kérdéses.",
  },
  {
    id: "csonti",
    name: "Csonti",
    icon: "💀",
    color: "#e1dfd7",
    motto: "Csont nélkül megoldja.",
  },
] as const;
export type CharacterId = (typeof CHARACTERS)[number]["id"];
export type Difficulty = "easy" | "normal" | "hard";
export type QuestionCount = 6 | 12 | 18;
export interface Settings {
  questionCount: QuestionCount;
  difficulty: Difficulty;
}
export const DIFFICULTIES = {
  easy: "Könnyed",
  normal: "Normál",
  hard: "Nehéz",
} as const;
export const DEFAULT_SETTINGS: Settings = {
  questionCount: 12,
  difficulty: "normal",
};
export const MAX_PLAYERS = 8;
export const DISCONNECT_GRACE_MS = 90_000;
export const ROOM_IDLE_MS = 2 * 60 * 60 * 1000;
export const ROOM_MAX_MS = 24 * 60 * 60 * 1000;
export const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{7}$/;
// Future phases are a contract; only lobby and session are implemented in this milestone.
export type GamePhase =
  | "lobby"
  | "session"
  | "category-vote"
  | "sabotage-selection"
  | "target-selection"
  | "question"
  | "results"
  | "leaderboard"
  | "finale";
export interface Player {
  id: string;
  nickname: string;
  character: CharacterId;
  ready: boolean;
  connected: boolean;
  joinedAt: number;
  disconnectedAt: number | null;
}
export interface PublicRoom {
  id: string;
  code: string;
  phase: GamePhase;
  revision: number;
  hostId: string;
  players: Player[];
  settings: Settings;
  createdAt: number;
  expiresAt: number;
  session: { id: string; startedAt: number } | null;
}
export type Action =
  | { type: "ready"; value: boolean }
  | { type: "character"; value: CharacterId }
  | { type: "settings"; value: Settings }
  | { type: "start" }
  | { type: "leave" };
export type ServerMessage =
  | { type: "state"; room: PublicRoom; playerId: string; serverTime: number }
  | { type: "ack"; requestId: string }
  | { type: "pong"; serverTime: number }
  | { type: "error"; message: string; code: string; requestId?: string };
export interface Session {
  code: string;
  credential: string;
}
export const characterById = (id: CharacterId) =>
  CHARACTERS.find((c) => c.id === id)!;
// Content stays independent of views and never requires live AI calls.
export type Question = {
  id: string;
  categoryId: string;
  difficulty: Difficulty;
  prompt: string;
  explanation: string;
} & (
  | { type: "text"; options: string[]; correctIndex: number }
  | {
      type: "image";
      imageUrl: string;
      imageAlt: string;
      options: string[];
      correctIndex: number;
    }
  | { type: "true-false"; correct: boolean }
);
