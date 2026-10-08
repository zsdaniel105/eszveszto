import { characterById, type CharacterId } from "../shared/game";
import type { CSSProperties } from "react";

// A reusable emoji/vector frame, deliberately not a finished illustration pack.
// Custom portraits can replace this component without changing character IDs.
const details: Record<CharacterId, string> = {
  maffiamacska: "✦",
  rovidzarlat: "ϟ",
  professzor: "⚗",
  zum: "⋯",
  krumplibaro: "♜",
  paca: "•",
  galambkiraly: "♛",
  csonti: "×",
};
export function CharacterPortrait({
  character,
  className = "avatar",
}: {
  character: CharacterId;
  className?: string;
}) {
  const c = characterById(character);
  return (
    <span
      className={`portrait ${className}`}
      data-character={character}
      style={{ "--character-color": c.color } as CSSProperties}
      aria-hidden="true"
    >
      <svg className="portrait-frame" viewBox="0 0 64 64">
        <path d="M14 5Q32 0 50 5L59 14Q64 32 59 50L50 59Q32 64 14 59L5 50Q0 32 5 14Z" />
        <path className="portrait-glint" d="M13 21Q13 13 23 12" />
      </svg>
      <span className="portrait-glyph">{c.icon}</span>
      <small className="portrait-detail">{details[character]}</small>
    </span>
  );
}
