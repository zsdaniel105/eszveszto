import {
  ABILITIES,
  SABOTAGE_BALANCE,
  type AbilityId,
  type AttackRecord,
  type PlayerEffects,
  type PublicSabotage,
  type SabotageChoice,
} from "../shared/sabotage";
import type { StoredRoom } from "./model";
import { RoomError } from "./model";
import { randomIndex } from "./quiz";
export interface StoredSabotage {
  round: number;
  offers: Record<string, AbilityId[]>;
  choices: Record<string, SabotageChoice>;
  eligiblePlayerIds: string[];
  resolved: boolean;
  attacks: AttackRecord[];
  effects: Record<string, PlayerEffects>;
}
export function offerAbilities(): AbilityId[] {
  const pool: AbilityId[] = ABILITIES.map((a) => a.id);
  const offer: AbilityId[] = [];
  while (offer.length < 3)
    offer.push(pool.splice(randomIndex(pool.length), 1)[0]);
  return offer;
}
export function createSabotage(room: StoredRoom): StoredSabotage {
  const players = room.players.filter((p) =>
    room.quiz!.participants.some((m) => m.id === p.id && !m.left),
  );
  return {
    round: room.quiz!.round,
    offers: Object.fromEntries(players.map((p) => [p.id, offerAbilities()])),
    choices: {},
    eligiblePlayerIds: players.filter((p) => !p.graceExpired).map((p) => p.id),
    resolved: false,
    attacks: [],
    effects: {},
  };
}
function rearrange(order: number[]): number[] {
  // A nonzero rotation guarantees a visible change, without consulting the key.
  const shift = 1 + randomIndex(order.length - 1);
  return [...order.slice(shift), ...order.slice(0, shift)];
}
export function combineEffects(
  attacks: AttackRecord[],
  startsAt: number,
  optionCount: number,
): PlayerEffects {
  const counts = Object.fromEntries(
    ABILITIES.map((a) => [
      a.id,
      attacks.filter((t) => t.abilityId === a.id && t.outcome === "applied")
        .length,
    ]),
  ) as Record<AbilityId, number>;
  const b = SABOTAGE_BALANCE;
  const freezeMs = counts.freeze
    ? b.freezeMs[Math.min(counts.freeze, b.freezeMs.length) - 1]
    : 0;
  let order = Array.from({ length: optionCount }, (_, i) => i);
  const frames: PlayerEffects["frames"] = [];
  let motionMs = 0;
  if (counts.roulette && optionCount > 1) {
    motionMs = b.rouletteMs;
    // More roulette attacks increase the bounded number of visible cycles,
    // never the shared submission lock or motion duration.
    const steps = Math.min(5, 3 + counts.roulette);
    for (let step = 1; step <= steps; step++) {
      order = rearrange(order);
      frames.push({
        at: startsAt + Math.round((step * b.rouletteMs) / steps),
        order,
      });
    }
    // Shuffle contributes to the final arrangement, without adding movement.
    if (counts.shuffle) frames[frames.length - 1].order = rearrange(order);
  } else if (counts.shuffle && optionCount > 1) {
    const steps = Math.min(2, counts.shuffle);
    for (let i = 0; i < steps; i++) {
      order = rearrange(order);
      frames.push({ at: startsAt + b.shuffleAtMs[i], order });
    }
    motionMs = b.shuffleAtMs[steps - 1] + b.shuffleSettleMs;
  }
  const answerUnlockAt =
    startsAt + Math.min(b.maxLockMs, Math.max(freezeMs, motionMs));
  const upsideFrom = answerUnlockAt;
  const upsideUntil =
    upsideFrom +
    (counts["upside-down"]
      ? Math.min(
          b.maxUpsideMs,
          b.upsideMs + (counts["upside-down"] - 1) * b.upsideExtraMs,
        )
      : 0);
  // Readability first: upside-down text and obstructing patches are scheduled
  // consecutively, after motion, instead of obscuring moving inverted answers.
  const overlaysFrom = upsideUntil;
  return {
    counts,
    overlayVersion: 2,
    freezeUntil: startsAt + freezeMs,
    answerUnlockAt,
    motionUnlockAt: startsAt + motionMs,
    iceRequiredTaps: counts.freeze ? (counts.freeze === 1 ? 6 : 7) : 0,
    frames,
    upsideFrom,
    upsideUntil,
    overlaysFrom,
    overlaysUntil: overlaysFrom + (counts.ink ? b.inkMs : b.slimeMs),
    slimeUntil: overlaysFrom + b.slimeMs,
    inkUntil: overlaysFrom + b.inkMs,
    slimeLobes: counts.slime ? Math.min(8, 5 + counts.slime) : 0,
    slimeSteps: counts.slime > 1 ? 4 : 3,
    slimePatches: counts.slime ? 1 : 0, // One shared wipe budget; lobes are cosmetic density.
    inkPatches: counts.ink ? Math.min(b.maxInkGroups, 2 + counts.ink) : 0,
  };
}
export function validTargets(room: StoredRoom, playerId: string) {
  return room.players.filter(
    (p) =>
      p.id !== playerId &&
      !p.graceExpired &&
      room.quiz!.participants.some((m) => m.id === p.id && !m.left),
  );
}
export function commitSabotage(
  room: StoredRoom,
  playerId: string,
  choice: SabotageChoice,
) {
  const s = room.quiz!.sabotage;
  if (room.phase !== "sabotage-selection" || !s || s.resolved)
    throw new RoomError(
      "INVALID_PHASE",
      "Most nem választhatsz szabotázst.",
      409,
    );
  if (s.choices[playerId])
    throw new RoomError(
      "SABOTAGE_LOCKED",
      "Ebben a körben már rögzítettük a döntésedet. Kérdésenként egyszer támadhatsz.",
      409,
    );
  if (!s.offers[playerId])
    throw new RoomError(
      "NOT_PARTICIPANT",
      "Nem vagy ennek a körnek a résztvevője.",
      403,
    );
  if (choice.type === "attack") {
    if (!s.offers[playerId].includes(choice.abilityId))
      throw new RoomError(
        "ABILITY_NOT_OFFERED",
        "Válassz a saját három felkínált képességed közül!",
        400,
      );
    if (choice.targetId === playerId)
      throw new RoomError(
        "SELF_TARGET",
        "Magadat nem támadhatod. Válassz ellenfelet!",
        400,
      );
    if (!validTargets(room, playerId).some((p) => p.id === choice.targetId))
      throw new RoomError(
        "TARGET_UNAVAILABLE",
        "Ez a célpont már nem elérhető. Válassz másik játékost!",
        409,
      );
  }
  s.choices[playerId] = choice;
  const required = s.eligiblePlayerIds.filter((id) =>
    room.players.some((p) => p.id === id && !p.graceExpired),
  );
  return required.length > 0 && required.every((id) => !!s.choices[id]);
}
export function resolveSabotage(
  room: StoredRoom,
  questionStartsAt: number,
): void {
  const s = room.quiz!.sabotage!;
  if (s.resolved) return;
  for (const id of Object.keys(s.offers))
    s.choices[id] ??= { type: "skip", reason: "timeout" };
  s.attacks = Object.entries(s.choices).flatMap(([attackerId, choice]) =>
    choice.type === "attack"
      ? [
          {
            attackerId,
            targetId: choice.targetId,
            abilityId: choice.abilityId,
            outcome: room.quiz!.participants.some(
              (p) => p.id === choice.targetId && !p.left,
            )
              ? ("applied" as const)
              : ("target-left" as const),
          },
        ]
      : [],
  );
  s.effects = Object.fromEntries(
    room.quiz!.participants.map((p) => [
      p.id,
      combineEffects(
        s.attacks.filter((a) => a.targetId === p.id),
        questionStartsAt,
        room.quiz!.options.length,
      ),
    ]),
  );
  s.resolved = true;
}
export function publicSabotage(
  room: StoredRoom,
  viewerId?: string,
): PublicSabotage | null {
  const s = room.quiz!.sabotage;
  if (!s) return null;
  const incoming =
    s.resolved && viewerId
      ? s.attacks.filter((a) => a.targetId === viewerId)
      : [];
  return {
    offers:
      viewerId && room.phase === "sabotage-selection"
        ? [...(s.offers[viewerId] ?? [])]
        : [],
    myChoice: viewerId ? (s.choices[viewerId] ?? null) : null,
    submittedPlayerIds: Object.keys(s.choices),
    targets:
      viewerId && room.phase === "sabotage-selection"
        ? validTargets(room, viewerId).map((p) => ({
            id: p.id,
            nickname: p.nickname,
            character: p.character,
            connected: p.connected,
          }))
        : [],
    incoming,
    outgoing: s.resolved
      ? (s.attacks.find((a) => a.attackerId === viewerId) ?? null)
      : null,
    effects:
      s.resolved &&
      viewerId &&
      (room.phase === "question" ||
        room.phase === "results" ||
        room.phase === "leaderboard")
        ? (s.effects[viewerId] ?? null)
        : null,
    resolved: s.resolved,
  };
}
