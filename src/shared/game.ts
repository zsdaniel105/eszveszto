import type { AbilityId, AttackRecord, PublicSabotage } from "./sabotage";
export type GameMode = "normal" | "tv-party";
export type ConnectionRole = "player" | "display";
export interface Identity {
  role: ConnectionRole;
  id: string;
}
export interface Display {
  id: string;
  connected: boolean;
  disconnectedAt: number | null;
  graceExpired: boolean;
}
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
// Target selection is a local step inside one timed sabotage phase.
export type GamePhase =
  | "lobby"
  | "session"
  | "category-vote"
  | "sabotage-reveal"
  | "sabotage-selection"
  | "target-selection"
  | "question"
  | "results"
  | "leaderboard"
  | "finale"
  | "final-results";
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
  mode: GameMode;
  hostRole: ConnectionRole;
  display: Display | null;
  id: string;
  code: string;
  phase: GamePhase;
  revision: number;
  hostId: string;
  players: Player[];
  settings: Settings;
  settingsRevision: number;
  createdAt: number;
  expiresAt: number;
  session: { id: string; startedAt: number } | null;
  game: PublicGame | null;
  notice: string | null;
}
export type Action =
  | { type: "ready"; value: boolean; settingsRevision: number }
  | { type: "character"; value: CharacterId }
  | { type: "settings"; value: Settings }
  | { type: "start"; settingsRevision: number }
  | { type: "leave" }
  | ({ type: "attack"; abilityId: AbilityId; targetId: string } & PhaseContext)
  | ({ type: "skip-attack" } & PhaseContext)
  | ({ type: "vote"; categoryId: string } & PhaseContext)
  | ({ type: "answer"; optionIndex: number } & PhaseContext)
  | ({ type: "ice-tap" } & PhaseContext)
  | { type: "rematch"; sessionId: string; phaseId: string };
export type ServerMessage =
  | {
      type: "state";
      room: PublicRoom;
      playerId: string;
      identityId?: string;
      role?: ConnectionRole;
      serverTime: number;
    }
  | { type: "ack"; requestId: string }
  | { type: "pong"; serverTime: number }
  | { type: "error"; message: string; code: string; requestId?: string };
export interface Session {
  code: string;
  credential: string;
  role?: ConnectionRole; // Missing on a saved legacy player session.
}
export const characterById = (id: CharacterId) =>
  CHARACTERS.find((c) => c.id === id)!;
// Content stays independent of views and never requires live AI calls.
export type Question = {
  id: string;
  categoryId: string;
  difficulty: Difficulty;
  prompt: string;
  explanation?: string;
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

export const CATEGORIES = [
  { id: "geography", name: "Földrajz", icon: "🌍" },
  { id: "history", name: "Történelem", icon: "🏛️" },
  { id: "film", name: "Filmek és sorozatok", icon: "🎬" },
  { id: "music", name: "Zene", icon: "🎵" },
  { id: "science", name: "Tudomány", icon: "🔬" },
  { id: "animals", name: "Állatvilág", icon: "🐾" },
  { id: "food", name: "Gasztronómia", icon: "🍴" },
  { id: "sport", name: "Sport", icon: "🏅" },
  { id: "games", name: "Videójátékok", icon: "🎮" },
  { id: "hungary", name: "Magyarország", icon: "🇭🇺" },
  { id: "culture", name: "Popkultúra", icon: "✨" },
  { id: "mixed", name: "Vegyes érdekességek", icon: "💡" },
] as const;
export const GAME_TIMING = {
  vote: 8000,
  question: 15000,
  results: 4000,
  leaderboard: 4000,
  finale: 2000,
} as const;
export const FINALE_LENGTH: Record<QuestionCount, number> = {
  6: 2,
  12: 3,
  18: 4,
};
export interface PhaseContext {
  sessionId: string;
  phaseId: string;
  round: number;
}
export interface PublicQuestion {
  id: string;
  categoryId: string;
  type: Question["type"];
  prompt: string;
  options: string[];
  image?: { url: string; alt: string };
}
export interface MatchPlayer {
  id: string;
  nickname: string;
  character: CharacterId;
  joinedAt: number;
  score: number;
  correctAnswers: number;
  answeredQuestions: number;
  responseTimeTotalMs: number;
  left: boolean;
}
export interface Ranking extends MatchPlayer {
  rank: number;
  previousRank: number;
  connected: boolean;
}
export interface AnswerResult {
  playerId: string;
  optionIndex: number | null;
  correct: boolean;
  basePoints: number;
  speedBonus: number;
  multiplier: 1 | 2;
  total: number;
  responseTimeMs: number | null;
  wrongAttempts?: number;
  mistakePenalty?: number;
  attempts?: { optionIndex: number; correct: boolean }[];
}
export interface PublicIce {
  requiredTaps: number;
  acceptedTaps: number;
  broken: boolean;
}
export interface PublicFinale {
  attempts: { optionIndex: number; correct: boolean }[];
  eliminatedOptions: number[];
  wrongAttempts: number;
  finished: boolean;
}
export interface RoundResult {
  correctIndex: number;
  explanation: string | null;
  players: AnswerResult[];
}
export interface PublicGame extends PhaseContext {
  votedPlayerIds: string[];
  sharedAttacks: AttackRecord[];
  startedAt: number;
  deadline: number | null;
  totalQuestions: QuestionCount;
  isFinale: boolean;
  categoryOptions: string[];
  categoryId: string | null;
  voteCounts: Record<string, number>;
  myVote: string | null;
  question: PublicQuestion | null;
  myAnswer: number | null;
  myIce: PublicIce | null;
  myFinale: PublicFinale | null;
  answeredPlayerIds: string[];
  result: RoundResult | null;
  ranking: Ranking[];
  sabotage: PublicSabotage | null;
}
export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id);
