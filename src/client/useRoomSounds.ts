import { useEffect, useRef } from "react";
import type { PublicRoom } from "../shared/game";
import { sound, type SoundCue } from "./sound";
export interface CueEvent {
  cue: SoundCue;
  id: string;
}
// Null is a baseline, including refresh midway through a question/result.
export function roomSoundEvents(
  previous: PublicRoom | null,
  room: PublicRoom,
  playerId: string,
): CueEvent[] {
  if (!previous || previous.code !== room.code) return [];
  const game = room.game,
    before = previous.game;
  const mine = room.players.find((p) => p.id === playerId);
  if (!game)
    return mine?.ready &&
      !previous.players.find((p) => p.id === playerId)?.ready
      ? [{ cue: "ready", id: `${room.code}:ready:${room.revision}` }]
      : [];
  const id = `${game.sessionId}:${game.phaseId}`;
  if (
    !before ||
    game.phaseId !== before.phaseId ||
    game.sessionId !== before.sessionId
  ) {
    let cue: SoundCue | null = null;
    switch (room.phase) {
      case "category-vote":
        cue = "category";
        break;
      case "sabotage-selection":
        cue = "sabotage";
        break;
      case "sabotage-reveal":
        cue = game.sabotage?.incoming.length ? "attack" : null;
        break;
      case "question":
        cue = "question";
        break;
      case "results": {
        const result = game.result?.players.find(
          (p) => p.playerId === playerId,
        );
        cue = result?.correct
          ? "correct"
          : result?.optionIndex != null
            ? "wrong"
            : null;
        break;
      }
      case "leaderboard": {
        const p = game.ranking.find((p) => p.id === playerId);
        cue = p && p.rank < p.previousRank ? "rank" : null;
        break;
      }
      case "finale":
        cue = "finale";
        break;
      case "final-results":
        cue =
          game.ranking.find((p) => p.id === playerId)?.rank === 1
            ? "winner"
            : null;
        break;
    }
    return cue ? [{ cue, id }] : [];
  }
  return game.myVote && game.myVote !== before.myVote
    ? [{ cue: "vote", id: `${id}:vote:${game.myVote}:${room.revision}` }]
    : [];
}
export function useRoomSounds(room: PublicRoom | null, playerId: string) {
  const previous = useRef<PublicRoom | null>(null);
  useEffect(() => {
    if (room)
      for (const event of roomSoundEvents(previous.current, room, playerId))
        sound.play(event.cue, event.id, !document.hidden);
    previous.current = room;
  }, [room, playerId]);
}
