import type { Difficulty } from "../../shared/game";
// Explicit numeric IDs remain stable when rows are edited or reordered.
// Correct answer is first only in server-owned authoring data.
export type QuestionDraft = [
  id: number,
  difficulty: Difficulty,
  prompt: string,
  correct: string,
  wrong1: string,
  wrong2: string,
  wrong3: string,
  explanation?: string,
];
