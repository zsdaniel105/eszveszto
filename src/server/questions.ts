import { CATEGORIES, type Question } from "../shared/game";
import type { QuestionDraft } from "./content/types";
import { answerChecks } from "./content/answer-checks";
import { geographyQuestions } from "./content/geography";
import { historyQuestions } from "./content/history";
import { filmQuestions } from "./content/film";
import { musicQuestions } from "./content/music";
import { scienceQuestions } from "./content/science";
import { animalsQuestions } from "./content/animals";
import { foodQuestions } from "./content/food";
import { sportQuestions } from "./content/sport";
import { gamesQuestions } from "./content/games";
import { hungaryQuestions } from "./content/hungary";
import { cultureQuestions } from "./content/culture";
import { mixedQuestions } from "./content/mixed";

export type PublishedQuestion = Question & {
  status: "published";
  provenance: {
    reference: string;
    origin: "legacy" | "model-drafted";
    review: "model-audited" | "source-checked-answer";
    evidence?: string;
  };
};
// Category references are review starting points, NOT evidence for each answer.
// Only entries in answerChecks were compared against retrieved source passages.
// Neither status implies independent human review. This module stays server-only.
const rows: Record<string, QuestionDraft[]> = {
  geography: geographyQuestions,
  history: historyQuestions,
  film: filmQuestions,
  music: musicQuestions,
  science: scienceQuestions,
  animals: animalsQuestions,
  food: foodQuestions,
  sport: sportQuestions,
  games: gamesQuestions,
  hungary: hungaryQuestions,
  culture: cultureQuestions,
  mixed: mixedQuestions,
};
const references: Record<string, string> = {
  geography: "https://www.britannica.com/science/geography",
  history: "https://www.britannica.com/topic/history",
  film: "https://www.bfi.org.uk/",
  music: "https://www.britannica.com/art/music",
  science: "https://www.britannica.com/science/science",
  animals: "https://animaldiversity.org/",
  food: "https://www.britannica.com/topic/food",
  sport: "https://olympics.com/",
  games: "https://www.britannica.com/topic/electronic-game",
  hungary: "https://www.britannica.com/place/Hungary",
  culture: "https://www.britannica.com/art/literature",
  mixed: "https://www.bipm.org/en/measurement-units",
};

export const QUESTIONS: PublishedQuestion[] = CATEGORIES.flatMap((category) =>
  rows[category.id].map(
    ([number, difficulty, prompt, correct, a, b, c, explanation]) => {
      const id = `${category.id}-${String(number).padStart(2, "0")}`;
      const checked = answerChecks[id];
      return {
        id,
        categoryId: category.id,
        difficulty,
        type: "text" as const,
        prompt,
        options: [correct, a, b, c],
        correctIndex: 0,
        explanation: explanation ?? `A helyes válasz: ${correct}.`,
        status: "published" as const,
        provenance: {
          origin:
            number <= 10 ? ("legacy" as const) : ("model-drafted" as const),
          review: checked
            ? ("source-checked-answer" as const)
            : ("model-audited" as const),
          reference: checked?.reference ?? references[category.id],
          ...(checked ? { evidence: checked.evidence } : {}),
        },
      };
    },
  ),
);
export function normalizeTrivia(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("hu")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
// An editorial flag, not a semantic/factual proof. Shared template with a
// different answer is allowed; near-paraphrases of the same fact are flagged.
export function nearDuplicatePairs(
  questions: PublishedQuestion[],
): [string, string][] {
  const pairs: [string, string][] = [];
  const tokens = questions.map(
    (q) => new Set(normalizeTrivia(q.prompt).split(" ")),
  );
  // Normalize once per row, not for every pair at Worker startup.
  const answers = questions.map((q) =>
    q.type === "text" ? normalizeTrivia(q.options[q.correctIndex]) : null,
  );
  for (let i = 0; i < questions.length; i++)
    for (let j = i + 1; j < questions.length; j++) {
      const a = questions[i],
        b = questions[j];
      if (answers[i] === null || answers[i] !== answers[j]) continue;
      const overlap = [...tokens[i]].filter((t) => tokens[j].has(t)).length;
      const union = new Set([...tokens[i], ...tokens[j]]).size;
      if (union && overlap / union >= 0.85) pairs.push([a.id, b.id]);
    }
  return pairs;
}
export function validateBank(questions: PublishedQuestion[]): void {
  const ids = new Set<string>(),
    prompts = new Set<string>();
  for (const q of questions) {
    const prompt = normalizeTrivia(q.prompt);
    if (
      ids.has(q.id) ||
      prompts.has(prompt) ||
      !CATEGORIES.some((c) => c.id === q.categoryId) ||
      !new RegExp(`^${q.categoryId}-[0-9]{2,}$`).test(q.id) ||
      !["easy", "normal", "hard"].includes(q.difficulty) ||
      q.status !== "published" ||
      !q.provenance.reference.startsWith("https://") ||
      !["legacy", "model-drafted"].includes(q.provenance.origin) ||
      !["model-audited", "source-checked-answer"].includes(
        q.provenance.review,
      ) ||
      (q.provenance.review === "source-checked-answer" &&
        !q.provenance.evidence?.trim())
    )
      throw new Error(`Invalid question metadata: ${q.id}`);
    if (
      q.type !== "text" ||
      q.options.length !== 4 ||
      new Set(q.options.map(normalizeTrivia)).size !== 4 ||
      q.options.some((o) => !normalizeTrivia(o) || o.length > 100) ||
      !Number.isInteger(q.correctIndex) ||
      q.correctIndex < 0 ||
      q.correctIndex >= q.options.length ||
      !prompt ||
      q.prompt.length > 180 ||
      !q.explanation?.trim()
    )
      throw new Error(`Invalid question options: ${q.id}`);
    ids.add(q.id);
    prompts.add(prompt);
  }
  const pairs = nearDuplicatePairs(questions);
  if (pairs.length)
    throw new Error(`Near-duplicate questions: ${JSON.stringify(pairs)}`);
}
validateBank(QUESTIONS);
export const questionById = (id: string) => {
  const q = QUESTIONS.find((q) => q.id === id);
  if (!q) throw new Error(`Missing published question ${id}`);
  return q;
};
